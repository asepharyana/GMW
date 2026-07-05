use crate::app::UiContext;
use crate::features::polish::{persist_theme, ThemeContext};
use crate::ws::context::WsContext;
use crate::ws::handlers::WsStatus;
use leptos::prelude::*;
use shared_types::ui_state::Tab;

#[component]
pub fn Sidebar() -> impl IntoView {
    let ui = use_context::<UiContext>().expect("UiContext not provided");
    let ws = use_context::<WsContext>();
    let theme_ctx = use_context::<ThemeContext>();

    // WS status
    let ws_status = ws.as_ref().map(|w| w.status);
    let status_text = Memo::new(move |_| match ws_status.map(|s| s.get()) {
        Some(WsStatus::Connected) => "Online",
        Some(WsStatus::Connecting) => "Menghubungkan...",
        Some(WsStatus::Disconnected) => "Offline",
        Some(WsStatus::Error(_)) => "Error",
        None => "Offline",
    });
    let status_color = Memo::new(move |_| match ws_status.map(|s| s.get()) {
        Some(WsStatus::Connected) => "var(--color-success)",
        Some(WsStatus::Connecting) => "var(--color-warning)",
        Some(WsStatus::Disconnected) => "var(--text-tertiary)",
        Some(WsStatus::Error(_)) => "var(--color-error)",
        None => "var(--text-tertiary)",
    });
    let is_connecting = Memo::new(move |_| matches!(ws_status.map(|s| s.get()), Some(WsStatus::Connecting)));

    // Theme toggle
    let theme_ctx_for_dark = theme_ctx.clone();
    let is_dark = move || {
        theme_ctx_for_dark
            .as_ref()
            .map(|ctx| ctx.theme.get() == "dark")
            .unwrap_or(false)
    };
    let toggle_theme = move |_| {
        if let Some(ctx) = theme_ctx.as_ref() {
            let next = if ctx.theme.get() == "dark" { "light" } else { "dark" };
            ctx.theme.set(next.to_string());
            persist_theme(next);
        }
    };

    view! {
        <nav class="app-sidebar">
            {/* Brand */}
            <div class="sidebar-brand">
                <span class="sidebar-brand-icon">"◉"</span>
                <div class="sidebar-brand-text">
                    <span class="sidebar-brand-name">"IMPHNEN"</span>
                    <span class="sidebar-brand-subtitle">"Guild Watcher"</span>
                </div>
            </div>

            {/* Navigation */}
            <div class="sidebar-nav">
                <SidebarNavItem
                    icon="💬"
                    label="Pesan & Moderasi"
                    tab=Tab::Messages
                    ui=ui.clone()
                />
                <SidebarNavItem
                    icon="🎮"
                    label="Voice & Media"
                    tab=Tab::Live
                    ui=ui.clone()
                />
                <SidebarNavItem
                    icon="📊"
                    label="Dashboard Guild"
                    tab=Tab::Dashboard
                    ui=ui.clone()
                />
            </div>

            {/* Footer with WS status + Theme Toggle */}
            <div class="sidebar-footer">
                <div class="sidebar-footer-status">
                    <span
                        class="status-dot"
                        class:is-connecting=is_connecting
                        style:background=status_color
                    ></span>
                    <span class="status-text">{move || status_text.get()}</span>
                </div>
                <button
                    class="sidebar-theme-btn"
                    on:click=toggle_theme
                    aria-label="Toggle theme"
                >
                    {move || if is_dark() { "☀" } else { "☾" }}
                </button>
            </div>
        </nav>
    }
}

#[component]
fn SidebarNavItem(icon: &'static str, label: &'static str, tab: Tab, ui: UiContext) -> impl IntoView {
    let tab_for_active = tab.clone();
    let tab_for_click = tab;

    view! {
        <button
            class="sidebar-nav-item"
            class:is-active=move || ui.active_tab.get() == tab_for_active
            on:click=move |_| ui.active_tab.set(tab_for_click.clone())
        >
            <span class="sidebar-nav-icon">{icon}</span>
            <span>{label}</span>
        </button>
    }
}
