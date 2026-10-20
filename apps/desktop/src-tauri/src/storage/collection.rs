use std::collections::HashMap;
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use crate::models::collection::{
    CollectionConfig, CollectionNode, FolderConfig, RequestFile, RequestMeta,
};

/// Load a collection tree from a directory containing `.apiark/apiark.yaml`.
pub fn load_collection_tree(collection_path: &Path) -> Result<CollectionNode, String> {
    let config_path = collection_path.join(".apiark").join("apiark.yaml");
    if !config_path.exists() {
        return Err(format!(
            "Not a valid collection: {} (missing .apiark/apiark.yaml)",
            collection_path.display()
        ));
    }

    let config_content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read collection config: {e}"))?;
    let config: CollectionConfig = serde_yaml::from_str(&config_content)
        .map_err(|e| format!("Invalid collection config YAML: {e}"))?;

    let children = scan_directory(collection_path)?;

    Ok(CollectionNode::Collection {
        name: config.name,
        path: collection_path.to_string_lossy().to_string(),
        children,
    })
}

/// Recursively scan a directory for request YAML files and subfolders.
fn scan_directory(dir: &Path) -> Result<Vec<CollectionNode>, String> {
    let mut folders = Vec::new();
    let mut requests = Vec::new();

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {e}", dir.display()))?;

    // Check for folder ordering
    let folder_config = load_folder_config(dir);
    let order_map: HashMap<String, usize> = folder_config
        .as_ref()
        .map(|fc| {
            fc.order
                .iter()
                .enumerate()
                .map(|(i, name)| (name.clone(), i))
                .collect()
        })
        .unwrap_or_default();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {e}"))?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden dirs/files and special files
        if file_name.starts_with('.') || file_name == "_folder.yaml" {
            continue;
        }

        if path.is_dir() {
            let folder_name = file_name.clone();

            let children = scan_directory(&path)?;
            folders.push((
                order_map.get(&file_name).copied().unwrap_or(usize::MAX),
                CollectionNode::Folder {
                    name: folder_name,
                    path: path.to_string_lossy().to_string(),
                    children,
                },
            ));
        } else if file_name.ends_with(".yaml") || file_name.ends_with(".yml") {
            match read_request_meta(&path) {
                Ok(meta) => {
                    let stem = path
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let detected = meta.detect_protocol();
                    let is_gql = detected == Some("graphql");
                    let protocol = detected.map(|s| s.to_string());
                    requests.push((
                        order_map.get(&stem).copied().unwrap_or(usize::MAX),
                        CollectionNode::Request {
                            name: meta.name,
                            is_graphql: is_gql,
                            method: meta.method,
                            path: path.to_string_lossy().to_string(),
                            protocol,
                        },
                    ));
                }
                Err(e) => {
                    tracing::warn!("Skipping invalid request file {}: {e}", path.display());
                }
            }
        }
    }

    // Sort: folders first (by order then alpha), then requests (by order then alpha)
    folders.sort_by(|a, b| {
        a.0.cmp(&b.0)
            .then_with(|| node_name(&a.1).cmp(node_name(&b.1)))
    });
    requests.sort_by(|a, b| {
        a.0.cmp(&b.0)
            .then_with(|| node_name(&a.1).cmp(node_name(&b.1)))
    });

    let mut result: Vec<CollectionNode> = folders.into_iter().map(|(_, n)| n).collect();
    result.extend(requests.into_iter().map(|(_, n)| n));
    Ok(result)
}

fn node_name(node: &CollectionNode) -> &str {
    match node {
        CollectionNode::Collection { name, .. }
        | CollectionNode::Folder { name, .. }
        | CollectionNode::Request { name, .. } => name,
    }
}

fn load_folder_config(dir: &Path) -> Option<FolderConfig> {
    let path = dir.join("_folder.yaml");
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    serde_yaml::from_str(&content).ok()
}

