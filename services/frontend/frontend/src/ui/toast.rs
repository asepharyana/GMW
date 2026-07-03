// services/frontend-leptos/frontend/src/ui/toast.rs
use leptos::prelude::*;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub enum ToastType {
    Info,
    Success,
    Error,
    Warning,
}

#[derive(Clone)]
pub struct ToastMessage {
    pub id: u64,
    pub message: String,
    pub toast_type: ToastType,
}

#[derive(Clone)]
pub struct ToastContext {
    pub toasts: RwSignal<Vec<ToastMessage>>,
    next_id: Arc<Mutex<u64>>,
}

impl Default for ToastContext {
    fn default() -> Self {
        Self::new()
    }
}

impl ToastContext {
    pub fn new() -> Self {
        Self {
            toasts: RwSignal::new(vec![]),
            next_id: Arc::new(Mutex::new(0)),
        }
    }

    pub fn show(&self, message: &str, toast_type: ToastType) {
        let id = {
            let mut n = self.next_id.lock().unwrap();
            *n += 1;
            *n
        };
        let msg = ToastMessage {
            id,
            message: message.to_string(),
            toast_type,
        };
        self.toasts.update(|t| t.push(msg));

        // Auto-dismiss after 4 seconds
        let toasts = self.toasts;
        leptos::prelude::set_timeout(
            move || {
                toasts.update(|t| t.retain(|m| m.id != id));
            },
            std::time::Duration::from_secs(4),
        );
    }
}

#[component]
pub fn ToastProvider(children: Children) -> impl IntoView {
    let ctx = ToastContext::new();
    provide_context(ctx.clone());

    view! {
        {children()}
        <div class="toast-container">
            {move || ctx.toasts.get().into_iter().map(|msg| {
                let type_class = match msg.toast_type {
                    ToastType::Info => "toast-info",
                    ToastType::Success => "toast-success",
                    ToastType::Error => "toast-error",
                    ToastType::Warning => "toast-warning",
                };
                let toasts = ctx.toasts;
                view! {
                    <div class={format!("toast {}", type_class)}>
                        <span>{msg.message}</span>
                        <button class="toast-close" on:click=move |_| {
                            toasts.update(|t| t.retain(|m| m.id != msg.id));
                        }>"×"</button>
                    </div>
                }
            }).collect::<Vec<_>>()}
        </div>
    }
}
