use leptos::prelude::*;

#[derive(Clone, Default)]
pub enum ButtonVariant {
    #[default]
    Primary,
    Secondary,
    Tertiary,
    Destructive,
    Outline,
    Ghost,
    Link,
}

#[derive(Clone, Default)]
pub enum ButtonSize {
    #[default]
    Default,
    Sm,
    Lg,
    Icon,
    IconSm,
}

#[component]
pub fn Button(
    #[prop(optional)] variant: ButtonVariant,
    #[prop(optional)] size: ButtonSize,
    #[prop(optional)] disabled: bool,
    #[prop(optional)] class: &'static str,
    #[prop(optional)] on_click: Option<Box<dyn Fn(leptos::ev::MouseEvent)>>,
    children: Children,
) -> impl IntoView {
    let variant_class = match variant {
        ButtonVariant::Primary => "btn-primary",
        ButtonVariant::Secondary => "btn-secondary",
        ButtonVariant::Tertiary => "btn-tertiary",
        ButtonVariant::Destructive => "btn-destructive",
        ButtonVariant::Outline => "btn-outline",
        ButtonVariant::Ghost => "btn-ghost",
        ButtonVariant::Link => "btn-link",
    };
    let size_class = match size {
        ButtonSize::Default => "",
        ButtonSize::Sm => "btn-sm",
        ButtonSize::Lg => "btn-lg",
        ButtonSize::Icon => "btn-icon",
        ButtonSize::IconSm => "btn-icon-sm",
    };

    let combined = format!("btn {} {} {}", variant_class, size_class, class);

    view! {
        <button
            class=combined
            disabled=disabled
            on:click=move |ev| { if let Some(ref cb) = on_click { cb(ev); } }
        >
            {children()}
        </button>
    }
}
