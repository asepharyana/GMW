// services/frontend-leptos/frontend/src/ui/modal.rs
use leptos::prelude::*;
use std::sync::Arc;

#[component]
pub fn Modal(
    is_open: RwSignal<bool>,
    #[prop(optional)] title: Option<&'static str>,
    #[prop(optional)] on_close: Option<Arc<dyn Fn() + Send + Sync + 'static>>,
    children: Children,
) -> impl IntoView {
    let oc1 = on_close.clone();
    let oc2 = on_close;

    view! {
        <div
            class="modal-overlay"
            style=move || {
                if is_open.get() {
                    String::new()
                } else {
                    "display: none;".to_string()
                }
            }
            on:click=move |_| {
                is_open.set(false);
                if let Some(ref cb) = oc1 { cb(); }
            }
        >
            <div class="modal-content" on:click=|ev| ev.stop_propagation()>
                {title.map(|t| view! {
                    <div class="modal-header">
                        <h3>{t}</h3>
                        <button class="btn btn-ghost btn-icon-sm" on:click=move |_| {
                            is_open.set(false);
                            if let Some(ref cb) = oc2 { cb(); }
                        }>"×"</button>
                    </div>
                })}
                <div class="modal-body">
                    {children()}
                </div>
            </div>
        </div>
    }
}
