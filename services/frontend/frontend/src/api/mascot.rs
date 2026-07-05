use crate::api::client::{request, ApiError};
use serde::{Deserialize, Serialize};
#[derive(Debug, Serialize)]
struct MascotChatRequest<'a> {
    message: &'a str,
}

#[derive(Debug, Deserialize)]
pub struct MascotChatResponse {
    pub response: String,
    pub timestamp: String,
}

#[derive(Debug, Deserialize)]
pub struct ChatHistoryMessage {
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

pub async fn send_mascot_message(message: &str) -> Result<MascotChatResponse, ApiError> {
    let body = serde_json::to_string(&MascotChatRequest { message }).map_err(|err| ApiError {
        message: format!("Failed to serialize mascot request: {}", err),
        status_code: 0,
    })?;
    request("POST", "/api/mascot/chat", Some(&body)).await
}

/// GET /api/mascot/chat/history
pub async fn get_chat_history() -> Result<Vec<ChatHistoryMessage>, ApiError> {
    request("GET", "/api/mascot/chat/history", None).await
}
