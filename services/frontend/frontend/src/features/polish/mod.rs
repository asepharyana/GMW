pub mod components;

use leptos::prelude::*;

#[derive(Clone)]
pub struct ThemeContext {
    pub theme: RwSignal<String>,
}

pub fn initial_theme() -> String {
    web_sys::window()
        .and_then(|window| window.local_storage().ok().flatten())
        .and_then(|storage| storage.get_item("imphnen-theme").ok().flatten())
        .filter(|value| value == "dark" || value == "light")
        .unwrap_or_else(|| "light".to_string())
}

pub fn persist_theme(theme: &str) {
    if let Some(storage) =
        web_sys::window().and_then(|window| window.local_storage().ok().flatten())
    {
        let _ = storage.set_item("imphnen-theme", theme);
    }
}
