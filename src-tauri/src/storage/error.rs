use std::{fmt, io};

#[derive(Debug)]
pub struct StorageError {
    pub code: &'static str,
    pub message: String,
}

impl StorageError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("not_found", message)
    }

    pub fn invalid_payload(message: impl Into<String>) -> Self {
        Self::new("invalid_payload", message)
    }

    pub fn database(error: rusqlite::Error) -> Self {
        Self::new("database_error", error.to_string())
    }

    pub fn io(error: io::Error) -> Self {
        Self::new("io_error", error.to_string())
    }
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for StorageError {}

impl serde::Serialize for StorageError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;

        let mut state = serializer.serialize_struct("StorageError", 2)?;
        state.serialize_field("code", self.code)?;
        state.serialize_field("message", &self.message)?;
        state.end()
    }
}

impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        Self::database(error)
    }
}

impl From<io::Error> for StorageError {
    fn from(error: io::Error) -> Self {
        Self::io(error)
    }
}

impl From<serde_json::Error> for StorageError {
    fn from(error: serde_json::Error) -> Self {
        Self::invalid_payload(error.to_string())
    }
}

pub type StorageResult<T> = Result<T, StorageError>;
