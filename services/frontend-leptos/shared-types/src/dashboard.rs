use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_messages: u64,
    pub total_users: u64,
    pub total_flagged: u64,
    pub total_clean: u64,
    pub total_warned: u64,
    pub total_error: u64,
    pub total_voice_recordings: u64,
    pub total_profiles: u64,
    pub today_messages: u64,
    pub today_flagged: u64,
    pub active_users_24h: u64,
    pub top_channels: Vec<TopChannel>,
    pub moderation_overview: ModerationOverview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopChannel {
    pub channel_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_name: Option<String>,
    pub message_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModerationOverview {
    pub pending: u64,
    pub processing: u64,
    pub error: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardUser {
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_summary: Option<String>,
    pub total_messages: u64,
    pub flagged_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trust_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardUserDetail {
    #[serde(flatten)]
    pub user: DashboardUser,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_analyzed_at: Option<i64>,
    pub clean_message_streak: u64,
    pub total_infractions: u64,
    pub clean_count: u64,
    pub recent_messages: Vec<super::message::MessageRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardChannel {
    pub channel_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guild_id: Option<String>,
    pub total_messages: u64,
    pub flagged_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub culture_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_analyzed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardChannelDetail {
    #[serde(flatten)]
    pub channel: DashboardChannel,
    pub clean_count: u64,
    pub recent_messages: Vec<super::message::MessageRecord>,
}
