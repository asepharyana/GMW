use leptos::prelude::*;
use shared_types::message::MessageRecord;
use std::sync::Arc;
use wasm_bindgen_futures::spawn_local;
use crate::{log_info, log_warn, make_logger};

make_logger!();

type AiFilter = &'static str;
const FILTERS: &[AiFilter] = &["all", "analyzed", "clean", "flagged", "error", "pending"];

#[component]
pub fn FilterBar(
    search_query: ReadSignal<String>,
    set_search_query: WriteSignal<String>,
    show_search: ReadSignal<bool>,
    set_show_search: WriteSignal<bool>,
    is_searching: ReadSignal<bool>,
    set_is_searching: WriteSignal<bool>,
    set_search_results: WriteSignal<Vec<MessageRecord>>,
    ai_filter: RwSignal<String>,
    error_count: Memo<usize>,
    retrying_all: ReadSignal<bool>,
    set_retrying_all: WriteSignal<bool>,
    reanalyze_all_errors: Arc<dyn Fn() + Send + Sync>,
) -> impl IntoView {
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
            log_info!("Messages searching for: {}", q_clone);
            spawn_local(async move {
                match crate::api::messages::search_messages(&q_clone, Some(50)).await {
                    Ok(results) => {
                        log_info!("Messages search found {} results", results.len());
                        set_search_results.set(results);
                        set_show_search.set(true);
                    }
                    Err(_) => {
                        log_warn!("Messages search failed");
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

    view! {
        <div class="search-bar">
            <div class="search-wrap">
                <svg width="16" height="16" class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                <input
                    class="search-input"
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
                let err = error_count.get();
                (err > 0 && !show_search.get()).then(|| {
                    let cb = reanalyze_all_errors.clone();
                    let err_count = err;
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
                            <svg class=format!("mr-1.5 h-3.5 w-3.5{}", if retrying_all.get() { " icon-spin" } else { "" }) xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"></path></svg>
                            {move || if retrying_all.get() { "Retrying...".to_string() } else { format!("Retry All Errors ({})", err_count) }}
                        </button>
                    }
                })
            }}
            <div class="filter-group">
                <svg width="16" height="16" style="color:var(--color-primary)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                {FILTERS.iter().map(|f| {
                    let f_ptr: &'static str = f;
                    view! {
                        <button class="filter-chip-v2" class:is-active=move || ai_filter.get() == f_ptr on:click=move |_| set_filter(f_ptr) >{*f}</button>
                    }
                }).collect::<Vec<_>>()}
            </div>
        </div>
    }
}
