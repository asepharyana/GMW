use serde::de::DeserializeOwned;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Headers, Request, RequestInit, RequestMode, Response};
use crate::{log_debug, log_error, make_logger};

make_logger!();

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
        let host = location
            .host()
            .unwrap_or_else(|_| "localhost:3001".to_string());
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

    let headers = Headers::new().map_err(|_| {
        let msg = "Failed to create headers";
        log_error!("API {} {} failed: {}", method, path, msg);
        ApiError {
            message: msg.to_string(),
            status_code: 0,
        }
    })?;

    if let Some(password) = get_auth_header() {
        headers.set("X-Admin-Password", &password).ok();
    }

    if body.is_some() {
        headers.set("Content-Type", "application/json").ok();
    }

    log_debug!("{} {} ->", method, path);

    let opts = RequestInit::new();
    opts.set_method(method);
    opts.set_headers(&headers);
    opts.set_mode(RequestMode::Cors);

    if let Some(json_body) = body {
        opts.set_body(&JsValue::from_str(json_body));
    }

    let request = Request::new_with_str_and_init(&url, &opts).map_err(|e| {
        let msg = format!("Failed to create request: {:?}", e);
        log_error!("API {} {} failed: {}", method, path, msg);
        ApiError {
            message: msg,
            status_code: 0,
        }
    })?;

    let window = web_sys::window().ok_or_else(|| {
        let msg = "No window";
        log_error!("API {} {} failed: {}", method, path, msg);
        ApiError {
            message: msg.to_string(),
            status_code: 0,
        }
    })?;

    let resp_value = JsFuture::from(window.fetch_with_request(&request))
        .await
        .map_err(|e| {
            let msg = format!("Fetch failed: {:?}", e);
            log_error!("API {} {} failed: {}", method, path, msg);
            ApiError {
                message: msg,
                status_code: 0,
            }
        })?;

    let response: Response = resp_value.dyn_into().map_err(|_| {
        let msg = "Invalid response";
        log_error!("API {} {} failed: {}", method, path, msg);
        ApiError {
            message: msg.to_string(),
            status_code: 0,
        }
    })?;

    let status = response.status();
    if status >= 400 {
        let text = JsFuture::from(response.text().map_err(|_| {
            let msg = "Failed to read error body";
            log_error!("API {} {} failed: {}", method, path, msg);
            ApiError {
                message: msg.to_string(),
                status_code: status,
            }
        })?)
        .await
        .ok()
        .and_then(|v| v.as_string())
        .unwrap_or_default();

        log_error!("API {} {} failed: status={} {}", method, path, status, text);
        return Err(ApiError {
            message: text,
            status_code: status,
        });
    }

    let text = JsFuture::from(response.text().map_err(|_| {
        let msg = "Failed to read response body";
        log_error!("API {} {} failed: {}", method, path, msg);
        ApiError {
            message: msg.to_string(),
            status_code: status,
        }
    })?)
    .await
    .map_err(|_| {
        let msg = "Failed to await response";
        log_error!("API {} {} failed: {}", method, path, msg);
        ApiError {
            message: msg.to_string(),
            status_code: status,
        }
    })?
    .as_string()
    .ok_or_else(|| {
        let msg = "Response is not text";
        log_error!("API {} {} failed: {}", method, path, msg);
        ApiError {
            message: msg.to_string(),
            status_code: status,
        }
    })?;

    log_debug!("{} {} <- {}", method, path, status);

    serde_json::from_str(&text).map_err(|e| {
        let msg = format!(
            "JSON parse error: {} — body: {}",
            e,
            &text[..text.len().min(200)]
        );
        log_error!("API {} {} failed: {}", method, path, msg);
        ApiError {
            message: msg,
            status_code: status,
        }
    })
}

pub async fn request_no_body(method: &str, path: &str) -> Result<(), ApiError> {
    request::<serde_json::Value>(method, path, None).await?;
    Ok(())
}
