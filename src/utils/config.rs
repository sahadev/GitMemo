use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    pub git: GitConfig,
    /// Language: "en" or "zh", defaults to "en"
    #[serde(default = "default_lang")]
    pub lang: String,
}

fn default_lang() -> String {
    "en".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitConfig {
    pub remote: String,
    pub branch: String,
}

impl Config {
    pub fn load(config_path: &Path) -> Result<Self> {
        let content = std::fs::read_to_string(config_path)?;
        Ok(toml::from_str(&content)?)
    }

    pub fn save(&self, config_path: &Path) -> Result<()> {
        let content = toml::to_string_pretty(self)?;
        std::fs::write(config_path, content)?;
        Ok(())
    }

    pub fn config_path() -> PathBuf {
        crate::storage::files::sync_dir().join(".metadata").join("config.toml")
    }
}
