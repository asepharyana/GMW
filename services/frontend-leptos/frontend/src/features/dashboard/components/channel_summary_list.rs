use leptos::prelude::*;
use shared_types::dashboard::DashboardChannel;

#[component]
pub fn ChannelSummaryList(
    channels: Vec<DashboardChannel>,
    loading: bool,
    error: Option<String>,
    search: String,
    has_more: bool,
    on_search_change: Box<dyn Fn(String) + Send + Sync + 'static>,
    on_load_more: Box<dyn Fn() + Send + Sync + 'static>,
    on_retry: Box<dyn Fn() + Send + Sync + 'static>,
) -> impl IntoView {
    let search_cb = StoredValue::new(on_search_change);
    let load_more_cb = StoredValue::new(on_load_more);
    let retry_cb = StoredValue::new(on_retry);

    view! {
        <div class="card dashboard-list-card">
            <div class="card-header">
                <div class="card-title">"Kanal"</div>
                <p class="card-description">"Ringkasan aktivitas, flagged message, dan budaya kanal."</p>
            </div>
            <div class="card-content">
                <div class="dashboard-list-toolbar">
                    <input
                        class="input w-full"
                        placeholder="Search channels..."
                        prop:value=search
                        on:input=move |ev| search_cb.with_value(|cb| cb(event_target_value(&ev)))
                    />
                </div>

                {move || {
                    if loading && channels.is_empty() {
                        view! { <ListSkeleton /> }.into_any()
                    } else if let Some(err) = error.clone() {
                        view! {
                            <div class="dashboard-list-empty">
                                <div class="text-error text-xl">"⚠"</div>
                                <p class="text-sm text-secondary">{err}</p>
                                <button class="btn btn-outline btn-sm" on:click=move |_| retry_cb.with_value(|cb| cb())>
                                    "Retry"
                                </button>
                            </div>
                        }.into_any()
                    } else if channels.is_empty() {
                        view! {
                            <div class="dashboard-list-empty">
                                <div class="text-2xl">"#"</div>
                                <p class="text-sm text-secondary">"No channels found."</p>
                            </div>
                        }.into_any()
                    } else {
                        view! {
                            <div class="dashboard-summary-list">
                                {channels.clone().into_iter().map(|channel| view! {
                                    <ChannelRow channel=channel />
                                }).collect::<Vec<_>>()}
                            </div>
                        }.into_any()
                    }
                }}

                {move || {
                    (has_more && !loading).then(|| view! {
                        <div class="mt-4 text-center">
                            <button class="btn btn-outline btn-sm" on:click=move |_| load_more_cb.with_value(|cb| cb())>
                                "Load more channels"
                            </button>
                        </div>
                    })
                }}
            </div>
        </div>
    }
}

#[component]
fn ChannelRow(channel: DashboardChannel) -> impl IntoView {
    let name = channel.channel_name.clone().unwrap_or_else(|| channel.channel_id.clone());
    let summary = channel
        .culture_summary
        .clone()
        .unwrap_or_else(|| format!("{} messages", format_number(channel.total_messages)));
    let last_seen = channel.last_message_at.map(format_timestamp);

    view! {
        <div class="dashboard-summary-row">
            <div class="dashboard-summary-avatar dashboard-channel-avatar">
                <span>"#"</span>
            </div>
            <div class="dashboard-summary-main">
                <div class="dashboard-summary-title">{format!("#{}", name)}</div>
                <div class="dashboard-summary-text">{summary}</div>
                <div class="dashboard-summary-meta">
                    <span>{format!("{} messages", format_number(channel.total_messages))}</span>
                    <span>{format!("{} flagged", format_number(channel.flagged_count))}</span>
                    {last_seen.map(|t| view! { <span>{format!("Last: {}", t)}</span> })}
                </div>
            </div>
        </div>
    }
}

#[component]
fn ListSkeleton() -> impl IntoView {
    view! {
        <div class="dashboard-summary-list">
            {(0..5).map(|_| view! {
                <div class="dashboard-summary-row">
                    <div class="skeleton skeleton-circular" style="width:40px;height:40px"></div>
                    <div class="dashboard-summary-main">
                        <div class="skeleton" style="height:16px;width:160px"></div>
                        <div class="skeleton mt-2" style="height:14px;width:240px"></div>
                    </div>
                </div>
            }).collect::<Vec<_>>()}
        </div>
    }
}

fn format_number(value: u64) -> String {
    let raw = value.to_string();
    let mut out = String::new();
    for (idx, ch) in raw.chars().rev().enumerate() {
        if idx > 0 && idx % 3 == 0 { out.push(','); }
        out.push(ch);
    }
    out.chars().rev().collect()
}

fn format_timestamp(ts: i64) -> String {
    let d = js_sys::Date::new(&wasm_bindgen::JsValue::from_f64((ts as f64) * 1000.0));
    d.to_locale_date_string("en-US", &wasm_bindgen::JsValue::UNDEFINED).into()
}
