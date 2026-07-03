use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Tab {
    Messages,
    Live,
    Dashboard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_guild: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_voice_guild: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_voice_channel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text_guild: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text_channel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_tab: Option<Tab>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_listening: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_streaming: Option<bool>,
}
