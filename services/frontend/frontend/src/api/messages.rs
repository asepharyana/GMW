use crate::api::client::{request, ApiError};
use shared_types::message::{MessageRecord, PageResult};
use crate::{log_debug, make_logger};

make_logger!();

/// GET /api/messages?guildId=&limit=&channelId=&cursor=
pub async fn get_messages(
    guild_id: &str,
    limit: Option<u32>,
    channel_id: Option<&str>,
    cursor: Option<&str>,
) -> Result<PageResult<MessageRecord>, ApiError> {
    log_debug!("get_messages: guild_id={}, limit={:?}, channel_id={:?}, cursor={:?}", guild_id, limit, channel_id, cursor);
    let mut path = format!("/api/messages?guildId={}", guild_id);
    if let Some(l) = limit {
        path.push_str(&format!("&limit={}", l));
    }
    if let Some(c) = channel_id {
        path.push_str(&format!("&channelId={}", c));
    }
    if let Some(c) = cursor {
        path.push_str(&format!("&cursor={}", c));
    }
    request("GET", &path, None).await
}

/// GET /api/review?params
/// Backend `GET /review` accepts `channelId` and `limit` (not guildId).
pub async fn get_review_messages(
    limit: Option<u32>,
    channel_id: Option<&str>,
) -> Result<PageResult<MessageRecord>, ApiError> {
    log_debug!("get_review_messages: limit={:?}, channel_id={:?}", limit, channel_id);
    let mut path = "/api/review".to_string();
    let mut params = vec![];
    if let Some(l) = limit {
        params.push(format!("limit={}", l));
    }
    if let Some(c) = channel_id {
        params.push(format!("channelId={}", c));
    }
    if !params.is_empty() {
        path.push_str(&format!("?{}", params.join("&")));
    }
    request("GET", &path, None).await
}

/// GET /api/messages/images?guildId=&limit=
pub async fn get_images(
    guild_id: &str,
    limit: Option<u32>,
) -> Result<PageResult<MessageRecord>, ApiError> {
    log_debug!("get_images: guild_id={}, limit={:?}", guild_id, limit);
    let mut path = format!("/api/messages/images?guildId={}", guild_id);
    if let Some(l) = limit {
        path.push_str(&format!("&limit={}", l));
    }
    request("GET", &path, None).await
}

/// GET /api/messages/detail/{id}
pub async fn get_message_detail(id: &str) -> Result<Option<MessageRecord>, ApiError> {
    log_debug!("get_message_detail: id={}", id);
    request("GET", &format!("/api/messages/detail/{}", id), None).await
}

/// POST /api/messages/{id}/reanalyze
pub async fn reanalyze_message(id: &str) -> Result<(), ApiError> {
    log_debug!("reanalyze_message: id={}", id);
    let _: serde_json::Value = request(
        "POST",
        &format!("/api/messages/{}/reanalyze", id),
        Some("{}"),
    )
    .await?;
    Ok(())
}

/// POST /api/messages/reanalyze-batch
pub async fn reanalyze_batch() -> Result<u64, ApiError> {
    log_debug!("reanalyze_batch");
    #[derive(serde::Deserialize)]
    #[allow(dead_code)]
    struct BatchResp {
        ok: bool,
        count: u64,
    }
    let resp: BatchResp = request("POST", "/api/messages/reanalyze-batch", Some("{}")).await?;
    Ok(resp.count)
}

/// GET /api/analysis/search?q=&limit=
pub async fn search_messages(
    query: &str,
    limit: Option<u32>,
) -> Result<Vec<MessageRecord>, ApiError> {
    log_debug!("search_messages: query={}, limit={:?}", query, limit);
    #[derive(serde::Deserialize)]
    struct SearchResult {
        results: Vec<MessageRecord>,
    }
    let mut path = format!("/api/analysis/search?q={}", query);
    if let Some(l) = limit {
        path.push_str(&format!("&limit={}", l));
    }
    let resp: SearchResult = request("GET", &path, None).await?;
    Ok(resp.results)
}
