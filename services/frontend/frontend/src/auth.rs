// services/frontend-leptos/frontend/src/auth.rs
use crate::api::auth as auth_api;
use crate::app::AuthContext;
use crate::app::UiContext;
use leptos::prelude::*;
use shared_types::ui_state::Tab;
use wasm_bindgen_futures::spawn_local;

#[component]
pub fn AuthOverlay() -> impl IntoView {
    let auth = use_context::<AuthContext>().expect("AuthContext not provided");
    let ui = use_context::<UiContext>();
    let (password, set_password) = signal(String::new());
    let (error, set_error) = signal(Option::<String>::None);
    let (loading, set_loading) = signal(false);

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
        let set_loading_clone = set_loading;
        let set_error_clone = set_error;

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

    let tab_messages = ui.as_ref().map(|u| u.active_tab);
    let skip_dismiss = move |_| {
        if let Some(ref t) = tab_messages {
            t.set(Tab::Messages);
        }
    };

    view! {
        <div class="modal-overlay" on:click=skip_dismiss>
            <div class="modal-content auth-box" on:click=move |ev| ev.stop_propagation()>
                <div class="modal-body" style="position:relative">
                    <button
                        on:click=skip_dismiss
                        style="position:absolute;top:0;right:0;background:none;border:none;color:var(--text-tertiary);font-size:1.25rem;cursor:pointer;padding:0.25rem;line-height:1"
                        title="Tutup"
                    >"×"</button>
                    <div class="auth-lock">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                    </div>
                    <h2 class="auth-title">"Akses Dashboard"</h2>
                    <p class="auth-desc">"Masukkan password admin untuk melanjutkan"</p>
                    <form class="auth-form" on:submit=handle_submit>
                        <input
                            type="password"
                            class="input"
                            placeholder="Password"
                            prop:value=password
                            on:input=move |ev| set_password.set(event_target_value(&ev))
                        />
                        {move || error.get().map(|e| view! {
                            <p class="auth-error">{e}</p>
                        })}
                        <button
                            type="submit"
                            class="btn btn-primary btn-lg"
                            disabled=move || loading.get()
                        >
                            {move || if loading.get() { "Memproses..." } else { "Masuk" }}
                        </button>
                        <button
                            on:click=skip_dismiss
                            class="btn btn-ghost btn-sm"
                            style="width:100%"
                        >
                            "Lihat dashboard saja"
                        </button>
                    </form>
                </div>
            </div>
        </div>
    }
}
