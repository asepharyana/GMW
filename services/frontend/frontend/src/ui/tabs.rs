// services/frontend-leptos/frontend/src/ui/tabs.rs
use leptos::prelude::*;

#[component]
pub fn Tabs(
    active: RwSignal<String>,
    #[prop(optional)] class: &'static str,
    children: Children,
) -> impl IntoView {
    view! {
        <div class={if !class.is_empty() { format!("tabs {}", class) } else { "tabs".to_string() }}>
            {children()}
        </div>
    }
}

#[component]
pub fn TabList(
    #[prop(optional)] class: &'static str,
    children: Children,
) -> impl IntoView {
    view! {
        <div class={if !class.is_empty() { format!("tab-list {}", class) } else { "tab-list".to_string() }} role="tablist">
            {children()}
        </div>
    }
}

#[component]
pub fn TabTrigger(
    value: String,
    active: RwSignal<String>,
    children: Children,
) -> impl IntoView {
    let v1 = value.clone();
    let v2 = value.clone();
    view! {
        <button
            class="tab-trigger"
            class:active=move || active.get() == v1
            role="tab"
            aria-selected=move || if active.get() == v2 { "true" } else { "false" }
            on:click=move |_| active.set(value.clone())
        >
            {children()}
        </button>
    }
}

#[component]
pub fn TabContent(
    value: String,
    active: RwSignal<String>,
    children: Children,
) -> impl IntoView {
    let is_selected = move || active.get() == value;
    view! {
        <div
            class="tab-content"
            role="tabpanel"
            style:display=move || if is_selected() { "block" } else { "none" }
        >
            {children()}
        </div>
    }
}
