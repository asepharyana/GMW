use serde::{Deserialize, Serialize};

pub type MediaMode = String; // "music" | "screen"

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<MediaMode>,
    #[serde(rename = "durationMs")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(rename = "thumbnailUrl")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaState {
    pub playing: bool,
    #[serde(rename = "musicVolume")]
    pub music_volume: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current: Option<MediaItem>,
    pub queue: Vec<MediaItem>,
}
