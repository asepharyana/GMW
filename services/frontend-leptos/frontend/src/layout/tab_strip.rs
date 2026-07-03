// services/frontend-leptos/frontend/src/layout/tab_strip.rs
use leptos::prelude::*;
use shared_types::ui_state::Tab;
use crate::app::UiContext;

#[component]
pub fn TabStrip() -> impl IntoView {
    let ui = use_context::<UiContext>().expect("UiContext not provided");

    view! {
        <div style="
            display: flex;
            border-bottom: 1px solid var(--surface-border);
            padding: 0 1rem;
            background: var(--surface-base);
        ">
            <TabItem label="Pesan & Moderasi" tab=Tab::Messages ui=ui.clone() />
            <TabItem label="Voice & Media" tab=Tab::Live ui=ui.clone() />
            <TabItem label="Dashboard Guild" tab=Tab::Dashboard ui=ui.clone() />
        </div>
    }
}

#[component]
fn TabItem(
    label: &'static str,
    tab: Tab,
    ui: UiContext,
) -> impl IntoView {
    let tab_color = tab.clone();
    let tab_border = tab.clone();
    let tab_click = tab;
    view! {
        <button
            on:click=move |_| ui.active_tab.set(tab_click.clone())
            style="
                padding: 0.75rem 1rem;
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                font-family: inherit;
                font-size: 0.875rem;
                font-weight: 500;
                cursor: pointer;
                color: var(--text-secondary);
                transition: all var(--transition-fast);
            "
            style:color=move || if ui.active_tab.get() == tab_color { "var(--color-primary)" } else { "" }
            style:border-bottom-color=move || if ui.active_tab.get() == tab_border { "var(--color-primary)" } else { "transparent" }
        >
            {label}
        </button>
    }
}
