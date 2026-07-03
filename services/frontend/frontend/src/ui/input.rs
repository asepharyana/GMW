// services/frontend-leptos/frontend/src/ui/input.rs
use leptos::prelude::*;

#[component]
pub fn Input(
    #[prop(optional)] input_type: &'static str,
    #[prop(optional)] placeholder: &'static str,
    #[prop(optional)] value: RwSignal<String>,
    #[prop(optional)] soft: bool,
    #[prop(optional)] error: bool,
    #[prop(optional)] class: &'static str,
    #[prop(optional)] on_input: Option<Box<dyn Fn(String)>>,
) -> impl IntoView {
    view! {
        <input
            type=input_type
            class={if !class.is_empty() { format!("input {}", class) } else { "input".to_string() }}
            class:input-soft=soft
            class:input-error=error
            placeholder=placeholder
            prop:value=move || value.get()
            on:input=move |ev| {
                let val = event_target_value(&ev);
                value.set(val.clone());
                if let Some(ref cb) = on_input { cb(val); }
            }
        />
    }
}

#[component]
pub fn TextArea(
    #[prop(optional)] placeholder: &'static str,
    #[prop(optional)] value: RwSignal<String>,
    #[prop(optional)] rows: u32,
    #[prop(optional)] class: &'static str,
) -> impl IntoView {
    view! {
        <textarea
            class={if !class.is_empty() { format!("input {}", class) } else { "input".to_string() }}
            placeholder=placeholder
            prop:value=move || value.get()
            on:input=move |ev| value.set(event_target_value(&ev))
            rows=rows
        ></textarea>
    }
}
