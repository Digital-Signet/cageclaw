mod docker;
pub mod runtime;

pub use runtime::{ContainerStats, ContainerStatus, RuntimeInfo};

use crate::config::AppConfig;
use docker::DockerRuntime;

pub struct ContainerManager {
    runtime: Option<DockerRuntime>,
}

impl ContainerManager {
    pub fn new() -> Self {
        Self { runtime: None }
    }

    pub async fn detect_runtime(&mut self) -> Result<RuntimeInfo, String> {
        let rt = DockerRuntime::try_connect()
            .await
            .map_err(|e| format!("No container runtime found: {}. Install Docker Desktop or Podman Desktop.", e))?;
        let info = rt.info().await.map_err(|e| e.to_string())?;
        self.runtime = Some(rt);
        Ok(info)
    }

    /// Start the container and return the gateway token.
    pub async fn start(&mut self, config: &AppConfig) -> Result<String, String> {
        let rt = self.runtime.as_mut().ok_or("No runtime detected")?;
        rt.start_container(config).await.map_err(|e| e.to_string())
    }

    pub async fn stop(&mut self) -> Result<(), String> {
        let rt = self.runtime.as_mut().ok_or("No runtime detected")?;
        rt.stop_container().await.map_err(|e| e.to_string())
    }

    pub async fn restart(&mut self, config: &AppConfig) -> Result<String, String> {
        let rt = self.runtime.as_mut().ok_or("No runtime detected")?;
        let _ = rt.stop_container().await;
        rt.start_container(config).await.map_err(|e| e.to_string())
    }

    pub async fn status(&self) -> Result<ContainerStatus, String> {
        let rt = self.runtime.as_ref().ok_or("No runtime detected")?;
        rt.container_status().await.map_err(|e| e.to_string())
    }

    pub async fn stats(&self) -> Result<ContainerStats, String> {
        let rt = self.runtime.as_ref().ok_or("No runtime detected")?;
        rt.container_stats().await.map_err(|e| e.to_string())
    }
}
