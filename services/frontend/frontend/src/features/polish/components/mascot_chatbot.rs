use leptos::prelude::*;
use wasm_bindgen_futures::spawn_local;

#[derive(Clone, PartialEq)]
enum ChatRole {
    User,
    Mascot,
}

#[derive(Clone)]
struct ChatMessage {
    #[allow(dead_code)]
    id: String,
    role: ChatRole,
    content: String,
}

#[component]
pub fn MascotChatbot() -> impl IntoView {
    let open = RwSignal::new(false);
    let minimized = RwSignal::new(false);
    let loading = RwSignal::new(false);
    let input = RwSignal::new(String::new());
    let messages = RwSignal::new(vec![ChatMessage {
        id: "init-1".to_string(),
        role: ChatRole::Mascot,
        content:
            "Halo! 👋 Aku mascot IMPHNEN. Tanya aku soal analytics, pesan, atau moderation queue."
                .to_string(),
    }]);

    // Fetch chat history when the panel opens
    Effect::new(move |_| {
        if open.get() {
            spawn_local(async move {
                if let Ok(history) = crate::api::mascot::get_chat_history().await {
                    messages.update(|list| {
                        // Keep the initial greeting, then append history messages
                        let greeting = list.first().cloned();
                        list.clear();
                        if let Some(g) = greeting {
                            list.push(g);
                        }
                        for msg in history {
                            let role = if msg.role == "user" {
                                ChatRole::User
                            } else {
                                ChatRole::Mascot
                            };
                            list.push(ChatMessage {
                                id: format!("hist-{}", list.len()),
                                role,
                                content: msg.content,
                            });
                        }
                    });
                }
            });
        }
    });

    let send_message = move || {
        let text = input.get_untracked().trim().to_string();
        if text.is_empty() || loading.get_untracked() {
            return;
        }

        let now = js_sys::Date::now() as u64;
        messages.update(|list| {
            list.push(ChatMessage {
                id: format!("user-{}", now),
                role: ChatRole::User,
                content: text.clone(),
            })
        });
        input.set(String::new());
        loading.set(true);

        spawn_local(async move {
            let response = match crate::api::mascot::send_mascot_message(&text).await {
                Ok(resp) => resp.response,
                Err(_) => fallback_response(&text),
            };

            messages.update(|list| {
                list.push(ChatMessage {
                    id: format!("mascot-{}", js_sys::Date::now() as u64),
                    role: ChatRole::Mascot,
                    content: response,
                })
            });
            loading.set(false);
        });
    };

    view! {
        <div class="mascot-widget">
            {move || if open.get() {
                view! {
                    <div class=move || if minimized.get() { "mascot-panel minimized" } else { "mascot-panel" }>
                        <div class="mascot-header">
                            <div class="flex items-center gap-2">
                                <div class="mascot-header-icon">"💬"</div>
                                <div>
                                    <div class="mascot-title">"Mascot IMPHNEN"</div>
                                    <div class="mascot-subtitle">{move || if loading.get() { "Mengetik..." } else { "Online" }}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-1">
                                <button class="mascot-icon-button" on:click=move |_| minimized.update(|v| *v = !*v)>
                                    {move || if minimized.get() { "▣" } else { "—" }}
                                </button>
                                <button class="mascot-icon-button" on:click=move |_| open.set(false)>"×"</button>
                            </div>
                        </div>

                        {move || (!minimized.get()).then(|| view! {
                            <>
                                <div class="mascot-messages">
                                    {messages.get().into_iter().map(|msg| {
                                        let is_user = msg.role == ChatRole::User;
                                        view! {
                                            <div class=if is_user { "mascot-message-row user" } else { "mascot-message-row mascot" }>
                                                {(!is_user).then(|| view! { <div class="mascot-avatar">"🤖"</div> })}
                                                <div class=if is_user { "mascot-bubble user" } else { "mascot-bubble mascot" }>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        }
                                    }).collect::<Vec<_>>()}

                                    {loading.get().then(|| view! {
                                        <div class="mascot-message-row mascot">
                                            <div class="mascot-avatar">"🤖"</div>
                                            <div class="mascot-bubble mascot typing">
                                                <span></span><span></span><span></span>
                                            </div>
                                        </div>
                                    })}
                                </div>

                                <form class="mascot-form" on:submit=move |ev| {
                                    ev.prevent_default();
                                    send_message();
                                }>
                                    <input
                                        class="mascot-input"
                                        placeholder="Tanya mascot..."
                                        prop:value=input
                                        on:input=move |ev| input.set(event_target_value(&ev))
                                        disabled=move || loading.get()
                                    />
                                    <button
                                        class="mascot-send"
                                        type="submit"
                                        disabled=move || loading.get() || input.get().trim().is_empty()
                                    >
                                        "➤"
                                    </button>
                                </form>
                            </>
                        })}
                    </div>
                }.into_any()
            } else {
                view! {
                    <button class="mascot-launcher" on:click=move |_| open.set(true) title="Open mascot chat">
                        <span>"🤖"</span>
                    </button>
                }.into_any()
            }}
        </div>
    }
}

fn fallback_response(input: &str) -> String {
    let lower = input.to_lowercase();
    if lower.contains("halo") || lower.contains("hai") {
        "Halo juga! 👋 Aku siap bantu baca kondisi server.".to_string()
    } else if lower.contains("pesan") || lower.contains("message") {
        "Cek tab Messages untuk live capture dan hasil AI moderation terbaru.".to_string()
    } else if lower.contains("voice") || lower.contains("audio") {
        "Tab Voice & Media punya voice bridge, speakers, media controls, dan recordings."
            .to_string()
    } else if lower.contains("dashboard") || lower.contains("stat") {
        "Dashboard Guild merangkum total pesan, user aktif, channel teratas, dan moderation queue."
            .to_string()
    } else {
        format!("Menarik: \"{}\". Kalau backend mascot offline, aku tetap bisa bantu arahkan ke Messages, Voice, atau Dashboard. 😊", input)
    }
}
