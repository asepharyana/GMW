use serde::de::DeserializeOwned;
use wasm_bindgen::prelude::*;
use web_sys::{Request, RequestInit, RequestMode, Headers, Response};
use wasm_bindgen_futures::JsFuture;

#[derive(Debug)]
pub struct ApiError {
    pub message: String,
    pub status_code: u16,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "API error {}: {}", self.status_code, self.message)
    }
}

impl std::error::Error for ApiError {}

fn get_base_url() -> String {
    if let Some(window) = web_sys::window() {
        let location = window.location();
        let protocol = location.protocol().unwrap_or_else(|_| "http:".to_string());
        let protocol = protocol.trim_end_matches(':');
        let host = location.host().unwrap_or_else(|_| "localhost:3001".to_string());
        format!("{}://{}", protocol, host)
    } else {
        "http://localhost:3001".to_string()
    }
}

fn get_auth_header() -> Option<String> {
    // Read password from sessionStorage
    let storage = web_sys::window()?.local_storage().ok()??;
    storage.get_item("admin-password").ok()?
}

pub async fn request<T: DeserializeOwned>(
    method: &str,
    path: &str,
    body: Option<&str>,
) -> Result<T, ApiError> {
    let url = format!("{}{}", get_base_url(), path);

    let headers = Headers::new().map_err(|_| ApiError {
        message: "Failed to create headers".to_string(),
        status_code: 0,
    })?;

    if let Some(password) = get_auth_header() {
        headers.set("X-Admin-Password", &password).ok();
    }

    if body.is_some() {
        headers.set("Content-Type", "application/json").ok();
    }

    let opts = RequestInit::new();
    opts.set_method(method);
    opts.set_headers(&headers);
    opts.set_mode(RequestMode::Cors);

    if let Some(json_body) = body {
        opts.set_body(&JsValue::from_str(json_body));
    }

    let request = Request::new_with_str_and_init(&url, &opts).map_err(|e| ApiError {
        message: format!("Failed to create request: {:?}", e),
        status_code: 0,
    })?;

    let window = web_sys::window().ok_or(ApiError {
        message: "No window".to_string(),
        status_code: 0,
    })?;

    let resp_value = JsFuture::from(window.fetch_with_request(&request))
        .await
        .map_err(|e| ApiError {
            message: format!("Fetch failed: {:?}", e),
            status_code: 0,
        })?;

    let response: Response = resp_value.dyn_into().map_err(|_| ApiError {
        message: "Invalid response".to_string(),
        status_code: 0,
    })?;

    let status = response.status();
    if status >= 400 {
        let text = JsFuture::from(
            response.text().map_err(|_| ApiError {
                message: "Failed to read error body".to_string(),
                status_code: status,
            })?
        )
        .await
        .ok()
        .and_then(|v| v.as_string())
        .unwrap_or_default();

        return Err(ApiError {
            message: text,
            status_code: status,
        });
    }

    let text = JsFuture::from(
        response.text().map_err(|_| ApiError {
            message: "Failed to read response body".to_string(),
            status_code: status,
        })?
    )
    .await
    .map_err(|_| ApiError {
        message: "Failed to await response".to_string(),
        status_code: status,
    })?
    .as_string()
    .ok_or(ApiError {
        message: "Response is not text".to_string(),
        status_code: status,
    })?;

    serde_json::from_str(&text).map_err(|e| ApiError {
        message: format!("JSON parse error: {} — body: {}", e, &text[..text.len().min(200)]),
        status_code: status,
    })
}

pub async fn request_no_body(method: &str, path: &str) -> Result<(), ApiError> {
    request::<serde_json::Value>(method, path, None).await?;
    Ok(())
}
