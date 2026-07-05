pub mod components;

use leptos::prelude::*;
use crate::{log_info, make_logger};

make_logger!();

#[derive(Clone)]
pub struct ThemeContext {
    pub theme: RwSignal<String>,
}

pub fn initial_theme() -> String {
    let theme = web_sys::window()
        .and_then(|window| window.local_storage().ok().flatten())
        .and_then(|storage| storage.get_item("imphnen-theme").ok().flatten())
        .filter(|value| value == "dark" || value == "light")
        .unwrap_or_else(|| "dark".to_string());
    log_info!("Initial theme resolved: {}", theme);
    theme
}

pub fn persist_theme(theme: &str) {
    log_info!("Persisting theme: {}", theme);
    if let Some(storage) =
        web_sys::window().and_then(|window| window.local_storage().ok().flatten())
    {
        let _ = storage.set_item("imphnen-theme", theme);
    }
}
