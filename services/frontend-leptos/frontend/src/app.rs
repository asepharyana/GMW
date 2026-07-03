use leptos::prelude::*;
use shared_types::ui_state::Tab;
use crate::auth::AuthOverlay;
use crate::ws::context::WsContext;
use crate::features::messages::MessagesPanel;
use crate::features::live::LivePanel;

#[derive(Clone)]
pub struct AppConfig {
    pub monitor_guild_id: Option<String>,
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
        authenticated: create_rw_signal(false),
        password: create_rw_signal(String::new()),
    };
    let ui = UiContext {
        active_tab: create_rw_signal(Tab::Messages),
        selected_guild: create_rw_signal(None),
    };

    provide_context(auth.clone());
    provide_context(ui.clone());

    let config = AppConfig {
        monitor_guild_id: None,
    };
    provide_context(config);

    let ws = WsContext::new("ws://localhost:3001/ws");
    provide_context(ws.clone());

    // Auth check: redirect "live" tab to "messages" if not authenticated
    create_effect(move |_| {
        if !auth.authenticated.get() && ui.active_tab.get() == Tab::Live {
            ui.active_tab.set(Tab::Messages);
        }
    });

    {
        let ws = ws.clone();
        let auth = auth.clone();
        create_effect(move |_| {
            if auth.authenticated.get() {
                ws.connect();
            }
        });
    }

    view! {
        <div data-theme="light">
            // Auth overlay
            {move || (!auth.authenticated.get()).then(|| {
                view! { <AuthOverlay /> }
            })}

            // Main content (minimal for now — filled in later tasks)
            <div style="display: flex; flex-direction: column; height: 100vh;">
                <header style="height: var(--header-height); border-bottom: 1px solid var(--surface-border); display: flex; align-items: center; padding: 0 1rem;">
                    <span style="font-weight: 700; color: var(--color-primary);">"IMPHNEN"</span>
                    <span style="margin-left: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">"Discord Moderation"</span>
                </header>

                <main style="flex: 1; display: flex;">
                    // Sidebar placeholder
                    <nav style="width: var(--sidebar-width); border-right: 1px solid var(--surface-border); padding: 1rem;">
                        <div class="flex flex-col gap-2">
                            <TabButton tab=Tab::Messages ui=ui.clone() label="Pesan & Moderasi" />
                            <TabButton tab=Tab::Live ui=ui.clone() label="Voice & Media" />
                            <TabButton tab=Tab::Dashboard ui=ui.clone() label="Dashboard Guild" />
                        </div>
                    </nav>

                    // Content area
                    <div style="flex: 1; overflow: auto; padding: 1.5rem;">
                        {move || match ui.active_tab.get() {
                            Tab::Messages => view! { <MessagesPanel /> }.into_any(),
                            Tab::Live => view! { <LivePanel /> }.into_any(),
                            Tab::Dashboard => view! { <div>"Dashboard Panel"</div> }.into_any(),
                        }}
                    </div>
                </main>
            </div>
        </div>
    }
}

// ── Tab Button Helper ───────────────────────────────────

#[component]
fn TabButton(
    tab: Tab,
    ui: UiContext,
    label: &'static str,
) -> impl IntoView {
    let active_tab = ui.active_tab.clone();
    let tab1 = tab.clone();
    let tab2 = tab.clone();
    let tab3 = tab.clone();
    let tab4 = tab;

    view! {
        <button
            class:btn=true
            class:btn-ghost=true
            class:btn-active=move || active_tab.get() == tab1
            on:click=move |_| active_tab.set(tab4.clone())
            style:background=move || if active_tab.get() == tab2 { "var(--surface-overlay)" } else { "" }
            style:color=move || if active_tab.get() == tab3 { "var(--color-primary)" } else { "" }
            style:width="100%"
            style:justify-content="flex-start"
        >
            {label}
        </button>
    }
}
