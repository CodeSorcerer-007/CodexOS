use serde::Serialize;
use thiserror::Error;
use std::sync::PoisonError;

#[derive(Error, Debug, Serialize)]
pub enum AppError {
    #[error("File system error: {0}")]
    Io(String),

    #[error("Git operation error: {0}")]
    Git(String),

    #[error("Vault / Secret error: {0}")]
    Vault(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Network / Proxy error: {0}")]
    Network(String),

    #[error("AI execution error: {0}")]
    Ai(String),

    #[error("System command error: {0}")]
    Command(String),

    #[error("Internal state error: lock poisoned")]
    Mutex(String),

    #[error("{0}")]
    Custom(String),
}

impl AppError {
    pub fn from_lock_poison<T>(err: PoisonError<T>) -> Self {
        AppError::Mutex(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}


impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<String> for AppError {
    fn from(err: String) -> Self {
        AppError::Custom(err)
    }
}

impl From<&str> for AppError {
    fn from(err: &str) -> Self {
        AppError::Custom(err.to_string())
    }
}

impl From<trash::Error> for AppError {
    fn from(err: trash::Error) -> Self {
        AppError::Custom(err.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        AppError::Custom(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Custom(err.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::Network(err.to_string())
    }
}

impl From<regex::Error> for AppError {
    fn from(err: regex::Error) -> Self {
        AppError::Custom(err.to_string())
    }
}

impl From<zip::result::ZipError> for AppError {
    fn from(err: zip::result::ZipError) -> Self {
        AppError::Vault(err.to_string())
    }
}

impl From<hex::FromHexError> for AppError {
    fn from(err: hex::FromHexError) -> Self {
        AppError::Vault(err.to_string())
    }
}

pub type AppResult<T = ()> = Result<T, AppError>;
