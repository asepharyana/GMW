use leptos::prelude::*;
use shared_types::dashboard::{DashboardStats, TopChannel};
#[component]
pub fn StatsOverview(
    stats: Option<DashboardStats>,
    loading: bool,
    error: Option<String>,
    on_retry: Box<dyn Fn() + Send + Sync + 'static>,
) -> impl IntoView {
    let retry = StoredValue::new(on_retry);

    view! {
        <div class="dashboard-stats">
            {move || {
                if loading {
                    view! { <StatsSkeleton /> }.into_any()
                } else if let Some(err) = error.clone() {
                    view! {
                        <div class="card p-6 text-center">
                            <div class="text-error text-2xl mb-2">"⚠"</div>
                            <p class="text-sm text-secondary mb-4">{err}</p>
                            <button class="btn btn-outline btn-sm" on:click=move |_| retry.with_value(|cb| cb())>
                                "Retry"
                            </button>
                        </div>
                    }.into_any()
                } else if let Some(stats) = stats.clone() {
                    view! {
                        <div class="dashboard-stats-grid">
                            <MetricCard label="Total Messages" value=stats.total_messages icon="💬" tone="primary" />
                            <MetricCard label="Today's Messages" value=stats.today_messages icon="📅" tone="success" />
                            <MetricCard label="Total Users" value=stats.total_users icon="👥" tone="primary" />
                            <MetricCard label="Active 24h" value=stats.active_users_24h icon="🟢" tone="success" />
                            <MetricCard label="Flagged" value=stats.total_flagged icon="🚩" tone="error" />
                            <MetricCard label="Clean" value=stats.total_clean icon="✅" tone="success" />
                            <MetricCard label="Voice Recordings" value=stats.total_voice_recordings icon="🎙" tone="info" />
                            <MetricCard label="AI Profiles" value=stats.total_profiles icon="🧠" tone="warning" />

                            <div class="card dashboard-wide-card">
                                <div class="card-header">
                                    <div class="card-title">"Top Channels"</div>
                                </div>
                                <div class="card-content">
                                    <TopChannels channels=stats.top_channels.clone() />
                                </div>
                            </div>

                            <div class="card dashboard-wide-card">
                                <div class="card-header">
                                    <div class="card-title">"Moderation Queue"</div>
                                </div>
                                <div class="card-content">
                                    <div class="dashboard-moderation-grid">
                                        <QueueMetric label="Pending" value=stats.moderation_overview.pending tone="secondary" />
                                        <QueueMetric label="Processing" value=stats.moderation_overview.processing tone="warning" />
                                        <QueueMetric label="Errors" value=stats.moderation_overview.error tone="error" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    }.into_any()
                } else {
                    view! {
                        <div class="card p-6 text-center">
                            <p class="text-sm text-secondary">"No dashboard data available yet."</p>
                        </div>
                    }.into_any()
                }
            }}
        </div>
    }
}

#[component]
fn MetricCard(
    label: &'static str,
    value: u64,
    icon: &'static str,
    tone: &'static str,
) -> impl IntoView {
    view! {
        <div class="card dashboard-metric-card">
            <div class="dashboard-metric-content">
                <div>
                    <div class="dashboard-metric-label">{label}</div>
                    <div class="dashboard-metric-value">{format_number(value)}</div>
                </div>
                <div class=format!("dashboard-metric-icon tone-{}", tone)>{icon}</div>
            </div>
        </div>
    }
}

#[component]
fn QueueMetric(label: &'static str, value: u64, tone: &'static str) -> impl IntoView {
    view! {
        <div class=format!("dashboard-queue-card tone-{}", tone)>
            <div class="dashboard-queue-value">{format_number(value)}</div>
            <div class="dashboard-queue-label">{label}</div>
        </div>
    }
}

#[component]
fn TopChannels(channels: Vec<TopChannel>) -> impl IntoView {
    if channels.is_empty() {
        return view! { <p class="text-sm text-secondary">"No channel data yet."</p> }.into_any();
    }

    view! {
        <div class="dashboard-top-channels">
            {channels.into_iter().map(|ch| {
                let name = ch.channel_name.unwrap_or_else(|| ch.channel_id.clone());
                view! {
                    <div class="dashboard-top-channel-row">
                        <span class="truncate">{format!("#{}", name)}</span>
                        <span class="font-semibold">{format_number(ch.message_count)}</span>
                    </div>
                }
            }).collect::<Vec<_>>()}
        </div>
    }
    .into_any()
}

#[component]
fn StatsSkeleton() -> impl IntoView {
    view! {
        <div class="dashboard-stats-grid">
            {(0..8).map(|_| view! {
                <div class="card dashboard-metric-card">
                    <div class="skeleton" style="height:14px;width:96px"></div>
                    <div class="skeleton mt-2" style="height:32px;width:72px"></div>
                </div>
            }).collect::<Vec<_>>()}
        </div>
    }
}

fn format_number(value: u64) -> String {
    let raw = value.to_string();
    let mut out = String::new();
    for (idx, ch) in raw.chars().rev().enumerate() {
        if idx > 0 && idx % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    out.chars().rev().collect()
}
