/// Filter sensitive values from text before it is displayed or written to logs.
#[allow(dead_code)]
pub fn filter_sensitive(content: &str) -> String {
    let mut result = content.to_string();

    // API keys
    let patterns = [
        (r"sk-[a-zA-Z0-9]{20,}", "***API_KEY***"),
        (r"ghp_[a-zA-Z0-9]{36}", "***GITHUB_TOKEN***"),
        (r"github_pat_[a-zA-Z0-9_]{20,}", "***GITHUB_TOKEN***"),
        (r"glpat-[a-zA-Z0-9_\-]{20,}", "***GITLAB_TOKEN***"),
        (r"https://([^/\s:@]+):([^@\s]+)@", "https://***:***@"),
        (r"https://([^/\s:@]+)@", "https://***@"),
        (r"(?i)(access_token|token|password)=([^&\s]+)", "$1=***"),
    ];

    for (pattern, replacement) in &patterns {
        if let Ok(re) = regex_lite::Regex::new(pattern) {
            result = re.replace_all(&result, *replacement).to_string();
        }
    }

    result
}

/// Convert low-level Git/libgit2 transport errors into messages that are safer
/// and easier to act on in the UI.
#[allow(dead_code)]
pub fn git_error_for_user(error: impl AsRef<str>) -> String {
    let sanitized = filter_sensitive(error.as_ref()).trim().to_string();
    if sanitized.is_empty() {
        return "Git operation failed".to_string();
    }

    let lower = sanitized.to_ascii_lowercase();
    let hint = if lower.contains("publickey")
        || lower.contains("could not read from remote repository")
        || lower.contains("git@gitee.com: permission denied")
        || lower.contains("git@github.com: permission denied")
        || lower.contains("git@gitlab.com: permission denied")
    {
        Some("SSH authentication failed. Check that the selected public key is added to the Git host and that the private key does not require a passphrase; for background sync, generate a dedicated GitMemo SSH key.")
    } else if lower.contains("authentication failed")
        || lower.contains("auth failed")
        || lower.contains("unauthorized")
        || lower.contains("401")
        || lower.contains("invalid username or password")
        || lower.contains("bad credentials")
    {
        Some("Authentication failed. Check that the access token is valid and has read/write access to this repository.")
    } else if lower.contains("permission denied")
        || lower.contains("access denied")
        || lower.contains("403")
        || lower.contains("forbidden")
        || lower.contains("protected branch")
        || lower.contains("pre-receive hook")
        || lower.contains("not allowed")
    {
        Some("Push was rejected by the remote. Check repository write permission and branch protection rules.")
    } else if lower.contains("certificate") || lower.contains("ssl") || lower.contains("tls") {
        Some("TLS certificate verification failed. Check the network, proxy, or certificate configuration.")
    } else if lower.contains("could not resolve host")
        || lower.contains("failed to connect")
        || lower.contains("connection timed out")
        || lower.contains("connection reset")
        || lower.contains("network is unreachable")
        || lower.contains("timeout")
    {
        Some("Network connection failed. Check the network connection or proxy settings.")
    } else if lower.contains("non-fast-forward")
        || lower.contains("fetch first")
        || lower.contains("not fast-forward")
    {
        Some("Remote history changed before push. Run sync again to fetch and merge the latest remote history.")
    } else {
        None
    };

    match hint {
        Some(hint) if !sanitized.contains(hint) => format!("{hint} Details: {sanitized}"),
        _ => sanitized,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_api_key() {
        let input = "My key is sk-abcdefghijklmnopqrstuvwxyz1234567890 here";
        let output = filter_sensitive(input);
        assert!(output.contains("***API_KEY***"));
        assert!(!output.contains("sk-abcdefghijklmnopqrstuvwxyz"));
    }

    #[test]
    fn test_filter_github_token() {
        let input = "Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890";
        let output = filter_sensitive(input);
        assert!(output.contains("***GITHUB_TOKEN***"));
        assert!(!output.contains("ghp_abcdefghijklmnopqrstuvwxyz"));
    }

    #[test]
    fn test_clean_text_unchanged() {
        let input = "Hello, this is normal text with no secrets.";
        assert_eq!(filter_sensitive(input), input);
    }

    #[test]
    fn test_short_sk_not_matched() {
        // sk- followed by less than 20 chars should not match
        let input = "sk-short";
        assert_eq!(filter_sensitive(input), input);
    }
}
