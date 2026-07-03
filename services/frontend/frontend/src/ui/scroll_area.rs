// services/frontend-leptos/frontend/src/ui/scroll_area.rs
use leptos::prelude::*;

#[component]
pub fn ScrollArea(
    #[prop(optional)] class: &'static str,
    #[prop(optional)] style: &'static str,
    children: Children,
) -> impl IntoView {
    view! {
        <div class={if !class.is_empty() { format!("scroll-area {}", class) } else { "scroll-area".to_string() }} style=style>
            {children()}
        </div>
    }
}
