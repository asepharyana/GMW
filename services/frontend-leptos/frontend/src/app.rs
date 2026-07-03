use leptos::prelude::*;

#[component]
pub fn App() -> impl IntoView {
    view! {
        <div class="app">
            <link rel="stylesheet" href="/app.css" />
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: 'Poppins', sans-serif; font-size: 1.5rem; background: #0f172a; color: #e2e8f0;">
                "Hello from Leptos"
            </div>
        </div>
    }
}
