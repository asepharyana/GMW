use crate::api::config as config_api;
use crate::features::dashboard::DashboardPanel;
use crate::features::live::LivePanel;
use crate::features::messages::MessagesPanel;
use crate::features::polish::components::{MascotChatbot, ParticleBackground, ThemeToggle};
use crate::features::polish::{initial_theme, ThemeContext};
use crate::ws::context::WsContext;
use leptos::prelude::*;
use shared_types::ui_state::Tab;
use wasm_bindgen_futures::spawn_local;

/// Derive WebSocket URL from the page's own origin.
/// In development (serve on :8080, backend on :3001) use the detected host + /ws path.
/// In production (nginx proxies /ws to backend) the same logic works.
fn get_ws_url() -> String {
    web_sys::window()
        .map(|w| {
            let loc = w.location();
            let protocol = loc.protocol().unwrap_or_else(|_| "http:".to_string());
            let host = loc.host().unwrap_or_else(|_| "localhost:3001".to_string());
            let ws_proto = if protocol.starts_with("https") {
                "wss"
            } else {
                "ws"
            };
            format!("{}://{}/ws", ws_proto, host)
        })
        .unwrap_or_else(|| "ws://localhost:3001/ws".to_string())
}

#[derive(Clone)]
pub struct AppConfig {
    pub monitor_guild_id: RwSignal<Option<String>>,
}

// ── Contexts ────────────────────────────────────────────

#[derive(Clone)]
pub struct AuthContext {
    pub authenticated: RwSignal<bool>,
    pub password: RwSignal<String>,
}

#[derive(Clone)]
pub struct UiContext {
    pub active_tab: RwSignal<Tab>,
    pub selected_guild: RwSignal<Option<String>>,
}

// ── App ─────────────────────────────────────────────────

#[component]
pub fn App() -> impl IntoView {
    // Initialize contexts
    let auth = AuthContext {
        authenticated: RwSignal::new(false),
        password: RwSignal::new(String::new()),
    };
    let ui = UiContext {
        active_tab: RwSignal::new(Tab::Messages),
        selected_guild: RwSignal::new(None),
    };
    let theme = ThemeContext {
        theme: RwSignal::new(initial_theme()),
    };

    provide_context(auth.clone());
    provide_context(ui.clone());
    provide_context(theme.clone());

    let config = AppConfig {
        monitor_guild_id: RwSignal::new(None),
    };
    provide_context(config.clone());

    let ws = WsContext::new(&get_ws_url());
    provide_context(ws.clone());

    ws.connect();

    // Try to fetch config on startup (works if password is already in localStorage)
    spawn_local({
        let config = config.clone();
        async move {
            match config_api::get_config().await {
                Ok(cfg) => {
                    web_sys::console::log_2(
                        &"[config] fetched OK".into(),
                        &format!("monitorGuildId={:?}", cfg.monitor_guild_id).into(),
                    );
                    config.monitor_guild_id.set(cfg.monitor_guild_id);
                }
                Err(e) => {
                    web_sys::console::log_1(
                        &format!("[config] failed to fetch: {}", e).into(),
                    );
                }
            }
        }
    });

    // Re-fetch config when user authenticates (handles first-time login)
    Effect::new(move |_| {
        if auth.authenticated.get() {
            spawn_local({
                let config = config.clone();
                async move {
                    match config_api::get_config().await {
                        Ok(cfg) => {
                            config.monitor_guild_id.set(cfg.monitor_guild_id);
                        }
                        Err(e) => {
                            web_sys::console::log_1(
                                &format!("[config] fetch after auth failed: {}", e).into(),
                            );
                        }
                    }
                }
            });
        }
    });

    view! {
        <div data-theme=move || theme.theme.get()>
            <ParticleBackground />

            // Main content
            <div class="app-shell">
                <header class="app-header">
                    <div class="app-brand">
                        <span class="app-brand-mark">"IMPHNEN"</span>
                        <span class="app-brand-subtitle">"Discord Moderation"</span>
                    </div>
                    <ThemeToggle />
                </header>

                <main class="app-main">
                    <nav class="app-sidebar">
                        <div class="flex flex-col gap-2">
                            <TabButton tab=Tab::Messages ui=ui.clone() label="Pesan & Moderasi" />
                            <TabButton tab=Tab::Dashboard ui=ui.clone() label="Dashboard Guild" />
                            <TabButton tab=Tab::Live ui=ui.clone() label="Voice & Media" />
                        </div>
                    </nav>

                    <div class="app-content">
                        {move || match ui.active_tab.get() {
                            Tab::Messages => view! { <MessagesPanel /> }.into_any(),
                            Tab::Live => view! { <LivePanel /> }.into_any(),
                            Tab::Dashboard => view! { <DashboardPanel /> }.into_any(),
                        }}
                    </div>
                </main>
            </div>

            {move || auth.authenticated.get().then(|| view! { <MascotChatbot /> })}
        </div>
    }
}

// ── Tab Button Helper ───────────────────────────────────

#[component]
fn TabButton(tab: Tab, ui: UiContext, label: &'static str) -> impl IntoView {
    let active_tab = ui.active_tab;
    let tab1 = tab.clone();
    let tab2 = tab.clone();
    let tab3 = tab.clone();
    let tab4 = tab;

    view! {
        <button
            class="sidebar-btn"
            class:is-active=move || active_tab.get() == tab1
            on:click=move |_| active_tab.set(tab4.clone())
        >
            {label}
        </button>
    }
}
