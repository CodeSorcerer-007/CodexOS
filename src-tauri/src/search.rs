use crate::error::{AppError, AppResult};
use crate::files::{normalize_path, AllowedPathsState};
use crate::util::lock_poison_recover;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use walkdir::WalkDir;

pub const DEFAULT_MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024; // 10 MB
pub const HARD_MAX_CONTENT_FILE_SIZE_BYTES: u64 = 100 * 1024 * 1024; // 100 MB hard ceiling
pub const MAX_LINE_BUFFER_BYTES: usize = 64 * 1024; // 64 KB line scan chunk ceiling

pub const DEFAULT_EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".cache",
    "vendor",
    "$RECYCLE.BIN",
    "System Volume Information",
];

pub const SUPPORTED_CONTENT_EXTENSIONS: &[&str] = &[
    "txt", "md", "markdown", "json", "jsonc", "yaml", "yml", "toml", "ts", "tsx", "js", "jsx",
    "mjs", "cjs", "rs", "py", "html", "htm", "css", "scss", "sass", "less", "sql", "xml", "svg",
    "c", "cpp", "h", "hpp", "cs", "java", "go", "rb", "php", "sh", "bash", "ps1", "bat", "cmd",
    "ini", "conf", "log", "csv", "tsv", "env",
];

// ---------------------------------------------------------------------------
// DATA STRUCTURES
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchQuery {
    pub raw_query: String,
    pub name_terms: Vec<String>,
    pub extensions: Vec<String>,
    pub file_types: Vec<String>,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub modified_after: Option<u64>,
    pub modified_before: Option<u64>,
    pub path_patterns: Vec<String>,
    pub content_query: Option<String>,
    pub case_sensitive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchExecutionOptions {
    pub search_content: bool,
    pub max_results: Option<usize>,
    pub max_file_size_bytes: Option<u64>,
    pub custom_exclusions: Option<Vec<String>>,
    pub include_hidden: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SearchMatch {
    pub path: String,
    pub filename: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_secs: u64,
    pub line_number: Option<u32>,
    pub snippet: Option<String>,
    pub match_indices: Vec<(usize, usize)>,
    pub relevance_score: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchBatchEvent {
    pub search_id: String,
    pub matches: Vec<SearchMatch>,
    pub total_scanned: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchDoneEvent {
    pub search_id: String,
    pub total_matches: usize,
    pub total_scanned: u64,
    pub duration_ms: u64,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceIndexStatus {
    pub workspace_path: String,
    pub last_indexed: u64,
    pub file_count: usize,
    pub status: String,
}

pub type ContentMatchDetail = (u32, String, Vec<(usize, usize)>);

// ---------------------------------------------------------------------------
// QUERY PARSER & GRAMMAR
// ---------------------------------------------------------------------------

/// Tokenizes an input string respecting double quotes and escaped quotes (\").
pub fn tokenize_query(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(&next_ch) = chars.peek() {
                if next_ch == '"' || next_ch == '\\' {
                    chars.next();
                    current.push(next_ch);
                    continue;
                }
            }
            current.push('\\');
        } else if ch == '"' {
            in_quotes = !in_quotes;
            current.push(ch);
        } else if ch.is_whitespace() && !in_quotes {
            if !current.is_empty() {
                tokens.push(current);
                current = String::new();
            }
        } else {
            current.push(ch);
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

pub fn strip_quotes(s: &str) -> &str {
    let trimmed = s.trim();
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    }
}

pub fn current_timestamp_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(windows)]
fn local_offset_seconds() -> i64 {
    #[repr(C)]
    struct TIME_ZONE_INFORMATION {
        bias: i32,
        standard_name: [u16; 32],
        standard_date: [u16; 8],
        standard_bias: i32,
        daylight_name: [u16; 32],
        daylight_date: [u16; 8],
        daylight_bias: i32,
    }
    extern "system" {
        fn GetTimeZoneInformation(lpTimeZoneInformation: *mut TIME_ZONE_INFORMATION) -> u32;
    }
    unsafe {
        let mut tz = std::mem::zeroed();
        let res = GetTimeZoneInformation(&mut tz);
        if res != 0xFFFFFFFF {
            let total_bias_minutes = tz.bias
                + if res == 2 {
                    tz.daylight_bias
                } else {
                    tz.standard_bias
                };
            return -(total_bias_minutes as i64) * 60;
        }
    }
    0
}

#[cfg(not(windows))]
fn local_offset_seconds() -> i64 {
    0
}

pub fn get_local_midnight_timestamp() -> u64 {
    let now = current_timestamp_secs();
    let offset = local_offset_seconds();
    let local_now = (now as i64) + offset;
    let local_midnight = local_now - (local_now.rem_euclid(86400));
    (local_midnight - offset).max(0) as u64
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

pub fn ymd_to_timestamp(year: i32, month: u32, day: u32) -> Option<u64> {
    if year < 1970 || !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month) {
        return None;
    }

    let mut total_days: u64 = 0;
    for y in 1970..year {
        total_days += if is_leap_year(y) { 366 } else { 365 };
    }

    for m in 1..month {
        total_days += days_in_month(year, m) as u64;
    }

    total_days += (day - 1) as u64;
    Some(total_days * 86400)
}

/// Parses a date string like `today`, `yesterday`, `7d`, `30d`, `YYYY-MM-DD`, `>YYYY-MM-DD`, `<YYYY-MM-DD`.
pub fn parse_date_expression(expr: &str) -> Result<(Option<u64>, Option<u64>), String> {
    let now = current_timestamp_secs();
    let local_today_midnight = get_local_midnight_timestamp();

    let clean = strip_quotes(expr).to_lowercase();
    if clean.is_empty() {
        return Err("Modified date value cannot be empty".to_string());
    }

    if clean == "today" {
        return Ok((Some(local_today_midnight), None));
    }
    if clean == "yesterday" {
        return Ok((
            Some(local_today_midnight - 86400),
            Some(local_today_midnight),
        ));
    }

    // Relative intervals like "7d", "30d", "24h", "2w"
    if let Some(num_str) = clean.strip_suffix('d') {
        if let Ok(days) = num_str.parse::<u64>() {
            return Ok((Some(now.saturating_sub(days * 86400)), None));
        }
    }
    if let Some(num_str) = clean.strip_suffix('h') {
        if let Ok(hours) = num_str.parse::<u64>() {
            return Ok((Some(now.saturating_sub(hours * 3600)), None));
        }
    }
    if let Some(num_str) = clean.strip_suffix('w') {
        if let Ok(weeks) = num_str.parse::<u64>() {
            return Ok((Some(now.saturating_sub(weeks * 7 * 86400)), None));
        }
    }

    // Explicit date: YYYY-MM-DD with optional operator (>, <, >=, <=)
    let (op, date_part) = if let Some(stripped) = clean.strip_prefix(">=") {
        (">=", stripped)
    } else if let Some(stripped) = clean.strip_prefix("<=") {
        ("<=", stripped)
    } else if let Some(stripped) = clean.strip_prefix('>') {
        (">", stripped)
    } else if let Some(stripped) = clean.strip_prefix('<') {
        ("<", stripped)
    } else if let Some(stripped) = clean.strip_prefix('=') {
        ("=", stripped)
    } else {
        ("=", clean.as_str())
    };

    let parts: Vec<&str> = date_part.split('-').collect();
    if parts.len() == 3 {
        if let (Ok(y), Ok(m), Ok(d)) = (
            parts[0].parse::<i32>(),
            parts[1].parse::<u32>(),
            parts[2].parse::<u32>(),
        ) {
            if let Some(ts) = ymd_to_timestamp(y, m, d) {
                return match op {
                    ">" | ">=" => Ok((Some(ts), None)),
                    "<" | "<=" => Ok((None, Some(ts + 86400))),
                    _ => Ok((Some(ts), Some(ts + 86400))),
                };
            }
        }
    }

    Err(format!(
        "Invalid 'modified:' date '{}'. Supported formats: today, yesterday, 7d, 30d, YYYY-MM-DD",
        expr
    ))
}

/// Parses a size string like `>10mb`, `<500kb`, `>=1gb`, `<=100b`, `10mb`, `1kb..10mb`.
pub fn parse_size_expression(expr: &str) -> Result<(Option<u64>, Option<u64>), String> {
    let clean = strip_quotes(expr).to_lowercase();
    if clean.is_empty() {
        return Err("Size value cannot be empty".to_string());
    }

    // Range like 1kb..10mb
    if clean.contains("..") {
        let parts: Vec<&str> = clean.split("..").collect();
        if parts.len() == 2 {
            let (min, _) = parse_single_size(parts[0], ">=")?;
            let (_, max) = parse_single_size(parts[1], "<=")?;
            if let (Some(mn), Some(mx)) = (min, max) {
                if mn > mx {
                    return Err(format!(
                        "Invalid size range '{}': min cannot be greater than max",
                        clean
                    ));
                }
            }
            return Ok((min, max));
        } else {
            return Err(format!("Invalid size range format '{}'", clean));
        }
    }

    let (op, num_part) = if let Some(stripped) = clean.strip_prefix(">=") {
        (">=", stripped)
    } else if let Some(stripped) = clean.strip_prefix("<=") {
        ("<=", stripped)
    } else if let Some(stripped) = clean.strip_prefix('>') {
        (">", stripped)
    } else if let Some(stripped) = clean.strip_prefix('<') {
        ("<", stripped)
    } else if let Some(stripped) = clean.strip_prefix('=') {
        ("=", stripped)
    } else {
        ("=", clean.as_str())
    };

    if num_part.starts_with('>') || num_part.starts_with('<') || num_part.starts_with('=') {
        return Err(format!(
            "Invalid size expression '{}': repeated comparison operator",
            expr
        ));
    }

    parse_single_size(num_part, op)
}

fn parse_single_size(val: &str, op: &str) -> Result<(Option<u64>, Option<u64>), String> {
    let trimmed = val.trim();
    if trimmed.is_empty() {
        return Err("Size value cannot be empty".to_string());
    }

    let (num_str, multiplier): (&str, f64) = if let Some(s) = trimmed.strip_suffix("gb") {
        (s, 1024.0 * 1024.0 * 1024.0)
    } else if let Some(s) = trimmed.strip_suffix('g') {
        (s, 1024.0 * 1024.0 * 1024.0)
    } else if let Some(s) = trimmed.strip_suffix("mb") {
        (s, 1024.0 * 1024.0)
    } else if let Some(s) = trimmed.strip_suffix('m') {
        (s, 1024.0 * 1024.0)
    } else if let Some(s) = trimmed.strip_suffix("kb") {
        (s, 1024.0)
    } else if let Some(s) = trimmed.strip_suffix('k') {
        (s, 1024.0)
    } else if let Some(s) = trimmed.strip_suffix("bytes") {
        (s, 1.0)
    } else if let Some(s) = trimmed.strip_suffix('b') {
        (s, 1.0)
    } else {
        (trimmed, 1.0)
    };

    let num = num_str.trim().parse::<f64>().map_err(|_| {
        format!(
            "Invalid size number '{}'. Examples: 10mb, 500kb, 1gb",
            num_str
        )
    })?;

    if num < 0.0 {
        return Err("Size cannot be negative".to_string());
    }

    let bytes = (num * multiplier) as u64;

    match op {
        ">" | ">=" => Ok((Some(bytes), None)),
        "<" | "<=" => Ok((None, Some(bytes))),
        _ => Ok((Some(bytes), Some(bytes))),
    }
}

pub fn is_file_type_match(ext: &str, category: &str) -> bool {
    let ext_lower = ext.to_lowercase();
    match category.to_lowercase().as_str() {
        "code" => matches!(
            ext_lower.as_str(),
            "rs" | "ts"
                | "tsx"
                | "js"
                | "jsx"
                | "py"
                | "c"
                | "cpp"
                | "h"
                | "hpp"
                | "cs"
                | "java"
                | "go"
                | "rb"
                | "php"
                | "html"
                | "css"
                | "scss"
                | "sass"
                | "less"
                | "json"
                | "yaml"
                | "yml"
                | "toml"
                | "xml"
                | "sql"
                | "sh"
                | "bash"
                | "ps1"
                | "bat"
                | "cmd"
                | "mjs"
                | "cjs"
        ),
        "doc" | "document" => matches!(
            ext_lower.as_str(),
            "txt"
                | "md"
                | "markdown"
                | "pdf"
                | "doc"
                | "docx"
                | "rtf"
                | "odt"
                | "xls"
                | "xlsx"
                | "ppt"
                | "pptx"
                | "csv"
                | "tsv"
        ),
        "image" => matches!(
            ext_lower.as_str(),
            "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "bmp" | "ico" | "tiff" | "tif"
        ),
        "media" => matches!(
            ext_lower.as_str(),
            "mp3" | "wav" | "flac" | "aac" | "ogg" | "mp4" | "mkv" | "avi" | "mov" | "wmv" | "webm"
        ),
        "archive" => matches!(
            ext_lower.as_str(),
            "zip" | "tar" | "gz" | "7z" | "rar" | "bz2" | "xz"
        ),
        _ => false,
    }
}

/// Parses a structured search query string into a `SearchQuery` AST.
pub fn parse_search_query(raw: &str) -> Result<SearchQuery, String> {
    let tokens = tokenize_query(raw);

    let mut name_terms = Vec::new();
    let mut extensions = Vec::new();
    let mut file_types = Vec::new();
    let mut min_size: Option<u64> = None;
    let mut max_size: Option<u64> = None;
    let mut modified_after: Option<u64> = None;
    let mut modified_before: Option<u64> = None;
    let mut path_patterns = Vec::new();
    let mut content_query: Option<String> = None;
    let mut case_sensitive = false;

    for token in tokens {
        // Unknown filter validation: detect typo'd prefixes like `szie:` or `exts:`
        if !token.starts_with('"') {
            if let Some(colon_pos) = token.find(':') {
                let prefix = &token[..colon_pos];
                // Check if it looks like an intended filter keyword (multi-char ASCII letters, not a Windows drive like C:)
                if prefix.len() > 1 && prefix.chars().all(|c| c.is_ascii_alphabetic()) {
                    let prefix_lower = prefix.to_lowercase();
                    if !matches!(
                        prefix_lower.as_str(),
                        "name" | "ext" | "type" | "size" | "modified" | "path" | "content" | "case"
                    ) {
                        return Err(format!(
                            "Unknown filter '{}:'. Supported filters: name, ext, type, size, modified, path, content, case",
                            prefix
                        ));
                    }
                }
            }
        }

        if let Some(val) = token.strip_prefix("name:") {
            let v = strip_quotes(val).trim();
            if v.is_empty() {
                return Err("Filter 'name:' cannot be empty".to_string());
            }
            name_terms.push(v.to_string());
        } else if let Some(val) = token.strip_prefix("ext:") {
            let v = strip_quotes(val).trim();
            if v.is_empty() {
                return Err("Filter 'ext:' cannot be empty".to_string());
            }
            for part in v.split(',') {
                let clean_ext = part.trim().trim_start_matches('.').to_lowercase();
                if !clean_ext.is_empty() {
                    extensions.push(clean_ext);
                }
            }
        } else if let Some(val) = token.strip_prefix("type:") {
            let v = strip_quotes(val).trim().to_lowercase();
            if !matches!(
                v.as_str(),
                "code" | "doc" | "document" | "image" | "media" | "archive"
            ) {
                return Err(format!(
                    "Invalid 'type:' filter '{}'. Allowed types: code, doc, image, media, archive",
                    v
                ));
            }
            file_types.push(v);
        } else if let Some(val) = token.strip_prefix("size:") {
            let (min, max) = parse_size_expression(val)?;
            if let Some(mn) = min {
                min_size = Some(min_size.map_or(mn, |cur| cur.max(mn)));
            }
            if let Some(mx) = max {
                max_size = Some(max_size.map_or(mx, |cur| cur.min(mx)));
            }
        } else if let Some(val) = token.strip_prefix("modified:") {
            let (after, before) = parse_date_expression(val)?;
            if let Some(aft) = after {
                modified_after = Some(modified_after.map_or(aft, |cur| cur.max(aft)));
            }
            if let Some(bef) = before {
                modified_before = Some(modified_before.map_or(bef, |cur| cur.min(bef)));
            }
        } else if let Some(val) = token.strip_prefix("path:") {
            let v = strip_quotes(val).trim();
            if v.is_empty() {
                return Err("Filter 'path:' cannot be empty".to_string());
            }
            path_patterns.push(v.replace('\\', "/"));
        } else if let Some(val) = token.strip_prefix("content:") {
            let v = strip_quotes(val).trim();
            if v.is_empty() {
                return Err("Filter 'content:' cannot be empty".to_string());
            }
            content_query = Some(v.to_string());
        } else if let Some(val) = token.strip_prefix("case:") {
            let v = strip_quotes(val).trim().to_lowercase();
            match v.as_str() {
                "true" | "sensitive" | "yes" | "1" | "on" => {
                    case_sensitive = true;
                }
                "false" | "insensitive" | "no" | "0" | "off" => {
                    case_sensitive = false;
                }
                _ => {
                    return Err(format!(
                        "Invalid 'case:' value '{}'. Expected: true, false, sensitive, insensitive",
                        val
                    ));
                }
            }
        } else {
            // Bare token
            let v = strip_quotes(&token).trim();
            if !v.is_empty() {
                name_terms.push(v.to_string());
            }
        }
    }

    Ok(SearchQuery {
        raw_query: raw.to_string(),
        name_terms,
        extensions,
        file_types,
        min_size,
        max_size,
        modified_after,
        modified_before,
        path_patterns,
        content_query,
        case_sensitive,
    })
}

// ---------------------------------------------------------------------------
// CONTENT SEARCH & SNIPPET EXTRACTION
// ---------------------------------------------------------------------------

/// Scans file content with strictly bounded memory, TOCTOU handle validation,
/// null-byte binary check, and line chunk bounding.
pub fn scan_file_content(
    path: &Path,
    content_term: &str,
    case_sensitive: bool,
    max_size_bytes: u64,
    cancel_token: &AtomicBool,
    scope_root: Option<&Path>,
    allowed_paths: Option<&AllowedPathsState>,
) -> Option<ContentMatchDetail> {
    if cancel_token.load(Ordering::Relaxed) {
        return None;
    }

    // Fast extension filter
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !SUPPORTED_CONTENT_EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }

    // Security: Validate symlink target does not escape search scope or allowed roots
    if path.is_symlink() {
        if let Ok(canon) = path.canonicalize() {
            if let Some(scope) = scope_root {
                let norm_canon = normalize_path(&canon);
                let norm_scope = normalize_path(scope);
                if !norm_canon.starts_with(&norm_scope) {
                    return None;
                }
            }
            if let Some(allowed) = allowed_paths {
                if !allowed.is_allowed(&canon) {
                    return None;
                }
            }
        } else {
            return None;
        }
    }

    // Enforce hard ceiling on configured max file size
    let bounded_max_size = max_size_bytes.clamp(1, HARD_MAX_CONTENT_FILE_SIZE_BYTES);

    // Open file once to prevent TOCTOU substitution races
    let mut file = File::open(path).ok()?;
    let meta = file.metadata().ok()?;
    if meta.is_dir() || meta.len() > bounded_max_size {
        return None;
    }

    // Fast binary check via open handle
    let mut initial_buf = [0u8; 512];
    let n = file.read(&mut initial_buf).ok()?;
    if initial_buf[..n].contains(&0) {
        return None;
    }
    if file.rewind().is_err() {
        return None;
    }

    let needle = if case_sensitive {
        content_term.to_string()
    } else {
        content_term.to_lowercase()
    };

    // Use take(bounded_max_size) so reading strictly stops even if file grows while being scanned
    let bounded_reader = file.take(bounded_max_size);
    let mut reader = BufReader::with_capacity(32 * 1024, bounded_reader);

    let mut line_num: u32 = 1;
    let mut chunk_buf = Vec::with_capacity(4096);

    loop {
        if cancel_token.load(Ordering::Relaxed) {
            return None;
        }

        chunk_buf.clear();
        // Read bounded line chunk (max 64KB per chunk)
        let mut bytes_read_in_chunk = 0;
        let mut reached_newline = false;

        while bytes_read_in_chunk < MAX_LINE_BUFFER_BYTES {
            let buffer = match reader.fill_buf() {
                Ok(b) => b,
                Err(_) => break,
            };
            if buffer.is_empty() {
                break; // EOF
            }

            // Find newline or end of buffer
            let to_consume = if let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                reached_newline = true;
                pos + 1
            } else {
                buffer
                    .len()
                    .min(MAX_LINE_BUFFER_BYTES - bytes_read_in_chunk)
            };

            chunk_buf.extend_from_slice(&buffer[..to_consume]);
            bytes_read_in_chunk += to_consume;
            reader.consume(to_consume);

            if reached_newline {
                break;
            }
        }

        if chunk_buf.is_empty() {
            break; // EOF reached
        }

        // Null-byte check on chunk
        if chunk_buf.contains(&0) {
            return None; // Encountered binary data
        }

        // Convert lossy UTF-8
        let line = String::from_utf8_lossy(&chunk_buf);
        let haystack = if case_sensitive {
            line.to_string()
        } else {
            line.to_lowercase()
        };

        if let Some(byte_pos) = haystack.find(&needle) {
            // Compute character offsets
            let match_len = needle.chars().count();
            let chars: Vec<char> = line.chars().collect();
            let char_pos = line[..byte_pos].chars().count();

            let snippet_start = char_pos.saturating_sub(40);
            let snippet_end = (char_pos + match_len + 40).min(chars.len());

            let prefix = if snippet_start > 0 { "..." } else { "" };
            let suffix = if snippet_end < chars.len() { "..." } else { "" };

            let sub: String = chars[snippet_start..snippet_end].iter().collect();
            let snippet = format!("{}{}{}", prefix, sub.trim_end_matches(['\r', '\n']), suffix);

            let offset_in_snippet = if snippet_start > 0 {
                3 + (char_pos - snippet_start)
            } else {
                char_pos
            };
            let indices = vec![(offset_in_snippet, offset_in_snippet + match_len)];

            return Some((line_num, snippet, indices));
        }

        if reached_newline {
            line_num += 1;
        }
    }

    None
}

// ---------------------------------------------------------------------------
// RELEVANCE & SCORING
// ---------------------------------------------------------------------------

pub fn calculate_relevance(
    filename: &str,
    path: &str,
    query: &SearchQuery,
    has_content_match: bool,
    modified_secs: u64,
) -> u32 {
    let mut score = 10;
    let fname_lower = filename.to_lowercase();
    let path_lower = path.to_lowercase();

    for term in &query.name_terms {
        let t_lower = term.to_lowercase();
        if fname_lower == t_lower {
            score += 100;
        } else if fname_lower.starts_with(&t_lower) {
            score += 50;
        } else if fname_lower.contains(&t_lower) {
            score += 30;
        } else if path_lower.contains(&t_lower) {
            score += 15;
        }
    }

    if has_content_match {
        score += 25;
    }

    // Recency bonus
    let now = current_timestamp_secs();
    let age_secs = now.saturating_sub(modified_secs);
    if age_secs < 86400 * 7 {
        score += 10;
    } else if age_secs < 86400 * 30 {
        score += 5;
    }

    score
}

// ---------------------------------------------------------------------------
// SEARCH MANAGER (STATE & CANCEL HANDLES)
// ---------------------------------------------------------------------------

pub struct SearchManagerState {
    active_searches: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Default for SearchManagerState {
    fn default() -> Self {
        Self::new()
    }
}

impl SearchManagerState {
    pub fn new() -> Self {
        Self {
            active_searches: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, search_id: &str) -> Arc<AtomicBool> {
        let token = Arc::new(AtomicBool::new(false));
        let mut map = lock_poison_recover(&self.active_searches);
        map.insert(search_id.to_string(), Arc::clone(&token));
        token
    }

    pub fn cancel(&self, search_id: &str) -> bool {
        let map = lock_poison_recover(&self.active_searches);
        if let Some(token) = map.get(search_id) {
            token.store(true, Ordering::Relaxed);
            true
        } else {
            false
        }
    }

    pub fn remove(&self, search_id: &str) {
        let mut map = lock_poison_recover(&self.active_searches);
        map.remove(search_id);
    }
}

// ---------------------------------------------------------------------------
// STREAMING SEARCH CORE
// ---------------------------------------------------------------------------

pub fn execute_streaming_search(
    app_handle: Option<&AppHandle>,
    search_id: &str,
    scope: &Path,
    query: &SearchQuery,
    options: &SearchExecutionOptions,
    cancel_token: &AtomicBool,
    allowed_paths: Option<&AllowedPathsState>,
) -> (Vec<SearchMatch>, usize, u64) {
    let start_time = Instant::now();
    let mut matches = Vec::new();
    let mut seen_paths: HashSet<String> = HashSet::new();
    let mut total_scanned: u64 = 0;
    let mut batch_buffer = Vec::new();
    let max_results = options.max_results.unwrap_or(2000);
    let max_file_size = options
        .max_file_size_bytes
        .unwrap_or(DEFAULT_MAX_FILE_SIZE_BYTES);

    let mut excluded_names: HashSet<String> = DEFAULT_EXCLUDED_DIRS
        .iter()
        .map(|s| s.to_string())
        .collect();
    if let Some(custom) = &options.custom_exclusions {
        for c in custom {
            excluded_names.insert(c.clone());
        }
    }

    let include_hidden = options.include_hidden.unwrap_or(false);

    let walker = WalkDir::new(scope).follow_links(false).into_iter();

    for entry_res in walker.filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        if !include_hidden && name.starts_with('.') && name != "." && name != ".." {
            if query.name_terms.iter().any(|t| name.contains(t)) {
                return true;
            }
            return false;
        }
        if e.file_type().is_dir()
            && excluded_names.contains(&*name)
            && !query.path_patterns.iter().any(|p| p.contains(&*name))
        {
            return false;
        }
        true
    }) {
        if cancel_token.load(Ordering::Relaxed) {
            break;
        }

        total_scanned += 1;

        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();

        // Security: Check symlink does not escape search scope
        if entry.path_is_symlink() {
            if let Ok(canon) = path.canonicalize() {
                let norm_canon = normalize_path(&canon);
                let norm_scope = normalize_path(scope);
                if !norm_canon.starts_with(&norm_scope) {
                    continue;
                }
            } else {
                continue;
            }
        }

        // Sandbox boundary check
        if let Some(allowed) = allowed_paths {
            if !allowed.is_allowed(path) {
                continue;
            }
        }

        let is_dir = entry.file_type().is_dir();
        let filename = entry.file_name().to_string_lossy().to_string();
        let path_str = path.to_string_lossy().replace('\\', "/");

        // Duplicate prevention
        if !seen_paths.insert(path_str.clone()) {
            continue;
        }

        let ext = if is_dir {
            String::new()
        } else {
            path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase()
        };

        let (size_bytes, modified_secs) = if let Ok(meta) = entry.metadata() {
            let sz = if is_dir { 0 } else { meta.len() };
            let mod_time = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            (sz, mod_time)
        } else {
            (0, 0)
        };

        // 1. Extension filter
        if !query.extensions.is_empty() && (is_dir || !query.extensions.contains(&ext)) {
            continue;
        }

        // 2. File type filter
        if !query.file_types.is_empty()
            && (is_dir
                || !query
                    .file_types
                    .iter()
                    .any(|cat| is_file_type_match(&ext, cat)))
        {
            continue;
        }

        // 3. Size filter
        if !is_dir {
            if let Some(min) = query.min_size {
                if size_bytes < min {
                    continue;
                }
            }
            if let Some(max) = query.max_size {
                if size_bytes > max {
                    continue;
                }
            }
        }

        // 4. Modified date filter
        if let Some(after) = query.modified_after {
            if modified_secs < after {
                continue;
            }
        }
        if let Some(before) = query.modified_before {
            if modified_secs > before {
                continue;
            }
        }

        // 5. Path pattern filter
        if !query.path_patterns.is_empty() {
            let path_lower = path_str.to_lowercase();
            if !query
                .path_patterns
                .iter()
                .all(|p| path_lower.contains(&p.to_lowercase()))
            {
                continue;
            }
        }

        // 6. Name filter / Free text filter
        let mut matches_name = query.name_terms.is_empty();
        if !matches_name {
            let fname_target = if query.case_sensitive {
                filename.clone()
            } else {
                filename.to_lowercase()
            };
            matches_name = query.name_terms.iter().all(|term| {
                let t = if query.case_sensitive {
                    term.clone()
                } else {
                    term.to_lowercase()
                };
                fname_target.contains(&t)
            });
        }

        // 7. Content search
        let mut content_match_details = None;
        let requires_content = query.content_query.is_some() || options.search_content;

        if requires_content && !is_dir {
            if let Some(cq) = &query.content_query {
                content_match_details = scan_file_content(
                    path,
                    cq,
                    query.case_sensitive,
                    max_file_size,
                    cancel_token,
                    Some(scope),
                    allowed_paths,
                );
                if content_match_details.is_none() {
                    continue;
                }
            } else if !matches_name && !query.name_terms.is_empty() {
                for term in &query.name_terms {
                    if let Some(details) = scan_file_content(
                        path,
                        term,
                        query.case_sensitive,
                        max_file_size,
                        cancel_token,
                        Some(scope),
                        allowed_paths,
                    ) {
                        content_match_details = Some(details);
                        matches_name = true;
                        break;
                    }
                }
                if !matches_name {
                    continue;
                }
            }
        } else if !matches_name {
            continue;
        }

        let has_content = content_match_details.is_some();
        let (line_number, snippet, match_indices) = match content_match_details {
            Some((ln, sn, idx)) => (Some(ln), Some(sn), idx),
            None => (None, None, Vec::new()),
        };

        let relevance =
            calculate_relevance(&filename, &path_str, query, has_content, modified_secs);

        let search_match = SearchMatch {
            path: path_str,
            filename,
            is_dir,
            size_bytes,
            modified_secs,
            line_number,
            snippet,
            match_indices,
            relevance_score: relevance,
        };

        matches.push(search_match.clone());
        batch_buffer.push(search_match);

        if batch_buffer.len() >= 25 {
            if let Some(app) = app_handle {
                let _ = app.emit(
                    "search://batch",
                    SearchBatchEvent {
                        search_id: search_id.to_string(),
                        matches: std::mem::take(&mut batch_buffer),
                        total_scanned,
                    },
                );
            }
        }

        if matches.len() >= max_results {
            break;
        }
    }

    if !batch_buffer.is_empty() {
        if let Some(app) = app_handle {
            let _ = app.emit(
                "search://batch",
                SearchBatchEvent {
                    search_id: search_id.to_string(),
                    matches: batch_buffer,
                    total_scanned,
                },
            );
        }
    }

    let duration_ms = start_time.elapsed().as_millis() as u64;
    (matches, total_scanned as usize, duration_ms)
}

// ---------------------------------------------------------------------------
// WORKSPACE INDEXING & DATABASE INTEGRATION
// ---------------------------------------------------------------------------

pub fn index_workspace_internal(
    conn: &mut Connection,
    workspace_path: &str,
    cancel_token: &AtomicBool,
    custom_exclusions: Option<Vec<String>>,
) -> Result<WorkspaceIndexStatus, String> {
    let p = Path::new(workspace_path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Workspace path does not exist: {}", workspace_path));
    }

    let mut excluded_names: HashSet<String> = DEFAULT_EXCLUDED_DIRS
        .iter()
        .map(|s| s.to_string())
        .collect();
    if let Some(custom) = custom_exclusions {
        for c in custom {
            excluded_names.insert(c);
        }
    }

    let walker = WalkDir::new(p).follow_links(false).into_iter();
    let mut file_count = 0;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    tx.execute(
        "DELETE FROM workspace_search_index WHERE workspace_root = ?1",
        rusqlite::params![workspace_path],
    )
    .map_err(|e| format!("Failed to clear old index: {}", e))?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO workspace_search_index 
                (path, workspace_root, filename, extension, size_bytes, modified_secs, is_dir) 
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| format!("Failed to prepare insert: {}", e))?;

        for entry_res in walker.filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            if e.file_type().is_dir() && excluded_names.contains(&*name) {
                return false;
            }
            true
        }) {
            if cancel_token.load(Ordering::Relaxed) {
                return Err("Indexing cancelled".to_string());
            }

            let entry = match entry_res {
                Ok(e) => e,
                Err(_) => continue,
            };

            let entry_path = entry.path().to_string_lossy().replace('\\', "/");
            let filename = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().is_dir();
            let ext = if is_dir {
                String::new()
            } else {
                entry
                    .path()
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase()
            };

            let (size_bytes, modified_secs) = if let Ok(meta) = entry.metadata() {
                let sz = if is_dir { 0 } else { meta.len() };
                let m = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                (sz, m)
            } else {
                (0, 0)
            };

            stmt.execute(rusqlite::params![
                entry_path,
                workspace_path,
                filename,
                ext,
                size_bytes,
                modified_secs,
                if is_dir { 1 } else { 0 }
            ])
            .map_err(|e| format!("Failed to insert file entry: {}", e))?;

            if !is_dir {
                file_count += 1;
            }
        }
    }

    let now = current_timestamp_secs();

    tx.execute(
        "INSERT OR REPLACE INTO indexed_workspaces (workspace_path, last_indexed, file_count, status) VALUES (?1, ?2, ?3, 'ready')",
        rusqlite::params![workspace_path, now, file_count],
    )
    .map_err(|e| format!("Failed to update indexed workspaces: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit index transaction: {}", e))?;

    Ok(WorkspaceIndexStatus {
        workspace_path: workspace_path.to_string(),
        last_indexed: now,
        file_count,
        status: "ready".to_string(),
    })
}

