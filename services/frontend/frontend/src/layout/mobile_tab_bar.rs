use crate::app::UiContext;
use leptos::prelude::*;
use shared_types::ui_state::Tab;

#[component]
pub fn MobileTabBar() -> impl IntoView {
    let ui = use_context::<UiContext>().expect("UiContext not provided");

    view! {
        <div class="mobile-tab-bar">
            <MobileTabItem label="Pesan" tab=Tab::Messages ui=ui.clone() />
            <MobileTabItem label="Voice" tab=Tab::Live ui=ui.clone() />
            <MobileTabItem label="Dashboard" tab=Tab::Dashboard ui=ui.clone() />
        </div>
    }
}

#[component]
fn MobileTabItem(label: &'static str, tab: Tab, ui: UiContext) -> impl IntoView {
    let tab_active = tab.clone();
    let tab_click = tab;

    view! {
        <button
            class="mobile-tab-item"
            class:is-active=move || ui.active_tab.get() == tab_active
            on:click=move |_| ui.active_tab.set(tab_click.clone())
        >
            <span class="mobile-tab-item-icon">
                {match tab_active {
                    Tab::Messages => "💬",
                    Tab::Live => "🎮",
                    Tab::Dashboard => "📊",
                }}
            </span>
            <span>{label}</span>
        </button>
    }
}
