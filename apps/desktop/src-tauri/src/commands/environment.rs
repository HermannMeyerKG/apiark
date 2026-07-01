use std::collections::HashMap;
use std::path::Path;

use crate::models::environment::{EnvironmentFile, EnvironmentScope};
use crate::storage::environment;

fn global_environment_path() -> Result<std::path::PathBuf, String> {
    dirs::home_dir()
        .ok_or("Could not determine home directory".to_string())
        .map(|home| home.join(".apiark").join("global-environment.yaml"))
}

/// Load variables from the collection root .env file only (no environment).
#[tauri::command]
pub async fn load_root_dotenv(collection_path: String) -> Result<HashMap<String, String>, String> {
    let path = Path::new(&collection_path);
    Ok(environment::load_root_dotenv(path))
}

#[tauri::command]
pub async fn load_global_environment() -> Result<EnvironmentFile, String> {
    let path = global_environment_path()?;
    environment::load_global_environment(&path)
}

#[tauri::command]
pub async fn save_global_environment(env: EnvironmentFile) -> Result<(), String> {
    let path = global_environment_path()?;
    tracing::debug!("Saving global environment");
    environment::save_global_environment(&path, &env)
}

#[tauri::command]
pub async fn get_global_variables() -> Result<HashMap<String, String>, String> {
    let path = global_environment_path()?;
    environment::get_global_variables(&path)
}

#[tauri::command]
pub async fn load_environments(collection_path: String) -> Result<Vec<EnvironmentFile>, String> {
    let path = Path::new(&collection_path);
    tracing::debug!(path = %collection_path, "Loading environments");
    environment::load_environments(path)
}

#[tauri::command]
pub async fn save_environment(
    collection_path: String,
    env: EnvironmentFile,
    scope: Option<String>,
) -> Result<(), String> {
    let path = Path::new(&collection_path);
    let mut env = env;
    if let Some(ref s) = scope {
        env.scope = match s.as_str() {
            "personal" => EnvironmentScope::Personal,
            _ => EnvironmentScope::Shared,
        };
    }
    tracing::debug!(path = %collection_path, name = %env.name, "Saving environment");
    environment::save_environment(path, &env)
}

#[tauri::command]
pub async fn delete_environment(
    collection_path: String,
    name: String,
    scope: Option<String>,
) -> Result<(), String> {
    let path = Path::new(&collection_path);
    let scope = match scope.as_deref() {
        Some("personal") => EnvironmentScope::Personal,
        _ => EnvironmentScope::Shared,
    };
    tracing::debug!(path = %collection_path, name = %name, "Deleting environment");
    environment::delete_environment(path, &name, scope)
}

/// Resolve all variables for a given environment, merging:
/// 1. Global environment variables (lowest priority)
/// 2. Root .env variables
/// 3. Environment YAML variables
/// 4. .apiark/.env secrets (highest priority)
#[tauri::command]
pub async fn get_resolved_variables(
    collection_path: String,
    environment_name: String,
) -> Result<HashMap<String, String>, String> {
    let path = Path::new(&collection_path);
    environment::get_resolved_variables(path, &environment_name)
}
