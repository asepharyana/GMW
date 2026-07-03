use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceRecording {
    pub id: String,
    pub user_id: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guild_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_name: Option<String>,
    pub filename: String,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
    pub upload_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcription: Option<String>,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uploaded_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceRecordingListResponse {
    pub items: Vec<VoiceRecording>,
    #[serde(rename = "nextCursor")]
    pub next_cursor: Option<String>,
    #[serde(rename = "hasMore")]
    pub has_more: bool,
}
