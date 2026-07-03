use leptos::html;
use leptos::prelude::*;
use shared_types::message::MessageRecord;
use std::sync::Arc;
use wasm_bindgen::prelude::*;
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
    let (_intersecting, _set_intersecting) = signal(false);

    Effect::new(move |_| {
        let _ = _intersecting.get(); // track signal
        if let Some(node) = sentinel_ref.get() {
            let on_load_more = on_load_more.clone();
            let cb = Closure::<dyn Fn(Vec<JsValue>)>::new(move |entries: Vec<JsValue>| {
                for entry in entries {
                    if let Some(entry) = entry.dyn_ref::<web_sys::IntersectionObserverEntry>() {
                        if entry.is_intersecting() {
                            if let Some(ref cb) = on_load_more {
                                cb();
                            }
                        }
                    }
                }
            });
            let observer = IntersectionObserver::new(cb.as_ref().unchecked_ref())
                .expect("IntersectionObserver failed");
            observer.observe(&node);
            on_cleanup(move || {
                observer.disconnect();
            });
            // Keep closure alive
            cb.forget();
        }
    });

    // Loading state
    if loading {
        return view! {
            <div class="space-y-4">
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
            <div class="empty-state">
                <div class="empty-state-title">
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
        <div class="space-y-4">
            {groups.into_iter().map(|group| {
                let cb = on_reanalyze.clone();
                view! {
                    <MessageCardGroup messages=group on_reanalyze=cb.clone() />
                }
            }).collect::<Vec<_>>()}

            {/* Infinite scroll sentinel */}
            {has_more_val.then(|| {
                view! {
                    <div node_ref=sentinel_ref class="h-4">
                        {loading_more_val.then(|| {
                            use super::message_card::MessageCardSkeleton;
                            view! { <MessageCardSkeleton /> }
                        })}
                    </div>
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
