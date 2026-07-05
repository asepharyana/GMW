// services/frontend-leptos/frontend/src/ui/empty_state.rs
use leptos::prelude::*;


#[component]
pub fn EmptyState(
    #[prop(optional)] icon: Option<AnyView>,
    title: &'static str,
    #[prop(optional)] description: Option<&'static str>,
    #[prop(optional)] children: Option<Children>,
) -> impl IntoView {
    view! {
        <div class="empty-state">
            {icon.map(|i| view! { <div class="empty-state-icon">{i}</div> })}
            <div class="empty-state-title">{title}</div>
            {description.map(|d| view! { <p class="empty-state-description">{d}</p> })}
            {children.map(|c| c())}
        </div>
    }
}