/// Read only name + method from a request YAML (lightweight).
fn read_request_meta(path: &Path) -> Result<RequestMeta, String> {
    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_yaml::from_str::<RequestMeta>(&content)
        .map_err(|e| format!("Invalid request YAML {}: {e}", path.display()))
}

/// Check if a file contains Git merge conflict markers.
fn has_merge_conflicts(content: &str) -> bool {
    content.contains("<<<<<<<") && content.contains(">>>>>>>")
}

/// Read the full request file.
pub fn read_request(path: &Path) -> Result<RequestFile, String> {
    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    if has_merge_conflicts(&content) {
        return Err(format!("MERGE_CONFLICT:{}", path.display()));
    }
    serde_yaml::from_str::<RequestFile>(&content)
        .map_err(|e| format!("Invalid request YAML {}: {e}", path.display()))
}

/// Write a request file atomically (write to .tmp, then rename).
pub fn write_request(path: &Path, request: &RequestFile) -> Result<(), String> {
    let yaml =
        serde_yaml::to_string(request).map_err(|e| format!("Failed to serialize request: {e}"))?;
    atomic_write(path, &yaml)
}

/// Create a new request YAML file.
pub fn create_request_file(
    dir: &Path,
    filename: &str,
    request: &RequestFile,
) -> Result<PathBuf, String> {
    let file_path = dir.join(format!("{filename}.yaml"));
    if file_path.exists() {
        return Err(format!("File already exists: {}", file_path.display()));
    }
    write_request(&file_path, request)?;
    Ok(file_path)
}

/// Duplicate a saved request in its current folder without overwriting existing files.
pub fn duplicate_request_file(path: &Path, copy_label: &str) -> Result<PathBuf, String> {
    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    if has_merge_conflicts(&content) {
        return Err(format!("MERGE_CONFLICT:{}", path.display()));
    }
    let request: RequestFile = serde_yaml::from_str(&content)
        .map_err(|e| format!("Invalid request YAML {}: {e}", path.display()))?;
    // Keep all YAML fields, including extensions not represented by RequestFile.
    let mut document: serde_yaml::Value =
        serde_yaml::from_str(&content).map_err(|e| format!("Invalid request YAML: {e}"))?;
    let dir = path.parent().ok_or("Request has no parent directory")?;
    let stem = path
        .file_stem()
        .ok_or("Request has no filename")?
        .to_string_lossy();

    for number in 1u64.. {
        let (filename, label) = if number == 1 {
            (format!("{stem}-copy.yaml"), copy_label.to_string())
        } else {
            (
                format!("{stem}-copy-{number}.yaml"),
                format!("{copy_label} {number}"),
            )
        };
        document["name"] = serde_yaml::Value::String(format!("{} ({label})", request.name));
        let yaml = serde_yaml::to_string(&document)
            .map_err(|e| format!("Failed to serialize request: {e}"))?;
        let destination = dir.join(filename);
        // Reserve the name exclusively, including when two copies are made concurrently.
        let mut file = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&destination)
        {
            Ok(file) => file,
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Failed to create request copy: {error}")),
        };
        if let Err(error) = file.write_all(yaml.as_bytes()) {
            drop(file);
            let _ = fs::remove_file(&destination);
            return Err(format!("Failed to write request copy: {error}"));
        }
        return Ok(destination);
    }
    Err("Could not find an available filename for the request copy".to_string())
}

/// Create a folder in a collection.
pub fn create_folder(parent: &Path, name: &str) -> Result<PathBuf, String> {
    let folder_path = parent.join(name);
    if folder_path.exists() {
        return Err(format!("Folder already exists: {}", folder_path.display()));
    }
    fs::create_dir_all(&folder_path).map_err(|e| format!("Failed to create folder: {e}"))?;
    Ok(folder_path)
}

