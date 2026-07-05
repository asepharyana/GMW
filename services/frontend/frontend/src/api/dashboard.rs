use crate::api::client::{request, ApiError};
use shared_types::dashboard::*;
use crate::{log_debug, make_logger};

make_logger!();

/// GET /api/dashboard/stats
pub async fn get_dashboard_stats() -> Result<DashboardStats, ApiError> {
    log_debug!("get_dashboard_stats");
    request("GET", "/api/dashboard/stats", None).await
}

/// GET /api/dashboard/users?limit=&cursor=&search=
pub async fn get_dashboard_users(
    limit: Option<u32>,
    cursor: Option<&str>,
    search: Option<&str>,
) -> Result<PaginatedUsers, ApiError> {
    log_debug!("get_dashboard_users: limit={:?}, cursor={:?}, search={:?}", limit, cursor, search);
    let mut path = "/api/dashboard/users".to_string();
    let mut params = vec![];
    if let Some(l) = limit {
        params.push(format!("limit={}", l));
    }
    if let Some(c) = cursor {
        params.push(format!("cursor={}", c));
    }
    if let Some(s) = search {
        params.push(format!("search={}", s));
    }
    if !params.is_empty() {
        path.push_str(&format!("?{}", params.join("&")));
    }
    request("GET", &path, None).await
}

#[derive(serde::Deserialize)]
pub struct PaginatedUsers {
    pub data: Vec<DashboardUser>,
    #[serde(rename = "nextCursor")]
    pub next_cursor: Option<String>,
}

/// GET /api/dashboard/users/{userId}
pub async fn get_dashboard_user_detail(user_id: &str) -> Result<DashboardUserDetail, ApiError> {
    log_debug!("get_dashboard_user_detail: user_id={}", user_id);
    request("GET", &format!("/api/dashboard/users/{}", user_id), None).await
}

/// GET /api/dashboard/channels?limit=&cursor=&search=&guild_id=
pub async fn get_dashboard_channels(
    limit: Option<u32>,
    cursor: Option<&str>,
    search: Option<&str>,
    guild_id: Option<&str>,
) -> Result<PaginatedChannels, ApiError> {
    log_debug!("get_dashboard_channels: limit={:?}, cursor={:?}, search={:?}, guild_id={:?}", limit, cursor, search, guild_id);
    let mut path = "/api/dashboard/channels".to_string();
    let mut params = vec![];
    if let Some(l) = limit {
        params.push(format!("limit={}", l));
    }
    if let Some(c) = cursor {
        params.push(format!("cursor={}", c));
    }
    if let Some(s) = search {
        params.push(format!("search={}", s));
    }
    if let Some(g) = guild_id {
        params.push(format!("guild_id={}", g));
    }
    if !params.is_empty() {
        path.push_str(&format!("?{}", params.join("&")));
    }
    request("GET", &path, None).await
}

#[derive(serde::Deserialize)]
pub struct PaginatedChannels {
    pub data: Vec<DashboardChannel>,
    #[serde(rename = "nextCursor")]
    pub next_cursor: Option<String>,
}

/// GET /api/dashboard/channels/{channelId}
pub async fn get_dashboard_channel_detail(
    channel_id: &str,
) -> Result<DashboardChannelDetail, ApiError> {
    log_debug!("get_dashboard_channel_detail: channel_id={}", channel_id);
    request(
        "GET",
        &format!("/api/dashboard/channels/{}", channel_id),
        None,
    )
    .await
}
