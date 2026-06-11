use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use gitmemo_core::services::secrets::SecretKind;
use gitmemo_core::storage::files;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const VAULT_DIR: &str = "vault";
const VAULT_ENTRIES_DIR: &str = "entries";
const VAULT_INDEX_FILE: &str = "index.json";
const VAULT_CONFIG_FILE: &str = "config.json";
const VAULT_CHECK_FILE: &str = ".check.gmvault";
const KDF_MEMORY_COST: u32 = 19_456;
const KDF_TIME_COST: u32 = 2;
const KDF_PARALLELISM: u32 = 1;

static VAULT_SESSION: OnceLock<Mutex<Option<[u8; 32]>>> = OnceLock::new();

fn session_key() -> &'static Mutex<Option<[u8; 32]>> {
    VAULT_SESSION.get_or_init(|| Mutex::new(None))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VaultEntryKind {
    Password,
    ApiKey,
    Token,
    Jwt,
    PrivateKey,
    KeystorePassword,
    Secret,
}

impl From<SecretKind> for VaultEntryKind {
    fn from(kind: SecretKind) -> Self {
        match kind {
            SecretKind::Password => Self::Password,
            SecretKind::ApiKey | SecretKind::CloudKey => Self::ApiKey,
            SecretKind::Token => Self::Token,
            SecretKind::Jwt => Self::Jwt,
            SecretKind::PrivateKey => Self::PrivateKey,
            SecretKind::KeystorePassword => Self::KeystorePassword,
            SecretKind::Unknown => Self::Secret,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntryMeta {
    pub id: String,
    pub title: String,
    pub kind: VaultEntryKind,
    pub source: String,
    pub tags: Vec<String>,
    pub fingerprint: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct VaultIndex {
    entries: Vec<VaultEntryMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VaultConfig {
    version: u32,
    kdf: String,
    salt: String,
    memory_cost: u32,
    time_cost: u32,
    parallelism: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VaultCipherFile {
    version: u32,
    cipher: String,
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VaultSecretPayload {
    secret: String,
    note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
    pub entries_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntryDetail {
    pub meta: VaultEntryMeta,
    pub secret: String,
    pub note: String,
}

fn vault_root() -> PathBuf {
    files::sync_dir().join(VAULT_DIR)
}

fn entries_dir() -> PathBuf {
    vault_root().join(VAULT_ENTRIES_DIR)
}

fn index_path() -> PathBuf {
    vault_root().join(VAULT_INDEX_FILE)
}

fn config_path() -> PathBuf {
    vault_root().join(VAULT_CONFIG_FILE)
}

fn check_path() -> PathBuf {
    vault_root().join(VAULT_CHECK_FILE)
}

fn ensure_vault_dirs() -> Result<(), String> {
    std::fs::create_dir_all(entries_dir()).map_err(|e| e.to_string())
}

fn load_index() -> VaultIndex {
    std::fs::read_to_string(index_path())
        .ok()
        .and_then(|content| serde_json::from_str::<VaultIndex>(&content).ok())
        .unwrap_or_default()
}

fn save_index(index: &VaultIndex) -> Result<(), String> {
    ensure_vault_dirs()?;
    let content = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    std::fs::write(index_path(), content).map_err(|e| e.to_string())
}

fn now_rfc3339() -> String {
    chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    OsRng.fill_bytes(&mut bytes);
    bytes
}

fn new_entry_id() -> String {
    let random = random_bytes::<8>();
    format!(
        "{}-{}",
        chrono::Utc::now().format("%Y%m%d%H%M%S%3f"),
        hex::encode(random)
    )
}

fn derive_key(password: &str, config: &VaultConfig) -> Result<[u8; 32], String> {
    let salt = BASE64.decode(&config.salt).map_err(|e| e.to_string())?;
    let params = argon2::Params::new(
        config.memory_cost,
        config.time_cost,
        config.parallelism,
        Some(32),
    )
    .map_err(|e| e.to_string())?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), &salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

fn create_config(password: &str) -> Result<(VaultConfig, [u8; 32]), String> {
    let salt = random_bytes::<16>();
    let config = VaultConfig {
        version: 1,
        kdf: "argon2id".into(),
        salt: BASE64.encode(salt),
        memory_cost: KDF_MEMORY_COST,
        time_cost: KDF_TIME_COST,
        parallelism: KDF_PARALLELISM,
    };
    let key = derive_key(password, &config)?;
    Ok((config, key))
}

fn load_config() -> Result<VaultConfig, String> {
    let content = std::fs::read_to_string(config_path()).map_err(|_| "Vault is not initialized")?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn cipher_for_key(key: &[u8; 32]) -> XChaCha20Poly1305 {
    XChaCha20Poly1305::new(Key::from_slice(key))
}

fn encrypt_payload(key: &[u8; 32], plaintext: &[u8]) -> Result<VaultCipherFile, String> {
    let nonce = random_bytes::<24>();
    let cipher = cipher_for_key(key);
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), plaintext)
        .map_err(|_| "Vault encryption failed".to_string())?;
    Ok(VaultCipherFile {
        version: 1,
        cipher: "xchacha20poly1305".into(),
        nonce: BASE64.encode(nonce),
        ciphertext: BASE64.encode(ciphertext),
    })
}

fn decrypt_payload(key: &[u8; 32], file: &VaultCipherFile) -> Result<Vec<u8>, String> {
    let nonce = BASE64.decode(&file.nonce).map_err(|e| e.to_string())?;
    let ciphertext = BASE64.decode(&file.ciphertext).map_err(|e| e.to_string())?;
    let cipher = cipher_for_key(key);
    cipher
        .decrypt(XNonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "Vault password is incorrect".to_string())
}

fn write_cipher_file(path: &Path, file: &VaultCipherFile) -> Result<(), String> {
    let content = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

fn read_cipher_file(path: &Path) -> Result<VaultCipherFile, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn current_key() -> Result<[u8; 32], String> {
    session_key()
        .lock()
        .map_err(|_| "Vault session lock failed".to_string())?
        .as_ref()
        .copied()
        .ok_or_else(|| "Vault is locked".to_string())
}

fn set_current_key(key: [u8; 32]) -> Result<(), String> {
    *session_key()
        .lock()
        .map_err(|_| "Vault session lock failed".to_string())? = Some(key);
    Ok(())
}

pub fn is_unlocked() -> bool {
    session_key()
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

pub fn save_clipboard_secret(content: &str, kind: SecretKind) -> Result<VaultEntryMeta, String> {
    let key = current_key()?;
    let now = now_rfc3339();
    let id = new_entry_id();
    let entry_fingerprint = format!("entry:{}", id.chars().take(14).collect::<String>());
    let title = default_title(kind, content);
    let payload = VaultSecretPayload {
        secret: content.to_string(),
        note: String::new(),
    };
    let plaintext = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
    let cipher = encrypt_payload(&key, &plaintext)?;
    ensure_vault_dirs()?;
    write_cipher_file(&entries_dir().join(format!("{id}.gmvault")), &cipher)?;

    let meta = VaultEntryMeta {
        id,
        title,
        kind: kind.into(),
        source: "clipboard".into(),
        tags: Vec::new(),
        fingerprint: entry_fingerprint,
        created_at: now.clone(),
        updated_at: now,
    };
    let mut index = load_index();
    index.entries.insert(0, meta.clone());
    save_index(&index)?;
    Ok(meta)
}

fn default_title(kind: SecretKind, content: &str) -> String {
    let label = match kind {
        SecretKind::ApiKey | SecretKind::CloudKey => "API key",
        SecretKind::Password => "Password",
        SecretKind::Token => "Token",
        SecretKind::Jwt => "JWT",
        SecretKind::PrivateKey => "Private key",
        SecretKind::KeystorePassword => "Keystore password",
        SecretKind::Unknown => "Secret",
    };
    let hint = content
        .lines()
        .next()
        .unwrap_or_default()
        .chars()
        .take(24)
        .collect::<String>();
    if hint.trim().is_empty() {
        label.to_string()
    } else {
        format!("{label} from clipboard")
    }
}

#[tauri::command]
pub fn get_vault_status() -> Result<VaultStatus, String> {
    let initialized = config_path().exists();
    Ok(VaultStatus {
        initialized,
        unlocked: is_unlocked(),
        entries_count: load_index().entries.len(),
    })
}

#[tauri::command]
pub fn init_vault(password: String) -> Result<VaultStatus, String> {
    if config_path().exists() {
        return Err("Vault is already initialized".into());
    }
    if password.len() < 8 {
        return Err("Vault password must be at least 8 characters".into());
    }
    ensure_vault_dirs()?;
    let (config, key) = create_config(&password)?;
    let config_content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(config_path(), config_content).map_err(|e| e.to_string())?;
    save_index(&load_index())?;
    let check = encrypt_payload(&key, b"gitmemo-vault-check")?;
    write_cipher_file(&check_path(), &check)?;
    set_current_key(key)?;
    get_vault_status()
}

#[tauri::command]
pub fn unlock_vault(password: String) -> Result<VaultStatus, String> {
    let config = load_config()?;
    let key = derive_key(&password, &config)?;
    let check = read_cipher_file(&check_path())?;
    let plaintext = decrypt_payload(&key, &check)?;
    if plaintext != b"gitmemo-vault-check" {
        return Err("Vault password is incorrect".into());
    }
    set_current_key(key)?;
    get_vault_status()
}

#[tauri::command]
pub fn lock_vault() -> Result<VaultStatus, String> {
    *session_key()
        .lock()
        .map_err(|_| "Vault session lock failed".to_string())? = None;
    get_vault_status()
}

#[tauri::command]
pub fn list_vault_entries() -> Result<Vec<VaultEntryMeta>, String> {
    Ok(load_index().entries)
}

#[tauri::command]
pub fn reveal_vault_entry(id: String) -> Result<VaultEntryDetail, String> {
    let key = current_key()?;
    let index = load_index();
    let meta = index
        .entries
        .into_iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| "Vault entry not found".to_string())?;
    let file = read_cipher_file(&entries_dir().join(format!("{}.gmvault", meta.id)))?;
    let plaintext = decrypt_payload(&key, &file)?;
    let payload: VaultSecretPayload =
        serde_json::from_slice(&plaintext).map_err(|e| e.to_string())?;
    Ok(VaultEntryDetail {
        meta,
        secret: payload.secret,
        note: payload.note,
    })
}

#[tauri::command]
pub fn delete_vault_entry(id: String) -> Result<String, String> {
    current_key()?;
    let mut index = load_index();
    let before = index.entries.len();
    index.entries.retain(|entry| entry.id != id);
    if index.entries.len() == before {
        return Err("Vault entry not found".into());
    }
    let path = entries_dir().join(format!("{id}.gmvault"));
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    save_index(&index)?;
    Ok("ok".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_kind_maps_to_vault_kind() {
        assert!(matches!(
            VaultEntryKind::from(SecretKind::PrivateKey),
            VaultEntryKind::PrivateKey
        ));
        assert!(matches!(
            VaultEntryKind::from(SecretKind::CloudKey),
            VaultEntryKind::ApiKey
        ));
    }

    #[test]
    fn default_clipboard_title_does_not_include_secret_content() {
        let title = default_title(SecretKind::Password, "password=hunter2-secret");

        assert_eq!(title, "Password from clipboard");
        assert!(!title.contains("hunter2"));
    }
}
