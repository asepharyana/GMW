use leptos::prelude::*;
use shared_types::message::{AiStatus, MessageRecord};
use std::sync::Arc;
use wasm_bindgen_futures::spawn_local;

pub mod components;
pub mod hooks;

use components::image_grid::ImageGrid;
use components::message_feed::MessageFeed;
use hooks::use_messages::{merge_messages, use_messages};

type AiFilter = &'static str;
const FILTERS: &[AiFilter] = &["all", "analyzed", "clean", "flagged", "error", "pending"];

#[derive(Clone, PartialEq)]
enum ViewTab {
    All,
    Images,
}

#[component]
pub fn MessagesPanel() -> impl IntoView {
    let state = use_messages();
    let (search_query, set_search_query) = signal(String::new());
    let (search_results, set_search_results) = signal::<Vec<MessageRecord>>(Vec::new());
    let (show_search, set_show_search) = signal(false);
    let (is_searching, set_is_searching) = signal(false);
    let ai_filter = RwSignal::new("analyzed".to_string());
    let view_tab = RwSignal::new(ViewTab::All);
    let (retrying_all, set_retrying_all) = signal(false);

    // Stats derived from filtered messages
    let stats = Memo::new(move |_| {
        let base = if show_search.get() {
            search_results.get()
        } else {
            state.messages.get()
        };
        let total = base.len();
        let clean = base
            .iter()
            .filter(|m| m.ai_status == Some(AiStatus::Clean))
            .count();
        let flagged = base
            .iter()
            .filter(|m| m.ai_status == Some(AiStatus::Flagged))
            .count();
        let error = base
            .iter()
            .filter(|m| m.ai_status == Some(AiStatus::Error))
            .count();
        let pending = base
            .iter()
            .filter(|m| m.ai_status.is_none() || m.ai_status == Some(AiStatus::Pending))
            .count();
        let deleted = base.iter().filter(|m| m.deleted_at.is_some()).count();
        let edited = base.iter().filter(|m| m.edited_at.is_some()).count();
        (total, clean, flagged, error, pending, deleted, edited)
    });

    // Filter messages based on active filter
    let filtered_messages = Memo::new(move |_| {
        let base = if show_search.get() {
            search_results.get()
        } else {
            state.messages.get()
        };
        let filter = ai_filter.get();
        if filter == "all" {
            return base;
        }
        base.into_iter()
            .filter(|m| {
                let status = m.ai_status.clone().unwrap_or(AiStatus::Pending);
                if filter == "analyzed" {
                    return status != AiStatus::Pending;
                }
                if filter == "pending" {
                    return status == AiStatus::Pending;
                }
                format!("{:?}", status).to_lowercase() == filter
            })
            .collect()
    });

    // Search handler - takes any event type and triggers the search
    let do_search = {
        let q = search_query;
        move || {
            let query = q.get();
            if query.trim().is_empty() {
                set_show_search.set(false);
                set_search_results.set(Vec::new());
                return;
            }
            set_is_searching.set(true);
            let q_clone = query.trim().to_string();
            spawn_local(async move {
                match crate::api::messages::search_messages(&q_clone, Some(50)).await {
                    Ok(results) => {
                        set_search_results.set(results);
                        set_show_search.set(true);
                    }
                    Err(_) => {
                        set_search_results.set(Vec::new());
                    }
                }
                set_is_searching.set(false);
            });
        }
    };
    // Separate closures for different event types so on:click/on:keydown type-check
    let handle_search_click = move |_: web_sys::MouseEvent| do_search();
    let handle_search_keydown = move |_: web_sys::KeyboardEvent| do_search();

    // Clear search
    let clear_search = move |_| {
        set_show_search.set(false);
        set_search_results.set(Vec::new());
        set_search_query.set(String::new());
    };

    // Filter chip click
    let set_filter = {
        let af = ai_filter;
        move |f: &'static str| af.set(f.to_string())
    };

    // WS event handlers (wire once on mount)
    let ws = use_context::<crate::ws::context::WsContext>();
    if let Some(ref ws) = ws {
        // Subscribe to real-time message events
        {
            let msgs = state.messages;
            *ws.on_message_created.borrow_mut() = Some(Box::new(move |msg| {
                let current = msgs.get();
                msgs.set(merge_messages(&current, &[msg]));
            }));
        }
        {
            let msgs = state.messages;
            *ws.on_message_updated.borrow_mut() = Some(Box::new(move |msg| {
                let current = msgs.get();
                msgs.set(merge_messages(&current, &[msg]));
            }));
        }
        {
            let msgs = state.messages;
            *ws.on_message_deleted.borrow_mut() = Some(Box::new(move |id| {
                let current = msgs.get();
                msgs.set(current.into_iter().filter(|m| m.id != id).collect());
            }));
        }
        {
            let msgs = state.messages;
            *ws.on_message_analyzed.borrow_mut() = Some(Box::new(move |msg| {
                let current = msgs.get();
                msgs.set(merge_messages(&current, &[msg]));
            }));
        }
    }

    // Fetch messages on mount if guild is configured
    Effect::new(move |_| {
        if let Some(config) = use_context::<crate::app::AppConfig>() {
            if let Some(ref guild_id) = config.monitor_guild_id.get() {
                let gid = guild_id.clone();
                (state.fetch_messages)(gid);
            }
        }
    });

    // ─── View ────────────────────────────────────────────────
    let get_stats = move || stats.get();
    let (total, clean, flagged, error, pending, deleted, edited) = (
        move || get_stats().0,
        move || get_stats().1,
        move || get_stats().2,
        move || get_stats().3,
        move || get_stats().4,
        move || get_stats().5,
        move || get_stats().6,
    );

    view! {
        <div class="messages-panel">
            {/* Header card */}
            <div class="card">
                <div class="card-header">
                    <div class="card-title">"Messages"</div>
                    <p class="card-description">
                        "Messages are automatically captured from all text channels. Real-time updates arrive via WebSocket."
                    </p>
                </div>
            </div>

            {/* Stats badges */}
            {move || (total() > 0).then(|| view! {
                <div class="message-stats">
                    <span class="badge badge-outline text-xs">{total()} " total" {state.has_more.get().then_some("+")}</span>
                    <span class="badge badge-success text-xs">{clean()} " clean"</span>
                    <span class="badge badge-primary text-xs">{flagged()} " flagged"</span>
                    <span class="badge badge-warning text-xs">{error()} " error"</span>
                    <span class="badge badge-outline text-xs">{pending()} " pending"</span>
                    {(deleted() > 0).then(|| view! {
                        <span class="badge badge-destructive text-xs">{deleted()} " deleted"</span>
                    })}
                    {(edited() > 0).then(|| view! {
                        <span class="badge badge-outline text-xs">{edited()} " edited"</span>
                    })}
                </div>
            })}

            {/* Search + filters row */}
            <div class="search-row">
                <div class="relative flex-1" style="min-width:200px">
                    {/* Search icon as SVG */}
                    <svg width="16" height="16" style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--color-primary)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                    <input
                        class="input"
                        style="padding-left:2.25rem;border-radius:9999px"
                        placeholder="Search message content..."
                        prop:value=search_query
                        on:input=move |ev| set_search_query.set(event_target_value(&ev))
                        on:keydown=move |ev| {
                            if ev.key() == "Enter" { handle_search_keydown(ev); }
                        }
                        disabled=move || is_searching.get()
                    />
                </div>
                <button
                    class="btn btn-primary btn-sm"
                    on:click=handle_search_click
                    disabled=move || is_searching.get() || search_query.get().trim().is_empty()
                >
                    {move || if is_searching.get() { "Searching..." } else { "Search" }}
                </button>
                {move || show_search.get().then(|| view! {
                    <button class="btn btn-outline btn-sm" on:click=clear_search>
                        "✕ Clear"
                    </button>
                })}
                {move || {
                    (error() > 0 && !show_search.get()).then(|| {
                        let cb = state.reanalyze_all_errors.clone();
                        let err_count = error();
                        view! {
                            <button
                                class="btn btn-destructive btn-sm"
                                on:click=move |_| {
                                    set_retrying_all.set(true);
                                    let cb = cb.clone();
                                    spawn_local(async move {
                                        cb();
                                        set_retrying_all.set(false);
                                    });
                                }
                                disabled=move || retrying_all.get()
                            >
                                {/* Rotate CCW icon as SVN */}
                                <svg class=format!("mr-1.5 h-3.5 w-3.5{}", if retrying_all.get() { " animate-spin" } else { "" }) xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"></path></svg>
                                {move || if retrying_all.get() { "Retrying...".to_string() } else { format!("Retry All Errors ({})", err_count) }}
                            </button>
                        }
                    })
                }}
                <div class="ml-auto flex items-center" style="gap:0.375rem">
                    {/* Filter icon as SVG since lucide-leptos Filter unavailable */}
                    <svg width="16" height="16" style="color:var(--color-primary)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                    {FILTERS.iter().map(|f| {
                        let f_ptr: &'static str = f;
                        view! {
                            <button class="filter-chip" class:active=move || ai_filter.get() == f_ptr on:click=move |_| set_filter(f_ptr) >{*f}</button>
                        }
                    }).collect::<Vec<_>>()}
                </div>
            </div>

            {/* Search results count */}
            {move || show_search.get().then(|| {
                let n = search_results.get().len();
                view! {
                    <div class="text-sm text-secondary">
                        "Found " {n} " result" {if n != 1 { "s" } else { "" }}
                    </div>
                }
            })}

            {/* View tabs + content */}
            <div class="tabs">
                <div class="tab-list">
                    <button
                        class="tab-trigger"
                        class:active=move || view_tab.get() == ViewTab::All
                        on:click=move |_| view_tab.set(ViewTab::All)
                        aria-selected=move || if view_tab.get() == ViewTab::All { "true" } else { "false" }
                    >
                        {move || {
                            let label = if show_search.get() { "Search" } else { "All" };
                            format!("{} ({})", label, filtered_messages.with(|m| m.len()))
                        }}
                    </button>
                    <button
                        class="tab-trigger"
                        class:active=move || view_tab.get() == ViewTab::Images
                        on:click=move |_| view_tab.set(ViewTab::Images)
                        aria-selected=move || if view_tab.get() == ViewTab::Images { "true" } else { "false" }
                    >
                        "Images"
                    </button>
                </div>

                <div class="tab-content" style:display=move || if view_tab.get() == ViewTab::All { "block" } else { "none" }>
                    {move || {
                        let load_more_cb = state.load_more.clone();
                        let empty_text: &'static str = if show_search.get() { "No messages found matching your search." } else { "No captures yet." };
                        let has_more = if show_search.get() { false } else { state.has_more.get() };
                        let on_load_more_clone: Arc<dyn Fn() + Send + Sync + 'static> = Arc::new(move || load_more_cb());
                        view! {
                            <MessageFeed
                                messages=filtered_messages.get()
                                empty_text=empty_text
                                loading=state.loading.get()
                                has_more=has_more
                                loading_more=state.loading_more.get()
                                on_load_more=on_load_more_clone
                                on_reanalyze=state.reanalyze.clone()
                            />
                        }
                    }}
                </div>
                <div class="tab-content" style:display=move || if view_tab.get() == ViewTab::Images { "block" } else { "none" }>
                    {move || view! {
                        <ImageGrid messages=filtered_messages.get() />
                    }}
                </div>
            </div>
        </div>
    }
}
