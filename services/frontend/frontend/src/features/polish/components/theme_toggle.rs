use crate::features::polish::{persist_theme, ThemeContext};
use leptos::prelude::*;
use crate::{log_info, make_logger};

make_logger!();

#[component]
pub fn ThemeToggle() -> impl IntoView {
    let theme_ctx = use_context::<ThemeContext>();
    let theme_for_label = theme_ctx.clone();
    let theme_for_toggle = theme_ctx.clone();

    let is_dark = move || {
        theme_for_label
            .as_ref()
            .map(|ctx| ctx.theme.get() == "dark")
            .unwrap_or(false)
    };

    let toggle = move |_| {
        if let Some(ctx) = theme_for_toggle.as_ref() {
            let next = if ctx.theme.get() == "dark" {
                "light"
            } else {
                "dark"
            };
            log_info!("Theme toggled to {}", next);
            ctx.theme.set(next.to_string());
            persist_theme(next);
        }
    };

    view! {
        <button
            class="theme-toggle"
            on:click=toggle
            aria-label="Toggle theme"
            title="Toggle theme"
        >
            {move || if is_dark() { "☀" } else { "☾" }}
        </button>
    }
}
