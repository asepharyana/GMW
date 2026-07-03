// services/frontend-leptos/frontend/src/ui/select.rs
use leptos::prelude::*;

/// Simple select — values and labels are the same
/// For options with different value/label, use `SelectOptions`
#[component]
pub fn Select(
    #[prop(optional)] value: RwSignal<String>,
    options: Vec<(&'static str, &'static str)>, // (value, label)
    #[prop(optional)] placeholder: &'static str,
    #[prop(optional)] class: &'static str,
    #[prop(optional)] on_change: Option<Box<dyn Fn(String)>>,
) -> impl IntoView {
    view! {
        <select
            class={if !class.is_empty() { format!("select {}", class) } else { "select".to_string() }}
            prop:value=move || value.get()
            on:change=move |ev| {
                let val = event_target_value(&ev);
                value.set(val.clone());
                if let Some(ref cb) = on_change { cb(val); }
            }
        >
            <option value="" disabled=placeholder.len() > 0>{placeholder}</option>
            {options.into_iter().map(|(val, label)| view! {
                <option value=val selected=move || value.get() == val>{label}</option>
            }).collect::<Vec<_>>()}
        </select>
    }
}
