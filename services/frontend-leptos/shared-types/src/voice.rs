use serde::{Deserialize, Serialize};
use crate::guild::GuildVoiceEntry;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceStatus {
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_guild_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_channel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_channel_name: Option<String>,
    pub connections: Vec<GuildVoiceEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSpeaker {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub user_id: String,
    pub username: String,
    pub avatar: String,
    pub speaking: bool,
}
