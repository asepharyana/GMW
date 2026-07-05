use leptos::html;
use leptos::prelude::*;
use shared_types::message::MessageRecord;
use std::sync::Arc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::IntersectionObserver;


const GROUP_WINDOW_MS: i64 = 5 * 60 * 1000;

fn group_messages(messages: Vec<MessageRecord>) -> Vec<Vec<MessageRecord>> {
    let mut groups: Vec<Vec<MessageRecord>> = Vec::new();
    for msg in messages {
        if let Some(last_group) = groups.last_mut() {
            let same_user = last_group
                .first()
                .map(|m| m.user_id == msg.user_id)
                .unwrap_or(false);
            let same_window = last_group
                .last()
                .map(|m| (m.created_at - msg.created_at).abs() < GROUP_WINDOW_MS)
                .unwrap_or(false);
            if same_user && same_window {
                last_group.push(msg);
                continue;
            }
        }
        groups.push(vec![msg]);
    }
    groups
}

#[component]
pub fn MessageFeed(
    messages: Vec<MessageRecord>,
    #[prop(optional)] empty_text: &'static str,
    #[prop(optional)] loading: bool,
    #[prop(optional)] has_more: bool,
    #[prop(optional)] loading_more: bool,
    #[prop(optional)] on_load_more: Option<Arc<dyn Fn() + Send + Sync + 'static>>,
    on_reanalyze: Arc<dyn Fn(String) + Send + Sync + 'static>,
) -> impl IntoView {
    let sentinel_ref = NodeRef::<html::Div>::new();
    let (observer_ready, set_observer_ready) = signal(false);

    // Schedule observer setup to run AFTER the DOM is mounted (next microtask).
    // With has_more, !loading, and messages present the sentinel div will be in the DOM.
    if !loading && !messages.is_empty() && has_more {
        wasm_bindgen_futures::spawn_local({
            let setter = set_observer_ready;
            async move {
                setter.set(true);
            }
        });
    }

    // Clone before move into Effect closure so it's still available for the view
    let on_load_more_io = on_load_more.clone();
    Effect::new(move |_| {
        let _ready = observer_ready.get();
        if !_ready {
            return;
        }
        if let Some(node) = sentinel_ref.get() {
            let cb = on_load_more_io.clone();
            let observer_cb = Closure::<dyn Fn(Vec<JsValue>, IntersectionObserver)>::new(
                move |entries: Vec<JsValue>, _observer: IntersectionObserver| {
                    for entry in entries {
                        if let Some(entry) =
                            entry.dyn_ref::<web_sys::IntersectionObserverEntry>()
                        {
                            if entry.is_intersecting() {
                                if let Some(ref cb) = cb {
                                    cb();
                                }
                            }
                        }
                    }
                },
            );
            let observer =
                IntersectionObserver::new(observer_cb.as_ref().unchecked_ref())
                    .expect("IntersectionObserver failed");
            observer.observe(&node);
            // Keep closure alive — forget rather than cleanup since observer owns it
            observer_cb.forget();
            on_cleanup(move || {
                observer.disconnect();
            });
        }
    });

    // Loading state
    if loading {
        return view! {
            <div class="flex flex-col gap-4">
                {std::iter::repeat_with(|| {
                    use super::message_card::MessageCardSkeleton;
                    view! { <MessageCardSkeleton /> }
                }).take(3).collect::<Vec<_>>()}
            </div>
        }
        .into_any();
    }

    if messages.is_empty() {
        return view! {
            <div class="feed-empty">
                <div class="feed-empty-title">
                    {if empty_text.is_empty() { "No messages" } else { empty_text }}
                </div>
            </div>
        }
        .into_any();
    }

    let groups = group_messages(messages);
    let has_more_val = has_more;
    let loading_more_val = loading_more;

    view! {
        <div class="feed-wrap">
            {groups.into_iter().map(|group| {
                let cb = on_reanalyze.clone();
                view! {
                    <MessageCardGroup messages=group on_reanalyze=cb.clone() />
                }
            }).collect::<Vec<_>>()}

            {/* Infinite scroll sentinel + fallback load more button */}
            {has_more_val.then(|| {
                view! {
                    <>
                        <div node_ref=sentinel_ref class="feed-sentinel">
                            {loading_more_val.then(|| {
                                use super::message_card::MessageCardSkeleton;
                                view! { <MessageCardSkeleton /> }
                            })}
                        </div>
                        {/* Fallback: visible button in case IntersectionObserver doesn't fire */}
                        {(!loading_more_val).then(|| {
                            let load_more_cb = on_load_more.clone();
                            view! {
                                <div class="feed-loader">
                                    <button
                                        class="btn btn-outline btn-sm"
                                        on:click=move |_| {
                                            if let Some(ref cb) = load_more_cb { cb(); }
                                        }
                                    >
                                        "Load more"
                                    </button>
                                </div>
                            }
                        })}
                    </>
                }
            })}
        </div>
    }
    .into_any()
}

#[component]
fn MessageCardGroup(
    messages: Vec<MessageRecord>,
    on_reanalyze: Arc<dyn Fn(String) + Send + Sync + 'static>,
) -> impl IntoView {
    use super::message_card::MessageCard;
    view! {
        <MessageCard messages=messages on_reanalyze=on_reanalyze />
    }
}