/// Delete an item (file or folder) by moving it to trash.
/// Moves an item to trash. Returns the trash directory path for undo support.
pub fn delete_item(path: &Path, collection_name: &str) -> Result<String, String> {
    let trash_base = dirs::home_dir()
        .ok_or("Could not determine home directory")?
        .join(".apiark")
        .join("trash")
        .join(collection_name);

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let item_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let trash_dir = trash_base.join(format!("{timestamp}_{item_name}"));

    fs::create_dir_all(&trash_dir).map_err(|e| format!("Failed to create trash dir: {e}"))?;

    let dest = trash_dir.join(&item_name);
    if path.is_dir() {
        copy_dir_all(path, &dest)?;
        fs::remove_dir_all(path).map_err(|e| format!("Failed to remove original dir: {e}"))?;
    } else {
        fs::copy(path, &dest).map_err(|e| format!("Failed to copy to trash: {e}"))?;
        fs::remove_file(path).map_err(|e| format!("Failed to remove original file: {e}"))?;
    }

    Ok(trash_dir.to_string_lossy().to_string())
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create dir: {e}"))?;
    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read dir: {e}"))? {
        let entry = entry.map_err(|e| format!("Dir entry error: {e}"))?;
        let dest_path = dst.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), &dest_path).map_err(|e| format!("Failed to copy file: {e}"))?;
        }
    }
    Ok(())
}

/// Move an item within a collection, preserving its name and contents.
pub fn move_item(
    path: &Path,
    destination: &Path,
    collection_path: &Path,
) -> Result<PathBuf, String> {
    let root =
        fs::canonicalize(collection_path).map_err(|e| format!("Invalid collection path: {e}"))?;
    if !root.join(".apiark").join("apiark.yaml").is_file() {
        return Err("Not a valid collection".to_string());
    }
    let source = fs::canonicalize(path).map_err(|e| format!("Invalid source path: {e}"))?;
    let target =
        fs::canonicalize(destination).map_err(|e| format!("Invalid destination path: {e}"))?;
    if source == root || !source.starts_with(&root) || !target.starts_with(&root) {
        return Err("Items can only be moved within their collection".to_string());
    }
    if !target.is_dir() {
        return Err("Destination must be a folder".to_string());
    }
    if target.starts_with(&source) {
        return Err("Cannot move a folder into itself or one of its subfolders".to_string());
    }
    // Keep collection metadata and hidden directories out of the tree operation.
    for item in [&source, &target] {
        if item
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?
            .components()
            .any(|part| {
                let name = part.as_os_str().to_string_lossy();
                name.starts_with('.') || name == "_folder.yaml"
            })
        {
            return Err("Collection metadata cannot be moved".to_string());
        }
    }
    let filename = source.file_name().ok_or("Cannot determine item name")?;
    let new_path = target.join(filename);
    if source.parent() == Some(target.as_path()) {
        return Ok(destination.join(filename));
    }
    if new_path.exists() {
        return Err(
            "A file or folder with that name already exists at the destination".to_string(),
        );
    }
    fs::rename(&source, &new_path).map_err(|e| format!("Failed to move item: {e}"))?;
    // Return the original path style, without canonical Windows extended-path prefixes.
    Ok(destination.join(filename))
}

/// Rename a file or folder.
pub fn rename_item(path: &Path, new_name: &str) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or("Cannot get parent directory")?;

    // Sanitize the name for use as a filename:
    // replace characters illegal on Windows and problematic on other OSes
    let safe_name: String = new_name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string();

    if safe_name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }

    let new_path = if path.is_dir() {
        parent.join(&safe_name)
    } else {
        // Preserve .yaml extension for request files
        let ext = path.extension().map(|e| e.to_string_lossy().to_string());
        if let Some(ext) = ext {
            parent.join(format!("{safe_name}.{ext}"))
        } else {
            parent.join(&safe_name)
        }
    };

    if new_path.exists() {
        return Err("A file or folder with that name already exists".to_string());
    }

    fs::rename(path, &new_path).map_err(|e| format!("Failed to rename: {e}"))?;

    // If it's a request YAML, also update the name field inside
    if new_path.is_file() {
        if let Ok(mut request) = read_request(&new_path) {
            request.name = new_name.to_string();
            let _ = write_request(&new_path, &request);
        }
    }

    // If it's a collection directory, update the name in .apiark/apiark.yaml
    if new_path.is_dir() {
        let config_path = new_path.join(".apiark").join("apiark.yaml");
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(mut config) = serde_yaml::from_str::<CollectionConfig>(&content) {
                    config.name = new_name.to_string();
                    if let Ok(yaml) = serde_yaml::to_string(&config) {
                        let _ = fs::write(&config_path, yaml);
                    }
                }
            }
        }
    }

    Ok(new_path)
}

