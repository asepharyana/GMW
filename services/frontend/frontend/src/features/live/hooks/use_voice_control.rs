use crate::api::voice::{
    connect_voice, disconnect_voice, get_guilds, get_text_channels, get_voice_channels,
};
use leptos::prelude::*;
use shared_types::guild::{Channel, Guild};
use shared_types::voice::VoiceStatus;
use std::sync::Arc;
use wasm_bindgen_futures::spawn_local;

/// Callback type for join_voice
pub type JoinVoiceCallback = Arc<dyn Fn(String, String) + Send + Sync>;
/// Callback type for leave_voice
pub type LeaveVoiceCallback = Arc<dyn Fn() + Send + Sync>;
/// Callback type for load_guilds
pub type LoadGuildsCallback = Arc<dyn Fn() + Send + Sync>;
/// Callback type for load_voice_channels
pub type LoadVoiceChannelsCallback = Arc<dyn Fn(String) + Send + Sync>;
/// Callback type for load_text_channels
pub type LoadTextChannelsCallback = Arc<dyn Fn(String) + Send + Sync>;

/// State returned by use_voice_control hook
#[derive(Clone)]
pub struct VoiceControlState {
    /// List of available guilds
    pub guilds: RwSignal<Vec<Guild>>,
    /// List of voice channels for current guild
    pub voice_channels: RwSignal<Vec<Channel>>,
    /// List of text channels for current guild
    pub text_channels: RwSignal<Vec<Channel>>,
    /// Current voice connection status
    pub voice_status: RwSignal<Option<VoiceStatus>>,
    /// Whether we're currently loading data
    pub loading: RwSignal<bool>,
    /// Last error message if any
    pub error: RwSignal<Option<String>>,
    /// Join a voice channel
    pub join_voice: JoinVoiceCallback,
    /// Leave the current voice channel
    pub leave_voice: LeaveVoiceCallback,
    /// Fetch list of guilds
    pub load_guilds: LoadGuildsCallback,
    /// Fetch voice channels for a guild
    pub load_voice_channels: LoadVoiceChannelsCallback,
    /// Fetch text channels for a guild
    pub load_text_channels: LoadTextChannelsCallback,
}

/// Hook to manage voice connection state and controls
pub fn use_voice_control() -> VoiceControlState {
    // Core signals
    let guilds_signal = RwSignal::new(Vec::<Guild>::new());
    let voice_channels_signal = RwSignal::new(Vec::<Channel>::new());
    let text_channels_signal = RwSignal::new(Vec::<Channel>::new());
    let voice_status_signal = RwSignal::new(None::<VoiceStatus>);
    let loading_signal = RwSignal::new(false);
    let error_signal = RwSignal::new(None::<String>);

    // Join a voice channel
    let join_voice_impl = Arc::new(move |guild_id: String, channel_id: String| {
        spawn_local({
            let guild_id = guild_id.clone();
            let channel_id = channel_id.clone();
            async move {
                error_signal.set(None);
                loading_signal.set(true);

                match connect_voice(&guild_id, &channel_id).await {
                    Ok(status) => {
                        voice_status_signal.set(Some(status));
                        loading_signal.set(false);
                    }
                    Err(e) => {
                        error_signal.set(Some(format!("Failed to join voice: {}", e)));
                        loading_signal.set(false);
                    }
                }
            }
        });
    });

    // Leave the current voice channel
    let leave_voice_impl = Arc::new(move || {
        spawn_local(async move {
            error_signal.set(None);
            loading_signal.set(true);

            match disconnect_voice().await {
                Ok(status) => {
                    voice_status_signal.set(Some(status));
                    loading_signal.set(false);
                }
                Err(e) => {
                    error_signal.set(Some(format!("Failed to leave voice: {}", e)));
                    loading_signal.set(false);
                }
            }
        });
    });

    // Fetch list of guilds
    let load_guilds_impl = Arc::new(move || {
        spawn_local(async move {
            error_signal.set(None);
            loading_signal.set(true);

            match get_guilds().await {
                Ok(guilds) => {
                    guilds_signal.set(guilds);
                    loading_signal.set(false);
                }
                Err(e) => {
                    error_signal.set(Some(format!("Failed to load guilds: {}", e)));
                    loading_signal.set(false);
                }
            }
        });
    });

    // Fetch voice channels for a guild
    let load_voice_channels_impl = Arc::new(move |guild_id: String| {
        spawn_local({
            let guild_id = guild_id.clone();
            async move {
                error_signal.set(None);
                loading_signal.set(true);

                match get_voice_channels(&guild_id).await {
                    Ok(channels) => {
                        voice_channels_signal.set(channels);
                        loading_signal.set(false);
                    }
                    Err(e) => {
                        error_signal.set(Some(format!("Failed to load voice channels: {}", e)));
                        loading_signal.set(false);
                    }
                }
            }
        });
    });

    // Fetch text channels for a guild
    let load_text_channels_impl = Arc::new(move |guild_id: String| {
        spawn_local({
            let guild_id = guild_id.clone();
            async move {
                error_signal.set(None);
                loading_signal.set(true);

                match get_text_channels(&guild_id).await {
                    Ok(channels) => {
                        text_channels_signal.set(channels);
                        loading_signal.set(false);
                    }
                    Err(e) => {
                        error_signal.set(Some(format!("Failed to load text channels: {}", e)));
                        loading_signal.set(false);
                    }
                }
            }
        });
    });

    VoiceControlState {
        guilds: guilds_signal,
        voice_channels: voice_channels_signal,
        text_channels: text_channels_signal,
        voice_status: voice_status_signal,
        loading: loading_signal,
        error: error_signal,
        join_voice: join_voice_impl,
        leave_voice: leave_voice_impl,
        load_guilds: load_guilds_impl,
        load_voice_channels: load_voice_channels_impl,
        load_text_channels: load_text_channels_impl,
    }
}
