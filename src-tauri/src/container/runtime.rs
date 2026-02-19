use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeInfo {
    pub name: String,
    pub version: String,
    pub api_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ContainerStatus {
    Running,
    Stopped,
    Starting,
    Error(String),
    NotCreated,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ContainerStats {
    pub cpu_percent: f64,
    pub memory_mb: f64,
    pub memory_limit_mb: f64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub uptime_seconds: u64,
}
