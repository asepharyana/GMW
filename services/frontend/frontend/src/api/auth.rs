use crate::api::client::{request, ApiError};
use serde::{Deserialize, Serialize};
use crate::{log_error, log_info, log_warn, make_logger};

make_logger!();

#[derive(Serialize)]
struct LoginPayload {
    password: String,
}

#[derive(Deserialize)]
struct LoginResponse {
    ok: bool,
}

pub async fn login(password: &str) -> Result<bool, ApiError> {
    let payload = LoginPayload {
        password: password.to_string(),
    };
    let body = serde_json::to_string(&payload).unwrap();
    let resp: LoginResponse = request("POST", "/api/auth/login", Some(&body)).await?;
    Ok(resp.ok)
}
