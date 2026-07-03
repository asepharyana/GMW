use leptos::prelude::*;

#[derive(Clone)]
pub enum BadgeVariant {
    Default,
    Primary,
    Success,
    Warning,
    Destructive,
    Outline,
    Info,
}

impl Default for BadgeVariant {
    fn default() -> Self {
        Self::Default
    }
}

#[component]
pub fn Badge(
    #[prop(optional)] variant: BadgeVariant,
    children: Children,
) -> impl IntoView {
    let variant_class = match variant {
        BadgeVariant::Default => "",
        BadgeVariant::Primary => "badge-primary",
        BadgeVariant::Success => "badge-success",
        BadgeVariant::Warning => "badge-warning",
        BadgeVariant::Destructive => "badge-destructive",
        BadgeVariant::Outline => "badge-outline",
        BadgeVariant::Info => "badge-info",
    };

    let combined = format!("badge {}", variant_class);

    view! {
        <span class=combined>
            {children()}
        </span>
    }
}
