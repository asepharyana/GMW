use leptos::prelude::*;
use leptos::ev::SubmitEvent;

#[component]
pub fn AuthOverlay(
    /// Called when password is submitted — parent handles the actual API call
    #[prop(default = ())]
    on_submit: (),
) -> impl IntoView {
    let (password, set_password) = create_signal(String::new());
    let (error, set_error) = create_signal(Option::<String>::None);
    let (loading, set_loading) = create_signal(false);

    let handle_submit = move |ev: SubmitEvent| {
        ev.prevent_default();
        if password.get().is_empty() {
            set_error.set(Some("Password diperlukan".to_string()));
            return;
        }
        // TODO: actual login call (wired in Task 7)
        set_loading.set(true);
    };

    view! {
        <div class="modal-overlay">
            <div class="modal-content" style="width: 380px;">
                <div class="modal-body" style="text-align: center;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">"Akses Dashboard"</h2>
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
                        {move || error.get().map(|e| view! { <p style="color: var(--color-error); font-size: 0.75rem;">{e}</p> })}
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
