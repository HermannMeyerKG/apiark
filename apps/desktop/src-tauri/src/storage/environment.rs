use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::models::environment::{EnvironmentFile, EnvironmentScope};

/// Load all environments from both shared and personal directories.
pub fn load_environments(collection_path: &Path) -> Result<Vec<EnvironmentFile>, String> {
    let mut envs = Vec::new();

    // Load shared environments (.apiark/environments/)
    let shared_dir = collection_path.join(".apiark").join("environments");
    load_envs_from_dir(&shared_dir, EnvironmentScope::Shared, &mut envs)?;

    // Load personal environments (.apiark/environments.local/)
    let personal_dir = collection_path.join(".apiark").join("environments.local");
    load_envs_from_dir(&personal_dir, EnvironmentScope::Personal, &mut envs)?;

    envs.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(envs)
}

pub fn default_global_environment_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".apiark").join("global-environment.yaml"))
}

fn empty_global_environment() -> EnvironmentFile {
    EnvironmentFile {
        name: "Globals".to_string(),
        variables: HashMap::new(),
        secrets: Vec::new(),
        scope: EnvironmentScope::Personal,
    }
}

/// Load the app-wide global environment.
pub fn load_global_environment(path: &Path) -> Result<EnvironmentFile, String> {
    if !path.exists() {
        return Ok(empty_global_environment());
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read global environment: {e}"))?;
    let mut env: EnvironmentFile = serde_yaml::from_str(&content)
        .map_err(|e| format!("Invalid global environment YAML {}: {e}", path.display()))?;
    env.name = "Globals".to_string();
    env.scope = EnvironmentScope::Personal;
    Ok(env)
}

/// Save the app-wide global environment.
pub fn save_global_environment(path: &Path, env: &EnvironmentFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create global environment dir: {e}"))?;
    }

    let env = EnvironmentFile {
        name: "Globals".to_string(),
        variables: env.variables.clone(),
        secrets: env.secrets.clone(),
        scope: EnvironmentScope::Personal,
    };
    let yaml = serde_yaml::to_string(&env)
        .map_err(|e| format!("Failed to serialize global environment: {e}"))?;

    let tmp_path = path.with_extension("yaml.tmp");
    fs::write(&tmp_path, &yaml)
        .map_err(|e| format!("Failed to write global environment temp file: {e}"))?;
    fs::rename(&tmp_path, path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to rename global environment temp file: {e}")
    })
}

/// Load variables from the app-wide global environment.
pub fn get_global_variables(path: &Path) -> Result<HashMap<String, String>, String> {
    Ok(load_global_environment(path)?.variables)
}

fn load_envs_from_dir(
    dir: &Path,
    scope: EnvironmentScope,
    envs: &mut Vec<EnvironmentFile>,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read environments dir: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {e}"))?;
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "yaml" || e == "yml") {
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
            let mut env: EnvironmentFile = serde_yaml::from_str(&content)
                .map_err(|e| format!("Invalid environment YAML {}: {e}", path.display()))?;
            env.scope = scope.clone();
            envs.push(env);
        }
    }
    Ok(())
}

/// Parse a .env file into a HashMap.
fn parse_dotenv(path: &Path) -> HashMap<String, String> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return HashMap::new(),
    };

    let mut vars = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        // Skip comments and blank lines
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim().to_string();
            let value = value.trim().to_string();
            // Strip surrounding quotes if present
            let value = if (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''))
            {
                value[1..value.len() - 1].to_string()
            } else {
                value
            };
            vars.insert(key, value);
        }
    }

    vars
}

/// Load variables from the collection root .env file.
pub fn load_root_dotenv(collection_path: &Path) -> HashMap<String, String> {
    let env_path = collection_path.join(".env");
    if !env_path.exists() {
        return HashMap::new();
    }
    parse_dotenv(&env_path)
}

/// Load secrets from the .apiark/.env file.
pub fn load_dotenv_secrets(collection_path: &Path) -> HashMap<String, String> {
    let env_path = collection_path.join(".apiark").join(".env");
    if !env_path.exists() {
        return HashMap::new();
    }
    parse_dotenv(&env_path)
}

/// Resolve all variables for a given environment, merging:
/// 1. Global environment variables (lowest priority)
/// 2. Root .env variables
/// 3. Environment YAML variables
/// 4. .apiark/.env secrets (declared in environment's secrets list) (highest priority)
pub fn get_resolved_variables(
    collection_path: &Path,
    environment_name: &str,
) -> Result<HashMap<String, String>, String> {
    let envs = load_environments(collection_path)?;
    let env = envs
        .iter()
        .find(|e| e.name == environment_name)
        .ok_or_else(|| format!("Environment '{}' not found", environment_name))?;

    let mut variables = default_global_environment_path()
        .and_then(|path| get_global_variables(&path).ok())
        .unwrap_or_default();

    // Override with root .env
    variables.extend(load_root_dotenv(collection_path));

    // Override with environment YAML variables
    variables.extend(env.variables.clone());

    // Override with .apiark/.env secrets (highest priority)
    let secrets = load_dotenv_secrets(collection_path);
    for secret_key in &env.secrets {
        if let Some(value) = secrets.get(secret_key) {
            variables.insert(secret_key.clone(), value.clone());
        }
    }
    Ok(variables)
}

/// Save an environment file to disk. Saves to shared or personal directory based on scope.
pub fn save_environment(collection_path: &Path, env: &EnvironmentFile) -> Result<(), String> {
    let subdir = match env.scope {
        EnvironmentScope::Personal => "environments.local",
        EnvironmentScope::Shared => "environments",
    };
    let env_dir = collection_path.join(".apiark").join(subdir);
    fs::create_dir_all(&env_dir).map_err(|e| format!("Failed to create environments dir: {e}"))?;

    // Ensure .gitignore exists in personal dir
    if matches!(env.scope, EnvironmentScope::Personal) {
        let gitignore = env_dir.join(".gitignore");
        if !gitignore.exists() {
            let _ = fs::write(&gitignore, "*\n!.gitignore\n");
        }
    }

    let filename = env.name.to_lowercase().replace(' ', "-");
    let file_path = env_dir.join(format!("{filename}.yaml"));

    let yaml =
        serde_yaml::to_string(env).map_err(|e| format!("Failed to serialize environment: {e}"))?;

    // Atomic write
    let tmp_path = file_path.with_extension("apiark.tmp");
    fs::write(&tmp_path, &yaml).map_err(|e| format!("Failed to write temp file: {e}"))?;
    fs::rename(&tmp_path, &file_path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to rename temp file: {e}")
    })
}

/// Delete an environment file from disk.
pub fn delete_environment(
    collection_path: &Path,
    name: &str,
    scope: EnvironmentScope,
) -> Result<(), String> {
    let subdir = match scope {
        EnvironmentScope::Personal => "environments.local",
        EnvironmentScope::Shared => "environments",
    };
    let filename = name.to_lowercase().replace(' ', "-");
    let file_path = collection_path
        .join(".apiark")
        .join(subdir)
        .join(format!("{filename}.yaml"));

    if !file_path.exists() {
        return Err(format!("Environment '{name}' not found"));
    }

    fs::remove_file(&file_path).map_err(|e| format!("Failed to delete environment: {e}"))
}
