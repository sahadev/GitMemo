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
    /// Git remote URL. Empty string means local-only mode.
    #[serde(default)]
    pub remote: String,
    pub branch: String,
}

impl Config {
    /// Whether a remote repository is configured
    pub fn has_remote(&self) -> bool {
        !self.git.remote.is_empty()
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_roundtrip() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let config = Config {
            git: GitConfig {
                remote: "git@github.com:user/repo.git".to_string(),
                branch: "main".to_string(),
            },
            lang: "zh".to_string(),
        };
        config.save(tmp.path()).unwrap();
        let loaded = Config::load(tmp.path()).unwrap();
        assert_eq!(loaded.git.remote, "git@github.com:user/repo.git");
        assert_eq!(loaded.git.branch, "main");
        assert_eq!(loaded.lang, "zh");
    }

    #[test]
    fn test_has_remote() {
        let with_remote = Config {
            git: GitConfig { remote: "https://example.com".to_string(), branch: "main".to_string() },
            lang: "en".to_string(),
        };
        assert!(with_remote.has_remote());

        let without_remote = Config {
            git: GitConfig { remote: String::new(), branch: "main".to_string() },
            lang: "en".to_string(),
        };
        assert!(!without_remote.has_remote());
    }

    #[test]
    fn test_default_lang() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        // Write config without lang field
        std::fs::write(tmp.path(), "[git]\nremote = \"\"\nbranch = \"main\"\n").unwrap();
        let loaded = Config::load(tmp.path()).unwrap();
        assert_eq!(loaded.lang, "en");
    }
}
