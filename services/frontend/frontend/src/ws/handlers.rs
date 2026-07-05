// services/frontend-leptos/frontend/src/ws/handlers.rs
use leptos::prelude::*;

#[derive(Debug, Clone, PartialEq)]
pub enum WsStatus {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

#[derive(Debug, Clone)]
pub enum WsEvent {
    Text(String),
    Binary(Vec<u8>),
}