/// Incrementally updates or inserts a single file in the workspace index.
pub fn record_indexed_file_create_or_update(
    conn: &Connection,
    workspace_root: &str,
    path: &Path,
) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let meta = path
        .metadata()
        .map_err(|e| format!("Failed to read metadata: {}", e))?;
    let is_dir = meta.is_dir();
    let filename = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = if is_dir {
        String::new()
    } else {
        path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
    };
    let size_bytes = if is_dir { 0 } else { meta.len() };
    let modified_secs = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path_str = path.to_string_lossy().replace('\\', "/");

    conn.execute(
        "INSERT OR REPLACE INTO workspace_search_index 
        (path, workspace_root, filename, extension, size_bytes, modified_secs, is_dir) 
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            path_str,
            workspace_root,
            filename,
            ext,
            size_bytes,
            modified_secs,
            if is_dir { 1 } else { 0 }
        ],
    )
    .map_err(|e| format!("Failed to update indexed file: {}", e))?;

    Ok(())
}

/// Incrementally removes a file or directory tree from the workspace index.
pub fn record_indexed_file_delete(conn: &Connection, path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy().replace('\\', "/");
    let pattern = format!("{}/%", path_str);
    conn.execute(
        "DELETE FROM workspace_search_index WHERE path = ?1 OR path LIKE ?2",
        rusqlite::params![path_str, pattern],
    )
    .map_err(|e| format!("Failed to delete indexed path: {}", e))?;
    Ok(())
}

