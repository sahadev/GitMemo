/// Placeholder for sensitive info filtering
#[allow(dead_code)]
pub fn filter_sensitive(content: &str) -> String {
    let mut result = content.to_string();

    // API keys
    let patterns = [
        (r"sk-[a-zA-Z0-9]{20,}", "***API_KEY***"),
        (r"ghp_[a-zA-Z0-9]{36}", "***GITHUB_TOKEN***"),
    ];

    for (pattern, replacement) in &patterns {
        if let Ok(re) = regex_lite::Regex::new(pattern) {
            result = re.replace_all(&result, *replacement).to_string();
        }
    }

    result
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
