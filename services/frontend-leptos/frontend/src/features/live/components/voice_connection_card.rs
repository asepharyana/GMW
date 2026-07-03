use leptos::prelude::*;
use wasm_bindgen::prelude::*;
use crate::features::live::hooks::use_voice_control::{use_voice_control, VoiceControlState};

/// VoiceConnectionCard component for Leptos
/// Renders guild and voice channel selectors with connect/disconnect controls
#[component]
pub fn VoiceConnectionCard(
    #[prop(optional)] voice_state: Option<VoiceControlState>,
    #[prop(optional)] class: &'static str,
) -> impl IntoView {
    let default_state = use_voice_control();
    let state = voice_state.unwrap_or(default_state);

    // Reactive signal for selected guild
    let (selected_guild, set_selected_guild) = create_signal::<String>(String::new());
    // Reactive signal for selected channel
    let (selected_channel, set_selected_channel) = create_signal::<String>(String::new());

    // When guild is selected, load voice channels
    create_effect(move |_| {
        let guild_id = selected_guild.get();
        if !guild_id.is_empty() {
            (state.load_voice_channels)(guild_id);
        }
    });

    // Load guilds on mount
    create_effect(move |_| {
        (state.load_guilds)();
    });

    let on_guild_change = move |ev: leptos::ev::Event| {
        if let Some(target) = ev.target() {
            if let Ok(select_el) = target.dyn_into::<web_sys::HtmlSelectElement>() {
                set_selected_guild.set(select_el.value());
            }
        }
    };

    let on_channel_change = move |ev: leptos::ev::Event| {
        if let Some(target) = ev.target() {
            if let Ok(select_el) = target.dyn_into::<web_sys::HtmlSelectElement>() {
                set_selected_channel.set(select_el.value());
            }
        }
    };

    let on_join_click = move |_| {
        let guild_id = selected_guild.get();
        let channel_id = selected_channel.get();
        if !guild_id.is_empty() && !channel_id.is_empty() {
            (state.join_voice)(guild_id, channel_id);
        }
    };

    let on_disconnect_click = move |_| {
        (state.leave_voice)();
    };

    // Read signals for reactive rendering
    let guilds = state.guilds;
    let voice_channels = state.voice_channels;
    let loading = state.loading;
    let error = state.error;
    let voice_status = state.voice_status;

    let is_connected = move || {
        voice_status.get().map(|s| s.connected).unwrap_or(false)
    };

    let can_join = move || {
        !selected_guild.get().is_empty() && !selected_channel.get().is_empty() && !loading.get()
    };

    let can_disconnect = move || {
        is_connected() && !loading.get()
    };

    view! {
        <div class=format!("rounded-xl border border-border bg-card shadow-sm {}", class)>
            <div class="p-6">
                <div class="flex items-center gap-2 mb-2">
                    <svg
                        class="h-5 w-5 text-primary"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                    </svg>
                    <h3 class="text-lg font-semibold tracking-tight">"Voice Bridge"</h3>
                </div>
                <p class="text-sm text-muted-foreground mb-4">
                    "Join a Discord voice channel, listen, and transmit audio."
                </p>

                {/* Guild and Channel Selectors */}
                <div class="grid gap-4 md:grid-cols-2 mb-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-foreground">"Guild"</label>
                        <select
                            prop:value=selected_guild
                            on:change=on_guild_change
                            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="">"Select guild"</option>
                            <For each=move || guilds.get() key=|g| g.id.clone() let:guild>
                                <option value=guild.id.clone()>
                                    {guild.name.clone()}
                                </option>
                            </For>
                        </select>
                    </div>

                    <div class="space-y-2">
                        <label class="text-sm font-medium text-foreground">"Voice Channel"</label>
                        <select
                            prop:value=selected_channel
                            on:change=on_channel_change
                            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="">"Select voice channel"</option>
                            <For each=move || voice_channels.get() key=|c| c.id.clone() let:channel>
                                <option value=channel.id.clone()>
                                    {channel.name.clone()}
                                </option>
                            </For>
                        </select>
                    </div>
                </div>

                {/* Error Display */}
                {move || {
                    error.get().map(|err| {
                        view! {
                            <div class="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive mb-4">
                                {err}
                            </div>
                        }
                    })
                }}

                {/* Status Display */}
                {move || {
                    voice_status.get().map(|status| {
                        let connected = status.connected;
                        let active_channel = status.active_channel_name.clone();
                        view! {
                            <div class="flex items-center gap-2 text-sm mb-4">
                                <div class=move || {
                                    if connected {
                                        "h-2 w-2 rounded-full bg-emerald-500"
                                    } else {
                                        "h-2 w-2 rounded-full bg-muted-foreground/40"
                                    }
                                }></div>
                                <span class=move || {
                                    if connected {
                                        "text-emerald-600 dark:text-emerald-400 font-medium"
                                    } else {
                                        "text-muted-foreground"
                                    }
                                }>
                                    {if connected { "Connected" } else { "Disconnected" }}
                                </span>
                                {active_channel.map(|name| {
                                    view! {
                                        <span class="text-muted-foreground">
                                            {format!(" - {}", name)}
                                        </span>
                                    }
                                })}
                            </div>
                        }
                    })
                }}

                {/* Control Buttons */}
                <div class="flex flex-wrap gap-2">
                    <button
                        class=move || {
                            if can_join() {
                                "btn btn-primary"
                            } else {
                                "btn btn-primary opacity-50 cursor-not-allowed"
                            }
                        }
                        disabled=move || !can_join()
                        on:click=on_join_click
                    >
                        {move || if is_connected() { "Reconnect" } else { "Join Voice" }}
                    </button>

                    <button
                        class=move || {
                            if can_disconnect() {
                                "btn btn-destructive"
                            } else {
                                "btn btn-destructive opacity-50 cursor-not-allowed"
                            }
                        }
                        disabled=move || !can_disconnect()
                        on:click=on_disconnect_click
                    >
                        "Disconnect"
                    </button>

                    {move || {
                        if loading.get() {
                            view! {
                                <span class="inline-flex items-center px-3 py-2 text-sm text-muted-foreground">
                                    "Loading..."
                                </span>
                            }.into_any()
                        } else {
                            view! { <></> }.into_any()
                        }
                    }}
                </div>
            </div>
        </div>
    }
}
