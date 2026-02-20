use crate::config::AppConfig;
use crate::container::{ContainerStats, ContainerStatus, RuntimeInfo};
use crate::database::NetworkEvent;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn detect_runtime(state: State<'_, AppState>) -> Result<RuntimeInfo, String> {
    let mut container = state.container.lock().await;
    container.detect_runtime().await
}

#[tauri::command]
pub async fn get_container_status(state: State<'_, AppState>) -> Result<ContainerStatus, String> {
    let container = state.container.lock().await;
    container.status().await
}

#[tauri::command]
pub async fn start_container(state: State<'_, AppState>) -> Result<(), String> {
    let config = AppConfig::load();
    let mut container = state.container.lock().await;
    let token = container.start(&config).await?;
    drop(container);

    let mut t = state.gateway_token.write().await;
    *t = Some(token);
    Ok(())
}

#[tauri::command]
pub async fn stop_container(state: State<'_, AppState>) -> Result<(), String> {
    let mut container = state.container.lock().await;
    container.stop().await?;
    drop(container);

    let mut t = state.gateway_token.write().await;
    *t = None;
    Ok(())
}

#[tauri::command]
pub async fn restart_container(state: State<'_, AppState>) -> Result<(), String> {
    let config = AppConfig::load();
    let mut container = state.container.lock().await;
    let token = container.restart(&config).await?;
    drop(container);

    let mut t = state.gateway_token.write().await;
    *t = Some(token);
    Ok(())
}

#[tauri::command]
pub async fn get_container_stats(state: State<'_, AppState>) -> Result<ContainerStats, String> {
    let container = state.container.lock().await;
    container.stats().await
}

#[tauri::command]
pub async fn get_network_events(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<NetworkEvent>, String> {
    let db = state.db.lock().await;
    db.get_network_events(limit.unwrap_or(100), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

/// Returns distinct blocked hosts since a given ISO timestamp.
/// Used by the frontend toast notification system.
#[tauri::command]
pub async fn get_recent_blocked(
    state: State<'_, AppState>,
    since: String,
) -> Result<Vec<String>, String> {
    let db = state.db.lock().await;
    db.get_recent_blocked_hosts(&since)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_config() -> Result<AppConfig, String> {
    Ok(AppConfig::load())
}

#[tauri::command]
pub async fn update_config(
    state: State<'_, AppState>,
    config: AppConfig,
) -> Result<(), String> {
    // Enforce deny list — reject configs that mount sensitive paths
    for mount in &config.file_mounts {
        if AppConfig::is_path_denied(&mount.host_path) {
            return Err(format!(
                "Mount blocked: '{}' matches a sensitive path in the deny list",
                mount.host_path
            ));
        }
    }

    // Sync domain allowlist to the running proxy in real time
    let mut domains = state.proxy_domains.write().await;
    *domains = config.allowed_domains.clone();
    drop(domains);

    config.save()
}

/// Returns the gateway URL with the embedded auth token, or null if
/// the container isn't running. Only the CageClaw webview uses this.
#[tauri::command]
pub async fn get_gateway_url(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let token = state.gateway_token.read().await;
    Ok(token
        .as_ref()
        .map(|t| format!("http://localhost:18790/?token={}", t)))
}
