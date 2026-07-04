use serde::de::{self, DeserializeOwned, Deserializer};
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
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StickerInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AttachmentRef {
    pub name: String,
    pub url: String,
    #[serde(rename = "contentType")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

/// Deserialize `EmbedMedia` from either:
///   - `null` → `None`
///   - a JSON string → `Some(EmbedMedia { url: <string>, width: None, height: None })`
///   - a JSON object → standard struct deserialization
fn deser_embed_media<'de, D: Deserializer<'de>>(d: D) -> Result<Option<EmbedMedia>, D::Error> {
    let v = Option::<serde_json::Value>::deserialize(d)?;
    match v {
        None => Ok(None),
        Some(serde_json::Value::String(s)) => Ok(Some(EmbedMedia {
            url: s,
            width: None,
            height: None,
        })),
        Some(obj) => serde_json::from_value(obj).map(Some).map_err(de::Error::custom),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EmbedInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(
        default,
        deserialize_with = "deser_embed_media",
        skip_serializing_if = "Option::is_none"
    )]
    pub image: Option<EmbedMedia>,
    #[serde(
        default,
        deserialize_with = "deser_embed_media",
        skip_serializing_if = "Option::is_none"
    )]
    pub thumbnail: Option<EmbedMedia>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct EmbedMedia {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

impl<'de> Deserialize<'de> for EmbedMedia {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        // When EmbedMedia appears as a struct member (inside the object branch
        // of deser_embed_media), serde calls this directly. We delegate to a
        // derived deserializer on the struct fields.
        #[derive(serde::Deserialize)]
        struct Inner {
            url: String,
            #[serde(default)]
            width: Option<u32>,
            #[serde(default)]
            height: Option<u32>,
        }
        let inner = Inner::deserialize(d)?;
        Ok(EmbedMedia {
            url: inner.url,
            width: inner.width,
            height: inner.height,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChannelRef {
    pub channel_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_name: Option<String>,
}

// ── Helpers: deserialize JSON-string fields ────────────────
//
// The backend stores certain fields as raw JSON strings in PostgreSQL.
// The JSON response therefore contains *stringified* JSON for these fields
// (e.g. `"metadata":"{\"stickers\":[]}"`) instead of the actual JSON value.
// These helpers transparently parse the string when present, so the frontend
// works with the native Rust type regardless of whether the backend ships
// a parsed value or a stringified one.

/// Deserialize a `T` from a JSON value that may be:
///   - `null` → `None`
///   - a plain JSON value → `Some(T)` (direct serde)
///   - a JSON *string* whose *contents* are JSON for `T`
fn from_json_string_or_value<'de, T, D>(d: D) -> Result<Option<T>, D::Error>
where
    T: DeserializeOwned,
    D: Deserializer<'de>,
{
    // Intermediate Value to distinguish null / object / array / string
    let v = Option::<serde_json::Value>::deserialize(d)?;
    match v {
        None => Ok(None),
        Some(serde_json::Value::String(s)) => {
            serde_json::from_str(&s).map(Some).map_err(de::Error::custom)
        }
        Some(json) => serde_json::from_value(json).map(Some).map_err(de::Error::custom),
    }
}

/// Concrete wrapper for `metadata: Option<MessageMetadata>`.
pub(crate) fn deser_msg_meta<'de, D: Deserializer<'de>>(
    d: D,
) -> Result<Option<MessageMetadata>, D::Error> {
    from_json_string_or_value(d)
}

/// Concrete wrapper for `Option<Vec<String>>` fields
/// (ai_moderation_flags, ai_categories, etc.).
pub(crate) fn deser_str_vec<'de, D: Deserializer<'de>>(
    d: D,
) -> Result<Option<Vec<String>>, D::Error> {
    from_json_string_or_value(d)
}

// ── Message Record ────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    #[serde(
        deserialize_with = "deser_str_vec",
        skip_serializing_if = "Option::is_none"
    )]
    pub ai_moderation_flags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_moderation_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_analysis: Option<String>,
    #[serde(
        deserialize_with = "deser_str_vec",
        skip_serializing_if = "Option::is_none"
    )]
    pub ai_categories: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_recommended_action: Option<AiRecommendedAction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_analyzed_at: Option<i64>,
    #[serde(
        deserialize_with = "deser_msg_meta",
        skip_serializing_if = "Option::is_none"
    )]
    pub metadata: Option<MessageMetadata>,
}

// ── Pagination ────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PageResult<T> {
    pub data: Vec<T>,
    #[serde(rename = "nextCursor")]
    pub next_cursor: Option<String>,
}

// ── Attachment ────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
