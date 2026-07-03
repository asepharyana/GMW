use crate::api::client::{request, request_no_body, ApiError};
use shared_types::voice::VoiceStatus;
use shared_types::media::MediaState;
use shared_types::guild::{Guild, Channel};
use serde::Serialize;

/// GET /api/guilds
pub async fn get_guilds() -> Result<Vec<Guild>, ApiError> {
    request("GET", "/api/guilds", None).await
}

/// GET /api/guilds/{guildId}/voice-channels
pub async fn get_voice_channels(guild_id: &str) -> Result<Vec<Channel>, ApiError> {
    request("GET", &format!("/api/guilds/{}/voice-channels", guild_id), None).await
}

/// GET /api/guilds/{guildId}/channels
pub async fn get_text_channels(guild_id: &str) -> Result<Vec<Channel>, ApiError> {
    request("GET", &format!("/api/guilds/{}/channels", guild_id), None).await
}

/// GET /api/voice/status
pub async fn get_voice_status() -> Result<VoiceStatus, ApiError> {
    request("GET", "/api/voice/status", None).await
}

/// POST /api/voice/connect { guildId, channelId }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectPayload {
    guild_id: String,
    channel_id: String,
}
pub async fn connect_voice(guild_id: &str, channel_id: &str) -> Result<VoiceStatus, ApiError> {
    let body = serde_json::to_string(&ConnectPayload {
        guild_id: guild_id.to_string(),
        channel_id: channel_id.to_string(),
    }).unwrap();
    request("POST", "/api/voice/connect", Some(&body)).await
}

/// POST /api/voice/disconnect
pub async fn disconnect_voice() -> Result<VoiceStatus, ApiError> {
    request("POST", "/api/voice/disconnect", Some("{}")).await
}

/// GET /api/media/status
pub async fn get_media_status() -> Result<MediaState, ApiError> {
    request("GET", "/api/media/status", None).await
}

/// POST /api/media/queue { source, mode }
#[derive(Serialize)]
struct MediaQueuePayload {
    source: String,
    mode: String,
}
pub async fn media_queue(source: &str, mode: &str) -> Result<MediaState, ApiError> {
    let body = serde_json::to_string(&MediaQueuePayload {
        source: source.to_string(),
        mode: mode.to_string(),
    }).unwrap();
    request("POST", "/api/media/queue", Some(&body)).await
}

/// POST /api/media/skip
pub async fn media_skip() -> Result<MediaState, ApiError> {
    request("POST", "/api/media/skip", Some("{}")).await
}

/// POST /api/media/stop
pub async fn media_stop() -> Result<MediaState, ApiError> {
    request("POST", "/api/media/stop", Some("{}")).await
}

/// POST /api/media/volume { volume }
#[derive(Serialize)]
struct VolumePayload { volume: f64 }
pub async fn media_volume(volume: f64) -> Result<MediaState, ApiError> {
    let body = serde_json::to_string(&VolumePayload { volume }).unwrap();
    request("POST", "/api/media/volume", Some(&body)).await
}
