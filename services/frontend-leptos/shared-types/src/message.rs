use serde::{Deserialize, Serialize};

// ── AI Status ─────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiStatus {
    Pending,
    Processing,
    Clean,
    Warn,
    Flagged,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiSeverity {
    None,
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiRecommendedAction {
    None,
    Monitor,
    Warn,
    Review,
    Delete,
    Escalate,
}

// ── Message Metadata ──────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MessageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stickers: Option<Vec<StickerInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<AttachmentRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embeds: Option<Vec<EmbedInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<ChannelRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StickerInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentRef {
    pub name: String,
    pub url: String,
    #[serde(rename = "contentType")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<EmbedMedia>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<EmbedMedia>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedMedia {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelRef {
    pub channel_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_name: Option<String>,
}

// ── Message Record ────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageRecord {
    pub id: String,
    pub guild_id: String,
    pub channel_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub user_id: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_content: Option<String>,
    #[serde(rename = "type")]
    pub msg_type: String, // "text" | "edited" | "deleted"
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_status: Option<AiStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_severity: Option<AiSeverity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_confidence: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_moderation_flags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_moderation_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_analysis: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_categories: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_recommended_action: Option<AiRecommendedAction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_analyzed_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<MessageMetadata>,
}

// ── Pagination ────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageResult<T> {
    pub data: Vec<T>,
    #[serde(rename = "nextCursor")]
    pub next_cursor: Option<String>,
}

// ── Attachment ────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentRecord {
    pub id: String,
    pub message_id: String,
    pub guild_id: String,
    pub channel_id: String,
    pub filename: String,
    pub size: u64,
    #[serde(rename = "type")]
    pub mime_type: String,
    pub discord_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uploaded_url: Option<String>,
    pub upload_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload_error: Option<String>,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uploaded_at: Option<i64>,
}
