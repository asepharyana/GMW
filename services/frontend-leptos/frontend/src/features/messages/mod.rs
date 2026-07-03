use leptos::prelude::*;

pub mod components;
pub mod hooks;

#[component]
pub fn MessagesPanel() -> impl IntoView {
    view! {
        <div>"Messages Panel (loading...)"</div>
    }
}