/// Save the ordering of items within a folder by writing/updating `_folder.yaml`.
pub fn save_folder_order(dir: &Path, order: &[String]) -> Result<(), String> {
    let config_path = dir.join("_folder.yaml");

    // Load existing config or create new
    let mut config = load_folder_config(dir).unwrap_or(FolderConfig {
        name: None,
        auth: None,
        order: Vec::new(),
    });
    config.order = order.to_vec();

    let yaml = serde_yaml::to_string(&config)
        .map_err(|e| format!("Failed to serialize folder config: {e}"))?;
    atomic_write(&config_path, &yaml)
}

/// Load the collection config from .apiark/apiark.yaml.
pub fn load_collection_config(collection_path: &Path) -> Result<CollectionConfig, String> {
    let config_path = collection_path.join(".apiark").join("apiark.yaml");
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read collection config: {e}"))?;
    serde_yaml::from_str(&content).map_err(|e| format!("Invalid collection config YAML: {e}"))
}

/// Save the collection config to .apiark/apiark.yaml (atomic write).
pub fn save_collection_config(
    collection_path: &Path,
    config: &CollectionConfig,
) -> Result<(), String> {
    let config_path = collection_path.join(".apiark").join("apiark.yaml");
    let yaml = serde_yaml::to_string(config)
        .map_err(|e| format!("Failed to serialize collection config: {e}"))?;
    atomic_write(&config_path, &yaml)
}

/// Write content atomically: write to .tmp file, then rename.
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let tmp_path = path.with_extension("apiark.tmp");
    fs::write(&tmp_path, content).map_err(|e| format!("Failed to write temp file: {e}"))?;
    fs::rename(&tmp_path, path).map_err(|e| {
        // Clean up tmp file on rename failure
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to rename temp file: {e}")
    })
}

#[cfg(test)]
mod duplicate_tests {
    use super::*;

    #[test]
    fn duplicates_all_request_fields_in_the_same_folder() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("Unterordner");
        fs::create_dir(&folder).unwrap();
        let source = folder.join("request.yml");
        let content = r#"name: Anfrage prüfen
method: POST
url: https://example.com/graphql
protocol: graphql
description: Beschreibung
headers:
  Content-Type: application/json
auth:
  type: bearer
  token: test-token
body:
  type: json
  content: '{"query":"{ users { id } }"}'
params:
  page: '1'
preRequestScript: console.log('before')
postResponseScript: console.log('after')
tests: console.log('test')
assert:
  status: 200
cookies:
  session: example
customField:
  keep: true
"#;
        fs::write(&source, content).unwrap();
        let destination = duplicate_request_file(&source, "Kopie").unwrap();
        assert_eq!(destination, folder.join("request-copy.yaml"));
        assert_eq!(fs::read_to_string(&source).unwrap(), content);
        let mut expected: serde_yaml::Value = serde_yaml::from_str(content).unwrap();
        expected["name"] = serde_yaml::Value::String("Anfrage prüfen (Kopie)".into());
        let actual: serde_yaml::Value =
            serde_yaml::from_str(&fs::read_to_string(&destination).unwrap()).unwrap();
        assert_eq!(actual, expected);
        assert_eq!(
            read_request(&destination).unwrap().name,
            "Anfrage prüfen (Kopie)"
        );
    }

    #[test]
    fn numbers_copies_and_preserves_existing_files() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("request.yaml");
        fs::write(&source, "name: Test\nmethod: GET\nurl: ''\n").unwrap();
        let existing = dir.path().join("request-copy.yaml");
        fs::write(&existing, "keep").unwrap();
        for number in 2..=3 {
            let copy = duplicate_request_file(&source, "Kopie").unwrap();
            assert_eq!(copy, dir.path().join(format!("request-copy-{number}.yaml")));
            assert_eq!(
                read_request(&copy).unwrap().name,
                format!("Test (Kopie {number})")
            );
        }
        assert_eq!(fs::read_to_string(existing).unwrap(), "keep");
    }

    #[test]
    fn rejects_invalid_missing_and_conflicted_requests_without_creating_a_copy() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("request.yaml");
        assert!(duplicate_request_file(&source, "Copy").is_err());
        for content in ["not a request", "<<<<<<< HEAD\n=======\n>>>>>>> branch\n"] {
            fs::write(&source, content).unwrap();
            assert!(duplicate_request_file(&source, "Copy").is_err());
            assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        }
    }
}