/// Incrementally updates index when a file or directory is renamed.
pub fn record_indexed_file_rename(
    conn: &Connection,
    old_path: &Path,
    new_path: &Path,
) -> Result<(), String> {
    let old_str = old_path.to_string_lossy().replace('\\', "/");
    let new_str = new_path.to_string_lossy().replace('\\', "/");
    let new_filename = new_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();
    let new_ext = new_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    conn.execute(
        "UPDATE workspace_search_index SET path = ?1, filename = ?2, extension = ?3 WHERE path = ?4",
        rusqlite::params![new_str, new_filename, new_ext, old_str],
    )
    .map_err(|e| format!("Failed to update renamed index path: {}", e))?;

    Ok(())
}

/// Marks a workspace index as stale.
pub fn mark_workspace_index_stale(conn: &Connection, workspace_path: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE indexed_workspaces SET status = 'stale' WHERE workspace_path = ?1",
        rusqlite::params![workspace_path],
    )
    .map_err(|e| format!("Failed to mark index stale: {}", e))?;
    Ok(())
}

/// Queries workspace index, verifies that returned files exist on disk,
/// and automatically prunes deleted/stale records from the database.
pub fn query_workspace_index(
    conn: &Connection,
    workspace_path: &str,
    query: &SearchQuery,
    limit: usize,
) -> Result<Vec<SearchMatch>, String> {
    let mut sql = String::from(
        "SELECT path, filename, size_bytes, modified_secs, is_dir FROM workspace_search_index WHERE workspace_root = ?1",
    );
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(workspace_path.to_string())];
    let mut idx = 2;

    for term in &query.name_terms {
        sql.push_str(&format!(" AND filename LIKE ?{}", idx));
        params.push(Box::new(format!("%{}%", term)));
        idx += 1;
    }

    if !query.extensions.is_empty() {
        let placeholders: Vec<String> = query
            .extensions
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", idx + i))
            .collect();
        sql.push_str(&format!(" AND extension IN ({})", placeholders.join(", ")));
        for ext in &query.extensions {
            params.push(Box::new(ext.clone()));
            idx += 1;
        }
    }

    if let Some(min) = query.min_size {
        sql.push_str(&format!(" AND size_bytes >= ?{}", idx));
        params.push(Box::new(min));
        idx += 1;
    }
    if let Some(max) = query.max_size {
        sql.push_str(&format!(" AND size_bytes <= ?{}", idx));
        params.push(Box::new(max));
        idx += 1;
    }
    if let Some(after) = query.modified_after {
        sql.push_str(&format!(" AND modified_secs >= ?{}", idx));
        params.push(Box::new(after));
        idx += 1;
    }
    if let Some(before) = query.modified_before {
        sql.push_str(&format!(" AND modified_secs <= ?{}", idx));
        params.push(Box::new(before));
        idx += 1;
    }

    for path_pat in &query.path_patterns {
        sql.push_str(&format!(" AND path LIKE ?{}", idx));
        params.push(Box::new(format!("%{}%", path_pat)));
        idx += 1;
    }

    sql.push_str(&format!(
        " ORDER BY is_dir ASC, modified_secs DESC LIMIT ?{}",
        idx
    ));
    params.push(Box::new(limit));

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query prepare failed: {}", e))?;

    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            let path: String = row.get(0)?;
            let filename: String = row.get(1)?;
            let size_bytes: u64 = row.get(2)?;
            let modified_secs: u64 = row.get(3)?;
            let is_dir: bool = row.get::<_, i32>(4)? != 0;

            Ok((path, filename, size_bytes, modified_secs, is_dir))
        })
        .map_err(|e| format!("Query execution failed: {}", e))?;

    let mut results = Vec::new();
    let mut stale_paths = Vec::new();

    for (path, filename, size_bytes, modified_secs, is_dir) in rows.flatten() {
        // Stale path protection: verify file still exists on disk before returning!
        let disk_path = Path::new(&path);
        if !disk_path.exists() {
            stale_paths.push(path);
            continue;
        }

        let relevance = calculate_relevance(&filename, &path, query, false, modified_secs);
        results.push(SearchMatch {
            path,
            filename,
            is_dir,
            size_bytes,
            modified_secs,
            line_number: None,
            snippet: None,
            match_indices: Vec::new(),
            relevance_score: relevance,
        });
    }

    // Prune stale records from database
    if !stale_paths.is_empty() {
        for stale in &stale_paths {
            let _ = conn.execute(
                "DELETE FROM workspace_search_index WHERE path = ?1",
                rusqlite::params![stale],
            );
        }
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// TAURI COMMANDS
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn parse_query_preview(query: String) -> Result<SearchQuery, String> {
    parse_search_query(&query)
}

#[tauri::command]
pub async fn start_file_search(
    app_handle: AppHandle,
    search_id: String,
    scope_path: String,
    query: String,
    options: Option<SearchExecutionOptions>,
    allowed_paths: State<'_, AllowedPathsState>,
    search_state: State<'_, SearchManagerState>,
) -> AppResult<String> {
    let path = PathBuf::from(&scope_path);
    if !path.exists() {
        return Err(AppError::Custom(format!(
            "Search target path does not exist: {}",
            scope_path
        )));
    }

    // Canonicalize scope path to resolve symlinks and junctions
    let canonical_scope = match path.canonicalize() {
        Ok(c) => normalize_path(&c),
        Err(e) => {
            return Err(AppError::Custom(format!(
                "Cannot resolve search scope path: {}",
                e
            )))
        }
    };

    if !allowed_paths.is_allowed(&canonical_scope) {
        return Err(AppError::Custom(
            "Access denied: Resolved search scope is outside permitted workspace roots".to_string(),
        ));
    }

    let parsed_query = parse_search_query(&query)
        .map_err(|e| AppError::Custom(format!("Query syntax error: {}", e)))?;

    let cancel_token = search_state.register(&search_id);
    let opts = options.unwrap_or(SearchExecutionOptions {
        search_content: false,
        max_results: Some(2000),
        max_file_size_bytes: Some(DEFAULT_MAX_FILE_SIZE_BYTES),
        custom_exclusions: None,
        include_hidden: Some(false),
    });

    let s_id = search_id.clone();
    let app_clone = app_handle.clone();
    let allowed_clone = AllowedPathsState {
        allowed_roots: Mutex::new(lock_poison_recover(&allowed_paths.allowed_roots).clone()),
    };

    tokio::task::spawn_blocking(move || {
        // RAII guard ensures search ID is removed from state on any exit
        struct SearchGuard {
            id: String,
            app: AppHandle,
        }
        impl Drop for SearchGuard {
            fn drop(&mut self) {
                if let Some(state) = self.app.try_state::<SearchManagerState>() {
                    state.remove(&self.id);
                }
            }
        }
        let _guard = SearchGuard {
            id: s_id.clone(),
            app: app_clone.clone(),
        };

        let (matches, total_scanned, duration_ms) = execute_streaming_search(
            Some(&app_clone),
            &s_id,
            &canonical_scope,
            &parsed_query,
            &opts,
            &cancel_token,
            Some(&allowed_clone),
        );

        let cancelled = cancel_token.load(Ordering::Relaxed);

        let _ = app_clone.emit(
            "search://done",
            SearchDoneEvent {
                search_id: s_id,
                total_matches: matches.len(),
                total_scanned: total_scanned as u64,
                duration_ms,
                cancelled,
            },
        );
    });

    Ok(search_id)
}

#[tauri::command]
pub fn cancel_file_search(
    search_id: String,
    search_state: State<'_, SearchManagerState>,
) -> AppResult<bool> {
    Ok(search_state.cancel(&search_id))
}

#[tauri::command]
pub fn get_search_index_status(
    app_handle: AppHandle,
    workspace_path: String,
) -> AppResult<Option<WorkspaceIndexStatus>> {
    let conn = crate::kv::get_db_conn(&app_handle)?;
    let mut stmt = conn
        .prepare(
            "SELECT last_indexed, file_count, status FROM indexed_workspaces WHERE workspace_path = ?1",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let res = stmt
        .query_row(rusqlite::params![workspace_path], |row| {
            Ok(WorkspaceIndexStatus {
                workspace_path: workspace_path.clone(),
                last_indexed: row.get(0)?,
                file_count: row.get(1)?,
                status: row.get(2)?,
            })
        })
        .ok();

    Ok(res)
}

#[tauri::command]
pub async fn reindex_workspace(
    app_handle: AppHandle,
    workspace_path: String,
    custom_exclusions: Option<Vec<String>>,
    allowed_paths: State<'_, AllowedPathsState>,
    search_state: State<'_, SearchManagerState>,
) -> AppResult<WorkspaceIndexStatus> {
    let p = PathBuf::from(&workspace_path);
    if !allowed_paths.is_allowed(&normalize_path(&p)) {
        return Err(AppError::Custom(
            "Access denied: Workspace outside permitted roots".to_string(),
        ));
    }

    let cancel_token = search_state.register(&format!("index_{}", workspace_path));
    let app_clone = app_handle.clone();
    let ws = workspace_path.clone();

    let res = tokio::task::spawn_blocking(move || -> Result<WorkspaceIndexStatus, String> {
        let mut conn = crate::kv::get_db_conn(&app_clone)
            .map_err(|e| format!("Failed to open DB connection: {}", e))?;
        index_workspace_internal(&mut conn, &ws, &cancel_token, custom_exclusions)
    })
    .await
    .map_err(|e| AppError::Custom(format!("Reindexing task failed: {}", e)))?
    .map_err(AppError::Custom)?;

    search_state.remove(&format!("index_{}", workspace_path));
    Ok(res)
}

#[tauri::command]
pub fn clear_search_index(app_handle: AppHandle, workspace_path: String) -> AppResult<()> {
    let mut conn = crate::kv::get_db_conn(&app_handle)?;
    let tx = conn
        .transaction()
        .map_err(|e| AppError::Database(e.to_string()))?;

    tx.execute(
        "DELETE FROM workspace_search_index WHERE workspace_root = ?1",
        rusqlite::params![workspace_path],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    tx.execute(
        "DELETE FROM indexed_workspaces WHERE workspace_path = ?1",
        rusqlite::params![workspace_path],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// UNIT & HARDENING TESTS
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_query_tokenizer_escaped_quotes() {
        let q = r#"content:"hello \"escaped world\"" ext:rs name:"my file.txt""#;
        let tokens = tokenize_query(q);
        assert_eq!(
            tokens,
            vec![
                r#"content:"hello "escaped world"""#,
                "ext:rs",
                r#"name:"my file.txt""#
            ]
        );
    }

    #[test]
    fn test_query_parser_unknown_filter_rejected() {
        let q = "szie:>10mb ext:rs";
        let res = parse_search_query(q);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Unknown filter 'szie:'"));
    }

    #[test]
    fn test_query_parser_canonical_case_grammar() {
        // case:true and case:sensitive
        let q1 = parse_search_query("test case:true").unwrap();
        assert!(q1.case_sensitive);

        let q2 = parse_search_query("test case:sensitive").unwrap();
        assert!(q2.case_sensitive);

        let q3 = parse_search_query("test case:false").unwrap();
        assert!(!q3.case_sensitive);

        let q4 = parse_search_query("test case:insensitive").unwrap();
        assert!(!q4.case_sensitive);

        let q_invalid = parse_search_query("test case:bad_val");
        assert!(q_invalid.is_err());
        assert!(q_invalid.unwrap_err().contains("Invalid 'case:' value"));
    }

    #[test]
    fn test_query_parser_invalid_size_expressions() {
        assert!(parse_search_query("size:>>10mb").is_err());
        assert!(parse_search_query("size:not_a_size").is_err());
        assert!(parse_search_query("size:10mb..1kb").is_err()); // inverted range
        assert!(parse_search_query("size:-5mb").is_err()); // negative size
    }

    #[test]
    fn test_query_parser_unicode_queries() {
        let q = "name:🦀_file.rs content:\"你好世界\" path:项目/源码";
        let parsed = parse_search_query(q).unwrap();
        assert_eq!(parsed.name_terms, vec!["🦀_file.rs"]);
        assert_eq!(parsed.content_query, Some("你好世界".to_string()));
        assert_eq!(parsed.path_patterns, vec!["项目/源码"]);
    }

    #[test]
    fn test_query_parser_case_insensitive_extension_matching() {
        let q = parse_search_query("ext:RS,Toml").unwrap();
        assert_eq!(q.extensions, vec!["rs", "toml"]);
    }

    #[test]
    fn test_content_search_pathological_long_line() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("long_line.txt");

        // Create a 150KB single-line file without any newlines
        let mut content = "A".repeat(80_000);
        content.push_str("MATCH_ME_HERE");
        content.push_str(&"B".repeat(70_000));
        std::fs::write(&file_path, content.as_bytes()).unwrap();

        let cancel = AtomicBool::new(false);
        let res = scan_file_content(
            &file_path,
            "MATCH_ME_HERE",
            false,
            DEFAULT_MAX_FILE_SIZE_BYTES,
            &cancel,
            None,
            None,
        );

        assert!(res.is_some(), "Must find match even in 150KB unbroken line");
        let (line_num, snippet, indices) = res.unwrap();
        assert_eq!(line_num, 1);
        assert!(snippet.contains("MATCH_ME_HERE"));
        assert!(!indices.is_empty());
    }

    #[test]
    fn test_content_search_invalid_utf8_lossy() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("invalid_utf8.txt");

        // Write valid prefix, invalid UTF-8 bytes (0xFF, 0xFE), then match
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"prefix data ");
        bytes.push(0xFF);
        bytes.push(0xFE);
        bytes.extend_from_slice(b" target_lossy_word suffix");
        std::fs::write(&file_path, &bytes).unwrap();

        let cancel = AtomicBool::new(false);
        let res = scan_file_content(
            &file_path,
            "target_lossy_word",
            false,
            DEFAULT_MAX_FILE_SIZE_BYTES,
            &cancel,
            None,
            None,
        );

        assert!(
            res.is_some(),
            "Invalid UTF-8 must be handled lossy without error"
        );
        let (_, snippet, _) = res.unwrap();
        assert!(snippet.contains("target_lossy_word"));
    }

    #[test]
    fn test_content_search_file_growth_bounded_by_take() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("growing.txt");

        // Write 100 bytes
        std::fs::write(&file_path, b"initial short content").unwrap();

        let cancel = AtomicBool::new(false);
        // Ask for max 10 bytes: should stop reading strictly after 10 bytes
        let res = scan_file_content(
            &file_path, "content", // appears after byte 14
            false, 10, // max 10 bytes
            &cancel, None, None,
        );
        assert!(res.is_none(), "Must not read past max_size_bytes limit");
    }

    #[test]
    fn test_content_search_symlink_escape_rejected() {
        let dir = tempdir().unwrap();
        let inside_scope = dir.path().join("scope");
        let outside_dir = dir.path().join("outside");
        std::fs::create_dir_all(&inside_scope).unwrap();
        std::fs::create_dir_all(&outside_dir).unwrap();

        let secret_file = outside_dir.join("secret.txt");
        std::fs::write(&secret_file, b"SECRET_PASSWORD_123").unwrap();

        // Create symlink inside scope pointing outside
        let link_path = inside_scope.join("symlink_to_secret.txt");

        #[cfg(windows)]
        {
            use std::os::windows::fs::symlink_file;
            if symlink_file(&secret_file, &link_path).is_err() {
                // If symlink creation fails due to Windows Developer Mode privileges, skip
                return;
            }
        }
        #[cfg(not(windows))]
        {
            use std::os::unix::fs::symlink;
            symlink(&secret_file, &link_path).unwrap();
        }

        let cancel = AtomicBool::new(false);
        let res = scan_file_content(
            &link_path,
            "SECRET_PASSWORD",
            false,
            DEFAULT_MAX_FILE_SIZE_BYTES,
            &cancel,
            Some(&inside_scope),
            None,
        );

        assert!(
            res.is_none(),
            "Symlink pointing outside search scope must be rejected"
        );
    }

    #[test]
    fn test_index_consistency_stale_record_pruning() {
        let dir = tempdir().unwrap();
        let ws = dir.path().to_string_lossy().to_string();

        let file_a = dir.path().join("keep.rs");
        let file_b = dir.path().join("will_delete.rs");
        std::fs::write(&file_a, b"fn keep() {}").unwrap();
        std::fs::write(&file_b, b"fn delete() {}").unwrap();

        let mut conn = Connection::open_in_memory().unwrap();
        crate::db_migration::run_migrations(&mut conn).unwrap();

        let cancel = AtomicBool::new(false);
        index_workspace_internal(&mut conn, &ws, &cancel, None).unwrap();

        // Now delete file_b on disk!
        std::fs::remove_file(&file_b).unwrap();

        // Query the index: stale file_b must NOT be returned!
        let q = parse_search_query("ext:rs").unwrap();
        let matches = query_workspace_index(&conn, &ws, &q, 100).unwrap();

        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].filename, "keep.rs");

        // Verify that file_b was pruned from SQLite index
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workspace_search_index WHERE filename = 'will_delete.rs'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 0,
            "Stale record must be automatically pruned from index"
        );
    }

    #[test]
    fn test_index_incremental_updates() {
        let dir = tempdir().unwrap();
        let ws = dir.path().to_string_lossy().to_string();

        let mut conn = Connection::open_in_memory().unwrap();
        crate::db_migration::run_migrations(&mut conn).unwrap();

        let new_file = dir.path().join("new_component.tsx");
        std::fs::write(&new_file, b"export const Comp = () => null;").unwrap();

        // Incremental add
        record_indexed_file_create_or_update(&conn, &ws, &new_file).unwrap();

        let q = parse_search_query("Comp").unwrap();
        let matches = query_workspace_index(&conn, &ws, &q, 10).unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].filename, "new_component.tsx");

        // Incremental rename
        let renamed_file = dir.path().join("renamed_component.tsx");
        std::fs::rename(&new_file, &renamed_file).unwrap();
        record_indexed_file_rename(&conn, &new_file, &renamed_file).unwrap();

        let q_renamed = parse_search_query("renamed").unwrap();
        let matches_renamed = query_workspace_index(&conn, &ws, &q_renamed, 10).unwrap();
        assert_eq!(matches_renamed.len(), 1);
        assert_eq!(matches_renamed[0].filename, "renamed_component.tsx");

        // Incremental delete
        std::fs::remove_file(&renamed_file).unwrap();
        record_indexed_file_delete(&conn, &renamed_file).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM workspace_search_index", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }
}
