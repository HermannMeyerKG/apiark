use std::path::Path;
use std::process::{Command, Stdio};

use tauri::State;

use super::settings::SettingsState;

#[tauri::command]
pub async fn open_request_in_editor(
    path: String,
    state: State<'_, SettingsState>,
) -> Result<(), String> {
    let editor_path = state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .external_editor_path
        .clone()
        .filter(|path| !path.is_empty())
        .ok_or("Choose a code editor in Settings first")?;

    tokio::task::spawn_blocking(move || {
        let mut command = editor_command(Path::new(&editor_path), Path::new(&path))?;
        let mut child = command
            .spawn()
            .map_err(|e| format!("Failed to start code editor: {e}"))?;
        // Reap the process without making the UI wait for the editor to close.
        std::thread::spawn(move || {
            if let Err(error) = child.wait() {
                tracing::warn!("Failed to wait for code editor: {error}");
            }
        });
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

fn editor_command(editor_path: &Path, request_path: &Path) -> Result<Command, String> {
    let request = request_path
        .canonicalize()
        .map_err(|e| format!("Request file is unavailable: {e}"))?;
    if !request.is_file() {
        return Err("The request path must be a file".into());
    }

    let editor = editor_path
        .canonicalize()
        .map_err(|e| format!("The configured code editor is unavailable: {e}"))?;

    #[cfg(target_os = "macos")]
    let app_bundle = editor.is_dir() && editor.extension().is_some_and(|ext| ext == "app");
    #[cfg(not(target_os = "macos"))]
    let app_bundle = false;

    if !app_bundle {
        if !editor.is_file() {
            return Err("Choose the code editor executable in Settings".into());
        }
        #[cfg(windows)]
        if !editor
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
        {
            return Err("Choose the code editor .exe file in Settings".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if editor
                .metadata()
                .map_err(|e| format!("Cannot read code editor permissions: {e}"))?
                .permissions()
                .mode()
                & 0o111
                == 0
            {
                return Err("The configured code editor is not executable".into());
            }
        }
    }

    // Pass the filename as one literal argument, including spaces and Unicode.
    // Never invoke a shell or interpret the configured path as a command line.
    let mut command = if app_bundle {
        let mut command = Command::new("/usr/bin/open");
        command.arg("-a").arg(&editor);
        command
    } else {
        Command::new(&editor)
    };
    command
        .arg(&request)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_the_original_file_as_one_literal_argument() {
        let dir = tempfile::tempdir().unwrap();
        let request = dir.path().join("Anfrage prüfen & testen.yaml");
        std::fs::write(&request, "name: Test").unwrap();
        let editor = std::env::current_exe().unwrap();
        let command = editor_command(&editor, &request).unwrap();
        assert_eq!(
            command.get_program(),
            editor.canonicalize().unwrap().as_os_str()
        );
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            vec![request.canonicalize().unwrap().as_os_str()]
        );
    }

    #[test]
    fn rejects_missing_files_and_directories() {
        let dir = tempfile::tempdir().unwrap();
        let editor = std::env::current_exe().unwrap();
        assert!(editor_command(&editor, &dir.path().join("missing.yaml")).is_err());
        assert!(editor_command(&editor, dir.path()).is_err());
        let request = dir.path().join("request.yaml");
        std::fs::write(&request, "name: Test").unwrap();
        assert!(editor_command(&dir.path().join("missing.exe"), &request).is_err());
        assert!(editor_command(dir.path(), &request).is_err());
    }

    #[test]
    fn editor_setting_is_optional_and_survives_save_and_load() {
        let mut settings: crate::storage::settings::AppSettings =
            serde_json::from_str("{}").unwrap();
        assert!(settings.external_editor_path.is_none());
        settings.external_editor_path = Some("C:\\Code Editor\\Code.exe".into());
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        crate::storage::settings::save_settings(&path, &settings).unwrap();
        let restored = crate::storage::settings::load_settings(&path);
        assert_eq!(restored.external_editor_path, settings.external_editor_path);
    }
}
