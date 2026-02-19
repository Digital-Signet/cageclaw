use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const CONFIG_FILENAME: &str = "cageclaw.toml";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub setup_completed: bool,
    pub openclaw_image: Option<String>,
    pub openclaw_tag: Option<String>,
    pub file_mounts: Vec<FileMount>,
    pub allowed_domains: Vec<DomainRule>,
    pub env_vars: Vec<(String, String)>,
    pub resource_limits: ResourceLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMount {
    pub host_path: String,
    pub container_path: String,
    pub read_only: bool,
    pub blocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainRule {
    pub pattern: String, // e.g. "api.anthropic.com" or "*.googleapis.com"
    pub allowed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    pub memory_mb: Option<i64>,
    pub cpu_cores: Option<f64>,
}

/// Paths that must never be mounted — hardcoded deny list
pub const DENIED_PATHS: &[&str] = &[
    ".ssh",
    ".aws",
    ".azure",
    ".gcp",
    ".config/gcloud",
    ".env",
    ".npmrc",
    ".pypirc",
    ".docker/config.json",
    ".kube",
    "AppData/Local/Google/Chrome",
    "AppData/Local/Microsoft/Edge",
    "AppData/Roaming/Mozilla/Firefox",
    "AppData/Local/BraveSoftware",
    "AppData/Roaming/1Password",
    "AppData/Local/1Password",
    ".gnupg",
    ".pgpass",
    "ntuser.dat",
    ".credentials",
    ".netrc",
];

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            setup_completed: false,
            openclaw_image: None,
            openclaw_tag: None,
            file_mounts: Vec::new(),
            allowed_domains: vec![
                DomainRule {
                    pattern: "api.anthropic.com".into(),
                    allowed: true,
                },
                DomainRule {
                    pattern: "api.openai.com".into(),
                    allowed: true,
                },
                DomainRule {
                    pattern: "generativelanguage.googleapis.com".into(),
                    allowed: true,
                },
                DomainRule {
                    pattern: "registry.npmjs.org".into(),
                    allowed: true,
                },
            ],
            env_vars: Vec::new(),
            resource_limits: ResourceLimits {
                memory_mb: Some(2048),
                cpu_cores: Some(2.0),
            },
        }
    }
}

impl AppConfig {
    pub fn config_dir() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("cageclaw")
    }

    pub fn config_path() -> PathBuf {
        Self::config_dir().join(CONFIG_FILENAME)
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            toml::from_str(&content).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let dir = Self::config_dir();
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let content = toml::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(Self::config_path(), content).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Check if a host path is in the deny list
    pub fn is_path_denied(path: &str) -> bool {
        let normalised = path.replace('\\', "/").to_lowercase();
        DENIED_PATHS
            .iter()
            .any(|denied| normalised.contains(&denied.to_lowercase()))
    }
}
