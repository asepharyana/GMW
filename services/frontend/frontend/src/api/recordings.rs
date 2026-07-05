use crate::api::client::{request, request_no_body, ApiError};
use shared_types::recording::VoiceRecordingListResponse;
/// GET /api/recordings?limit=&cursor=
pub async fn get_recordings(
    limit: Option<u32>,
    cursor: Option<&str>,
) -> Result<VoiceRecordingListResponse, ApiError> {
    let mut path = "/api/recordings".to_string();
    let mut params = vec![];
    if let Some(l) = limit {
        params.push(format!("limit={}", l));
    }
    if let Some(c) = cursor {
        params.push(format!("cursor={}", c));
    }
    if !params.is_empty() {
        path.push_str(&format!("?{}", params.join("&")));
    }
    request("GET", &path, None).await
}

/// DELETE /api/recordings/{id}
pub async fn delete_recording(id: &str) -> Result<(), ApiError> {
    request_no_body("DELETE", &format!("/api/recordings/{}", id)).await
}
