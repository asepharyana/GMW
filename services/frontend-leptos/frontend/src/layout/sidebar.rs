// services/frontend-leptos/frontend/src/layout/sidebar.rs
use leptos::prelude::*;
use shared_types::ui_state::Tab;
use crate::app::UiContext;

#[component]
pub fn Sidebar() -> impl IntoView {
    let ui = use_context::<UiContext>().expect("UiContext not provided");
    let (collapsed, _set_collapsed) = create_signal(false);

    view! {
        <nav style:width=move || if collapsed.get() { "var(--sidebar-collapsed-width)" } else { "var(--sidebar-width)" }
            style="
                border-right: 1px solid var(--surface-border);
                display: flex;
                flex-direction: column;
                padding: 1rem 0.5rem;
                transition: width var(--transition-normal);
                overflow: hidden;
                flex-shrink: 0;
            "
        >
            <NavItem
                icon="message-square"
                label="Pesan & Moderasi"
                tab=Tab::Messages
                ui=ui.clone()
            />
            <NavItem
                icon="radio"
                label="Voice & Media"
                tab=Tab::Live
                ui=ui.clone()
            />
            <NavItem
                icon="shield"
                label="Dashboard Guild"
                tab=Tab::Dashboard
                ui=ui.clone()
            />
        </nav>
    }
}

#[component]
fn NavItem(
    icon: &'static str,
    label: &'static str,
    tab: Tab,
    ui: UiContext,
) -> impl IntoView {
    let tab_bg = tab.clone();
    let tab_clr = tab.clone();
    let tab_click = tab;
    let handle_click = move |_| ui.active_tab.set(tab_click.clone());

    view! {
        <button
            class="btn btn-ghost"
            style="
                justify-content: flex-start; width: 100%;
                margin-bottom: 0.25rem;
            "
            style:background=move || if ui.active_tab.get() == tab_bg { "var(--surface-overlay)" } else { "" }
            style:color=move || if ui.active_tab.get() == tab_clr { "var(--color-primary)" } else { "" }
            on:click=handle_click
        >
            {label}
        </button>
    }
}
