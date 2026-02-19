mod commands;
mod config;
mod container;
mod database;
mod proxy;

use config::AppConfig;
use database::Database;
use proxy::ProxyServer;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub container: Arc<Mutex<container::ContainerManager>>,
    pub proxy_domains: Arc<RwLock<Vec<config::DomainRule>>>,
    /// Random token generated per container start — only the embedded
    /// webview knows this, so external browsers can't authenticate.
    pub gateway_token: Arc<RwLock<Option<String>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Database::new().expect("Failed to initialise database");
    let db = Arc::new(Mutex::new(db));

    let container_manager = container::ContainerManager::new();
    let app_config = AppConfig::load();

    // Start the forward proxy
    let proxy = ProxyServer::new(app_config.allowed_domains.clone(), db.clone());
    let proxy_domains = proxy.allowed_domains();

    // Spawn proxy on a background task
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create proxy runtime");
        rt.block_on(async {
            if let Err(e) = proxy.run().await {
                eprintln!("[proxy] server error: {}", e);
            }
        });
    });

    let state = AppState {
        db,
        container: Arc::new(Mutex::new(container_manager)),
        proxy_domains,
        gateway_token: Arc::new(RwLock::new(None)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::detect_runtime,
            commands::get_container_status,
            commands::start_container,
            commands::stop_container,
            commands::restart_container,
            commands::get_container_stats,
            commands::get_network_events,
            commands::get_recent_blocked,
            commands::get_config,
            commands::update_config,
            commands::get_gateway_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CageClaw");
}
