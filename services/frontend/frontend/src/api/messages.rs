use crate::api::client::{request, ApiError};
use shared_types::message::{MessageRecord, PageResult};

/// GET /api/messages?guildId=&limit=&channelId=&cursor=
pub async fn get_messages(
    guild_id: &str,
    limit: Option<u32>,
    channel_id: Option<&str>,
    cursor: Option<&str>,
) -> Result<PageResult<MessageRecord>, ApiError> {
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
pub async fn get_review_messages(
    guild_id: &str,
    limit: Option<u32>,
    channel_id: Option<&str>,
) -> Result<PageResult<MessageRecord>, ApiError> {
    let mut path = format!("/api/review?guildId={}", guild_id);
    if let Some(l) = limit {
        path.push_str(&format!("&limit={}", l));
    }
    if let Some(c) = channel_id {
        path.push_str(&format!("&channelId={}", c));
    }
    request("GET", &path, None).await
}

/// GET /api/messages/detail/{id}
pub async fn get_message_detail(id: &str) -> Result<Option<MessageRecord>, ApiError> {
    request("GET", &format!("/api/messages/detail/{}", id), None).await
}

/// POST /api/messages/{id}/reanalyze
pub async fn reanalyze_message(id: &str) -> Result<(), ApiError> {
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
