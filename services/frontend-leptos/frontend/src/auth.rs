// services/frontend-leptos/frontend/src/auth.rs
use leptos::prelude::*;
use wasm_bindgen_futures::spawn_local;
use crate::app::AuthContext;
use crate::api::auth as auth_api;

#[component]
pub fn AuthOverlay() -> impl IntoView {
    let auth = use_context::<AuthContext>().expect("AuthContext not provided");
    let (password, set_password) = create_signal(String::new());
    let (error, set_error) = create_signal(Option::<String>::None);
    let (loading, set_loading) = create_signal(false);

    let handle_submit = move |ev: leptos::ev::SubmitEvent| {
        ev.prevent_default();
        let pwd = password.get();
        if pwd.is_empty() {
            set_error.set(Some("Password diperlukan".to_string()));
            return;
        }
        set_loading.set(true);
        set_error.set(None);

        let auth_clone = auth.clone();
        let pwd_clone = pwd.clone();
        let set_loading_clone = set_loading.clone();
        let set_error_clone = set_error.clone();

        spawn_local(async move {
            match auth_api::login(&pwd_clone).await {
                Ok(true) => {
                    // Store password in sessionStorage
                    if let Some(storage) = web_sys::window()
                        .and_then(|w| w.local_storage().ok())
                        .flatten()
                    {
                        let _ = storage.set_item("admin-password", &pwd_clone);
                    }
                    auth_clone.authenticated.set(true);
                    auth_clone.password.set(pwd_clone);
                }
                Ok(false) => {
                    set_error_clone.set(Some("Login gagal — password salah".to_string()));
                }
                Err(e) => {
                    set_error_clone.set(Some(format!("Error: {}", e.message)));
                }
            }
            set_loading_clone.set(false);
        });
    };

    view! {
        <div class="modal-overlay">
            <div class="modal-content" style="width: 380px;">
                <div class="modal-body" style="text-align: center;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                    </div>
                    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">
                        "Akses Dashboard"
                    </h2>
                    <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
                        "Masukkan password admin untuk melanjutkan"
                    </p>
                    <form on:submit=handle_submit style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <input
                            type="password"
                            class="input"
                            placeholder="Password"
                            prop:value=password
                            on:input=move |ev| set_password.set(event_target_value(&ev))
                        />
                        {move || error.get().map(|e| view! {
                            <p style="color: var(--color-error); font-size: 0.75rem;">{e}</p>
                        })}
                        <button
                            type="submit"
                            class="btn btn-primary w-full btn-lg"
                            disabled=move || loading.get()
                        >
                            {move || if loading.get() { "Memproses..." } else { "Masuk" }}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    }
}
