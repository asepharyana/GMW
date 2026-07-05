use crate::api::config as config_api;
use crate::features::dashboard::DashboardPanel;
use crate::features::live::LivePanel;
use crate::features::messages::MessagesPanel;
use crate::features::polish::components::{MascotChatbot, ParticleBackground};
use crate::features::polish::{initial_theme, ThemeContext};
use crate::layout::sidebar::Sidebar;
use crate::ws::context::WsContext;
use leptos::prelude::*;
use shared_types::ui_state::Tab;
use wasm_bindgen_futures::spawn_local;
use crate::{log_info, log_warn, make_logger};

make_logger!();

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

#[component]
pub fn App() -> impl IntoView {
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
    log_info!("App mounted, WS connecting to {}", get_ws_url());

    spawn_local({
        let config = config.clone();
        async move {
            match config_api::get_config().await {
                Ok(cfg) => {
                    log_info!("[config] fetched OK — monitorGuildId={:?}", cfg.monitor_guild_id);
                    config.monitor_guild_id.set(cfg.monitor_guild_id);
                }
                Err(e) => {
                    log_warn!("[config] failed to fetch: {}", e);
                }
            }
        }
    });

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
                            log_info!("[config] fetch after auth failed: {}", e);
                        }
                    }
                }
            });
        }
    });

    view! {
        <div data-theme=move || theme.theme.get()>
            <ParticleBackground />

            <div class="app-shell">
                <Sidebar />

                <div class="app-content">
                    {move || match ui.active_tab.get() {
                        Tab::Messages => view! { <MessagesPanel /> }.into_any(),
                        Tab::Live => view! { <LivePanel /> }.into_any(),
                        Tab::Dashboard => view! { <DashboardPanel /> }.into_any(),
                    }}
                </div>
            </div>

            {move || auth.authenticated.get().then(|| view! { <MascotChatbot /> })}
        </div>
    }
}
