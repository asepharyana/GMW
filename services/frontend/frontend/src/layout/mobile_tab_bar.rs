// services/frontend-leptos/frontend/src/layout/mobile_tab_bar.rs
use crate::app::UiContext;
use leptos::prelude::*;
use shared_types::ui_state::Tab;

#[component]
pub fn MobileTabBar() -> impl IntoView {
    let ui = use_context::<UiContext>().expect("UiContext not provided");

    view! {
        <div class="hide-desktop" style="
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            background: var(--surface-base);
            border-top: 1px solid var(--surface-border);
            z-index: var(--z-overlay);
        ">
            <MobileTabItem icon="message-square" label="Pesan" tab=Tab::Messages ui=ui.clone() />
            <MobileTabItem icon="radio" label="Voice" tab=Tab::Live ui=ui.clone() />
            <MobileTabItem icon="shield" label="Dashboard" tab=Tab::Dashboard ui=ui.clone() />
        </div>
    }
}

#[component]
fn MobileTabItem(
    icon: &'static str,
    label: &'static str,
    tab: Tab,
    ui: UiContext,
) -> impl IntoView {
    let tab_active = tab.clone();
    let tab_click = tab;
    view! {
        <button
            on:click=move |_| ui.active_tab.set(tab_click.clone())
            style="
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 0.25rem;
                padding: 0.5rem;
                background: none;
                border: none;
                font-family: inherit;
                font-size: 0.625rem;
                cursor: pointer;
                transition: color var(--transition-fast);
            "
            style:color=move || if ui.active_tab.get() == tab_active { "var(--color-primary)" } else { "var(--text-tertiary)" }
        >
            <span style="font-size: 1.25rem;">
                // In Phase 2, replace text with lucide-leptos icons
                {icon}
            </span>
            <span>{label}</span>
        </button>
    }
}
