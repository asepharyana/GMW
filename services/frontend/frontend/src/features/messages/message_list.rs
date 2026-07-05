use leptos::prelude::*;
use shared_types::message::MessageRecord;
use std::sync::Arc;
use super::components::message_feed::MessageFeed;
use super::components::image_grid::ImageGrid;

#[derive(Clone, PartialEq)]
pub enum ViewTab {
    All,
    Images,
}

#[component]
pub fn MessageListView(
    view_tab: RwSignal<ViewTab>,
    show_search: ReadSignal<bool>,
    search_results: ReadSignal<Vec<MessageRecord>>,
    filtered_messages: Memo<Vec<MessageRecord>>,
    image_messages: ReadSignal<Vec<MessageRecord>>,
    loading: ReadSignal<bool>,
    has_more: Memo<bool>,
    loading_more: ReadSignal<bool>,
    on_load_more: Arc<dyn Fn() + Send + Sync + 'static>,
    on_reanalyze: Arc<dyn Fn(String) + Send + Sync + 'static>,
) -> impl IntoView {
    view! {
        {/* Search results count */}
        {move || show_search.get().then(|| {
            let n = search_results.get().len();
            view! {
                <div class="search-count">
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
                    let effective_has_more = if show_search.get() { false } else { has_more.get() };
                    let load_more_cb = on_load_more.clone();
                    let empty_text: &'static str = if show_search.get() { "No messages found matching your search." } else { "No captures yet." };
                    let on_load_more_clone: Arc<dyn Fn() + Send + Sync + 'static> = Arc::new(move || load_more_cb());
                    view! {
                        <MessageFeed
                            messages=filtered_messages.get()
                            empty_text=empty_text
                            loading=loading.get()
                            has_more=effective_has_more
                            loading_more=loading_more.get()
                            on_load_more=on_load_more_clone
                            on_reanalyze=on_reanalyze.clone()
                        />
                    }
                }}
            </div>
            <div class="tab-content" style:display=move || if view_tab.get() == ViewTab::Images { "block" } else { "none" }>
                {move || view! {
                    <ImageGrid messages=image_messages.get() />
                }}
            </div>
        </div>
    }
}
