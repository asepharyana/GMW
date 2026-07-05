// services/frontend-leptos/frontend/src/layout/header.rs
use crate::ws::context::WsContext;
use crate::ws::handlers::WsStatus;
use leptos::prelude::*;


#[component]
pub fn Header() -> impl IntoView {
    let ws = use_context::<WsContext>().expect("WsContext not provided");
    let ws_status = ws.status;

    let indicator_text_memo = Memo::new(move |_| match ws_status.get() {
        WsStatus::Connected => "Online",
        WsStatus::Connecting => "Menghubungkan...",
        WsStatus::Disconnected => "Offline",
        WsStatus::Error(_) => "Error",
    });
    let indicator_color_memo = Memo::new(move |_| match ws_status.get() {
        WsStatus::Connected => "var(--color-success)",
        WsStatus::Connecting => "var(--color-warning)",
        WsStatus::Disconnected => "var(--text-tertiary)",
        WsStatus::Error(_) => "var(--color-error)",
    });
    let is_connecting = Memo::new(move |_| matches!(ws_status.get(), WsStatus::Connecting));

    view! {
        <header style="
            height: var(--header-height);
            border-bottom: 1px solid var(--surface-border);
            display: flex;
            align-items: center;
            padding: 0 1.5rem;
            background: var(--surface-base);
            position: sticky;
            top: 0;
            z-index: var(--z-header);
        ">
            <div class="head-left">
                <span style="font-weight: 700; font-size: 1.125rem; color: var(--color-primary);">
                    "IMPHNEN"
                </span>
                <span style="color: var(--text-secondary); font-size: 0.75rem; padding: 0.125rem 0.5rem; background: var(--surface-overlay); border-radius: var(--radius-full);">
                    "Guild Watcher"
                </span>
            </div>

            <div class="head-right">
                <div class="head-status">
                    <span
                        class="head-status-dot"
                        class:is-connecting=is_connecting
                        style:background={move || indicator_color_memo.get()}
                    ></span>
                    <span>{move || indicator_text_memo.get()}</span>
                </div>
            </div>
        </header>
    }
}
