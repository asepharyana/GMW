use crate::api::messages::{get_messages, reanalyze_batch, reanalyze_message};
use leptos::prelude::*;
use shared_types::message::{MessageRecord, PageResult};
use std::collections::HashMap;
use std::sync::Arc;
use wasm_bindgen_futures::spawn_local;
use crate::{log_debug, log_error, log_info, log_trace, log_warn, make_logger};

make_logger!();

/// Merges current messages with incoming messages, deduplicating by ID and sorting
pub fn merge_messages(current: &[MessageRecord], incoming: &[MessageRecord]) -> Vec<MessageRecord> {
    let mut by_id: HashMap<String, MessageRecord> =
        current.iter().map(|m| (m.id.clone(), m.clone())).collect();
    for msg in incoming {
        by_id.insert(msg.id.clone(), msg.clone());
    }
    let mut merged: Vec<MessageRecord> = by_id.into_values().collect();
    merged.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    merged
}

/// Callback type for fetch_messages
pub type FetchMessagesCallback = Arc<dyn Fn(String) + Send + Sync>;
/// Callback type for load_more
pub type LoadMoreCallback = Arc<dyn Fn() + Send + Sync>;
/// Callback type for reanalyze
pub type ReanalyzeCallback = Arc<dyn Fn(String) + Send + Sync>;
/// Callback type for reanalyze_all_errors
pub type ReanalyzeAllErrorsCallback = Arc<dyn Fn() + Send + Sync>;

/// State returned by use_messages hook
#[derive(Clone)]
pub struct MessagesState {
    /// Current list of messages
    pub messages: RwSignal<Vec<MessageRecord>>,
    /// Whether the initial fetch is in progress
    pub loading: ReadSignal<bool>,
    /// Whether we're loading more messages
    pub loading_more: RwSignal<bool>,
    /// Pagination cursor for next page
    pub cursor: RwSignal<Option<String>>,
    /// Derived: whether there are more messages to load
    pub has_more: Memo<bool>,
    /// Last error message if any
    pub error: RwSignal<Option<String>>,
    /// Current guild ID
    pub current_guild: RwSignal<Option<String>>,
    /// Fetch initial messages for a guild
    pub fetch_messages: FetchMessagesCallback,
    /// Load next page of messages
    pub load_more: LoadMoreCallback,
    /// Reanalyze a single message
    pub reanalyze: ReanalyzeCallback,
    /// Reanalyze all error messages in current batch
    pub reanalyze_all_errors: ReanalyzeAllErrorsCallback,
}

