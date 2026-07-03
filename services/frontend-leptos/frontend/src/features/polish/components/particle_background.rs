use leptos::prelude::*;

#[component]
pub fn ParticleBackground() -> impl IntoView {
    view! {
        <div class="particle-bg" aria-hidden="true">
            <div class="particle-orb"></div>
            <div class="particle-orb"></div>
            <div class="particle-orb"></div>
        </div>
    }
}