#[cfg(test)]
mod move_tests {
    use super::*;

    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join(".apiark")).unwrap();
        fs::write(dir.path().join(".apiark/apiark.yaml"), "name: Test\n").unwrap();
        fs::create_dir_all(dir.path().join("A/Nested")).unwrap();
        fs::create_dir(dir.path().join("B")).unwrap();
        fs::write(
            dir.path().join("A/Nested/request.yaml"),
            "name: Test\nmethod: GET\nurl: ''\n",
        )
        .unwrap();
        dir
    }

    #[test]
    fn moves_folder_with_contents_and_back_to_root() {
        let dir = fixture();
        let root = dir.path();
        let moved = move_item(&root.join("A"), &root.join("B"), root).unwrap();
        assert_eq!(moved, root.join("B/A"));
        assert!(!root.join("A").exists());
        assert!(moved.join("Nested/request.yaml").is_file());
        let restored = move_item(&moved, root, root).unwrap();
        assert_eq!(restored, root.join("A"));
        assert!(restored.join("Nested/request.yaml").is_file());
    }

    #[test]
    fn rejects_self_descendants_and_collection_root() {
        let dir = fixture();
        let root = dir.path();
        for destination in [root.join("A"), root.join("A/Nested")] {
            assert!(move_item(&root.join("A"), &destination, root).is_err());
        }
        assert!(move_item(root, &root.join("B"), root).is_err());
        assert!(root.join("A/Nested/request.yaml").is_file());
    }

    #[test]
    fn rejects_collisions_without_overwriting() {
        let dir = fixture();
        let root = dir.path();
        fs::create_dir(root.join("B/A")).unwrap();
        fs::write(root.join("B/A/keep.txt"), "keep").unwrap();
        assert!(move_item(&root.join("A"), &root.join("B"), root).is_err());
        assert_eq!(
            fs::read_to_string(root.join("B/A/keep.txt")).unwrap(),
            "keep"
        );
        assert!(root.join("A/Nested/request.yaml").is_file());
    }

    #[test]
    fn rejects_outside_paths_metadata_and_missing_destinations() {
        let dir = fixture();
        let outside = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert!(move_item(&root.join("A"), outside.path(), root).is_err());
        assert!(move_item(outside.path(), &root.join("B"), root).is_err());
        assert!(move_item(&root.join(".apiark"), &root.join("B"), root).is_err());
        assert!(move_item(&root.join("A"), &root.join(".apiark"), root).is_err());
        assert!(move_item(&root.join("A"), &root.join("Missing"), root).is_err());
    }

    #[test]
    fn moves_request_without_changing_content_and_allows_noop() {
        let dir = fixture();
        let root = dir.path();
        let source = root.join("A/Nested/request.yaml");
        let original = fs::read(&source).unwrap();
        assert_eq!(
            move_item(&source, &root.join("A/Nested"), root).unwrap(),
            source
        );
        let moved = move_item(&source, &root.join("B"), root).unwrap();
        assert_eq!(fs::read(moved).unwrap(), original);
        assert!(!source.exists());
    }
}