/// Hook to manage message data fetching and state
pub fn use_messages() -> MessagesState {
    // Core signals
    let messages_signal = RwSignal::new(Vec::<MessageRecord>::new());
    let (loading, set_loading) = signal(false);
    let loading_more_signal = RwSignal::new(false);
    let cursor_signal = RwSignal::new(None::<String>);
    let error_signal = RwSignal::new(None::<String>);
    let current_guild_signal = RwSignal::new(None::<String>);

    // Derived signal: has_more is true if cursor is Some
    let has_more_signal = Memo::new(move |_| cursor_signal.get().is_some());

    // Fetch initial messages for a guild
    let fetch_messages_impl = Arc::new(move |guild_id: String| {
        spawn_local({
            let guild_id = guild_id.clone();
            async move {
                error_signal.set(None);
                set_loading.set(true);
                log_info!("Messages fetch start for guild {}", guild_id);

                match get_messages(&guild_id, Some(30), None, None).await {
                    Ok(PageResult { data, next_cursor }) => {
                        log_info!("Messages fetch OK: count={}, cursor={:?}", data.len(), next_cursor);
                        web_sys::console::log_3(
                            &"[messages] fetch OK".into(),
                            &format!("count={}", data.len()).into(),
                            &format!("cursor={:?}", next_cursor).into(),
                        );
                        messages_signal.set(data);
                        cursor_signal.set(next_cursor);
                        current_guild_signal.set(Some(guild_id));
                        set_loading.set(false);
                    }
                    Err(e) => {
                        log_warn!("Messages fetch error: {}", e);
                        web_sys::console::log_2(
                            &"[messages] fetch ERROR".into(),
                            &format!("{}", e).into(),
                        );
                        error_signal.set(Some(format!("Failed to fetch messages: {}", e)));
                        set_loading.set(false);
                    }
                }
            }
        });
    });

    // Load more messages (append next page)
    let load_more_impl = Arc::new(move || {
        spawn_local(async move {
            let guild_id = match current_guild_signal.get() {
                Some(id) => id,
                None => {
                    error_signal.set(Some("No guild selected".to_string()));
                    return;
                }
            };

            let cursor = match cursor_signal.get() {
                Some(c) => c,
                None => {
                    error_signal.set(Some("No more messages to load".to_string()));
                    return;
                }
            };

            loading_more_signal.set(true);
            error_signal.set(None);
            log_info!("Messages load more for guild {}", guild_id);

            match get_messages(&guild_id, Some(30), None, Some(&cursor)).await {
                Ok(PageResult { data, next_cursor }) => {
                    log_info!("Messages load more OK: count={}, cursor={:?}", data.len(), next_cursor);
                    let current = messages_signal.get();
                    messages_signal.set(merge_messages(&current, &data));
                    cursor_signal.set(next_cursor);
                    loading_more_signal.set(false);
                }
                Err(e) => {
                    log_warn!("Messages load more error: {}", e);
                    error_signal.set(Some(format!("Failed to load more: {}", e)));
                    loading_more_signal.set(false);
                }
            }
        });
    });

    // Reanalyze single message with optimistic update
    let reanalyze_impl = Arc::new(move |message_id: String| {
        spawn_local({
            let message_id = message_id.clone();
            async move {
                log_info!("Messages reanalyze start for message {}", message_id);
                // Optimistic: flip status to Processing
                let mut msgs = messages_signal.get();
                if let Some(pos) = msgs.iter().position(|m| m.id == message_id) {
                    if let Some(ref mut msg) = msgs.get_mut(pos) {
                        msg.ai_status = Some(shared_types::message::AiStatus::Processing);
                    }
                }
                messages_signal.set(msgs);

                // Call API
                match reanalyze_message(&message_id).await {
                    Ok(_) => {
                        log_info!("Messages reanalyze OK for message {}", message_id);
                        // Success: keep the Processing status (will be updated via WS)
                    }
                    Err(e) => {
                        log_warn!("Messages reanalyze error for message {}: {}", message_id, e);
                        // Revert to Error status on failure
                        let mut msgs = messages_signal.get();
                        if let Some(pos) = msgs.iter().position(|m| m.id == message_id) {
                            if let Some(ref mut msg) = msgs.get_mut(pos) {
                                msg.ai_status = Some(shared_types::message::AiStatus::Error);
                                msg.ai_error = Some(e.to_string());
                            }
                        }
                        messages_signal.set(msgs);
                        error_signal.set(Some(format!("Reanalyze failed: {}", e)));
                    }
                }
            }
        });
    });

    // Reanalyze all error messages
    let reanalyze_all_errors_impl = Arc::new(move || {
        spawn_local(async move {
            log_info!("Messages reanalyze all errors start");
            match reanalyze_batch().await {
                Ok(_count) => {
                    log_info!("Messages reanalyze all errors OK: count={}", _count);
                    error_signal.set(None);
                    // Optimistically mark all error messages as Processing
                    let mut msgs = messages_signal.get();
                    for msg in msgs.iter_mut() {
                        if msg.ai_status == Some(shared_types::message::AiStatus::Error) {
                            msg.ai_status = Some(shared_types::message::AiStatus::Processing);
                        }
                    }
                    messages_signal.set(msgs);
                }
                Err(e) => {
                    log_info!("Messages reanalyze all errors failed: {}", e);
                    error_signal.set(Some(format!("Batch reanalyze failed: {}", e)));
                }
            }
        });
    });

    MessagesState {
        messages: messages_signal,
        loading,
        loading_more: loading_more_signal,
        cursor: cursor_signal,
        has_more: has_more_signal,
        error: error_signal,
        current_guild: current_guild_signal,
        fetch_messages: fetch_messages_impl,
        load_more: load_more_impl,
        reanalyze: reanalyze_impl,
        reanalyze_all_errors: reanalyze_all_errors_impl,
    }
}
