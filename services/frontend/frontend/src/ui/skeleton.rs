// services/frontend-leptos/frontend/src/ui/skeleton.rs
use leptos::prelude::*;

#[derive(Clone, Default)]
pub enum SkeletonShape {
    #[default]
    Rounded,
    Circular,
    Rectangular,
}

#[component]
pub fn Skeleton(
    #[prop(optional)] width: &'static str,
    #[prop(optional)] height: &'static str,
    #[prop(optional)] shape: SkeletonShape,
) -> impl IntoView {
    let shape_class = match shape {
        SkeletonShape::Rounded => "",
        SkeletonShape::Circular => "skeleton-circular",
        SkeletonShape::Rectangular => "skeleton-rectangular",
    };
    let combined = format!("skeleton {}", shape_class);
    view! {
        <div
            class=combined
            style=format!("width: {}; height: {};", width, height)
        ></div>
    }
}
