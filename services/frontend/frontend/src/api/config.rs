use crate::api::client::{request, ApiError};
use serde::Deserialize;
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigResponse {
    pub monitor_guild_id: Option<String>,
}

/// GET /api/config
pub async fn get_config() -> Result<AppConfigResponse, ApiError> {
    request("GET", "/api/config", None).await
}
