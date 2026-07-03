pub mod components;

use components::{ChannelSummaryList, StatsOverview, UserSummaryList};
use leptos::prelude::*;
use shared_types::dashboard::{DashboardChannel, DashboardStats, DashboardUser};
use std::sync::Arc;
use wasm_bindgen_futures::spawn_local;

#[derive(Clone, PartialEq)]
enum DashboardTab {
    Stats,
    Users,
    Channels,
}

#[component]
pub fn DashboardPanel() -> impl IntoView {
    let active_tab = RwSignal::new(DashboardTab::Stats);

    let stats = RwSignal::new(None::<DashboardStats>);
    let stats_loading = RwSignal::new(false);
    let stats_error = RwSignal::new(None::<String>);

    let users = RwSignal::new(Vec::<DashboardUser>::new());
    let users_loading = RwSignal::new(false);
    let users_error = RwSignal::new(None::<String>);
    let users_search = RwSignal::new(String::new());
    let users_cursor = RwSignal::new(None::<String>);

    let channels = RwSignal::new(Vec::<DashboardChannel>::new());
    let channels_loading = RwSignal::new(false);
    let channels_error = RwSignal::new(None::<String>);
    let channels_search = RwSignal::new(String::new());
    let channels_cursor = RwSignal::new(None::<String>);

    let fetch_stats: Arc<dyn Fn() + Send + Sync + 'static> = Arc::new(move || {
        stats_loading.set(true);
        stats_error.set(None);
        spawn_local(async move {
            match crate::api::dashboard::get_dashboard_stats().await {
                Ok(data) => stats.set(Some(data)),
                Err(err) => stats_error.set(Some(format!("Failed to load stats: {}", err))),
            }
            stats_loading.set(false);
        });
    });

    let fetch_users: Arc<dyn Fn(bool) + Send + Sync + 'static> = Arc::new(move |reset: bool| {
        if users_loading.get() {
            return;
        }
        users_loading.set(true);
        users_error.set(None);

        let cursor = if reset { None } else { users_cursor.get() };
        let search = users_search.get();
        spawn_local(async move {
            let search_ref = (!search.trim().is_empty()).then_some(search.trim());
            match crate::api::dashboard::get_dashboard_users(Some(20), cursor.as_deref(), search_ref).await {
                Ok(page) => {
                    if reset {
                        users.set(page.data);
                    } else {
                        let mut current = users.get();
                        current.extend(page.data);
                        users.set(current);
                    }
                    users_cursor.set(page.next_cursor);
                }
                Err(err) => users_error.set(Some(format!("Failed to load users: {}", err))),
            }
            users_loading.set(false);
        });
    });

    let fetch_channels: Arc<dyn Fn(bool) + Send + Sync + 'static> = Arc::new(move |reset: bool| {
        if channels_loading.get() {
            return;
        }
        channels_loading.set(true);
        channels_error.set(None);

        let cursor = if reset { None } else { channels_cursor.get() };
        let search = channels_search.get();
        spawn_local(async move {
            let search_ref = (!search.trim().is_empty()).then_some(search.trim());
            match crate::api::dashboard::get_dashboard_channels(Some(20), cursor.as_deref(), search_ref, None).await {
                Ok(page) => {
                    if reset {
                        channels.set(page.data);
                    } else {
                        let mut current = channels.get();
                        current.extend(page.data);
                        channels.set(current);
                    }
                    channels_cursor.set(page.next_cursor);
                }
                Err(err) => channels_error.set(Some(format!("Failed to load channels: {}", err))),
            }
            channels_loading.set(false);
        });
    });

    {
        let fetch_stats = fetch_stats.clone();
        let fetch_users = fetch_users.clone();
        let fetch_channels = fetch_channels.clone();
        create_effect(move |_| {
            fetch_stats();
            fetch_users(true);
            fetch_channels(true);
        });
    }

    view! {
        <div class="dashboard-panel">
            <div class="dashboard-header">
                <div>
                    <h2 class="text-2xl font-bold">"Dashboard Guild"</h2>
                    <p class="text-sm text-secondary mt-2">
                        "Pantau statistik, profil pengguna, dan aktivitas kanal komunitas IMPHNEN."
                    </p>
                </div>
            </div>

            <div class="tabs">
                <div class="tab-list mb-6">
                    <DashboardTabButton tab=DashboardTab::Stats active_tab=active_tab label="Statistik" icon="📊" />
                    <DashboardTabButton tab=DashboardTab::Users active_tab=active_tab label="Pengguna" icon="👥" />
                    <DashboardTabButton tab=DashboardTab::Channels active_tab=active_tab label="Kanal" icon="#" />
                </div>

                <div class="tab-content" style:display=move || if active_tab.get() == DashboardTab::Stats { "block" } else { "none" }>
                    <StatsOverview
                        stats=stats.get()
                        loading=stats_loading.get()
                        error=stats_error.get()
                        on_retry=Box::new({
                            let fetch_stats = fetch_stats.clone();
                            move || fetch_stats()
                        })
                    />
                </div>

                <div class="tab-content" style:display=move || if active_tab.get() == DashboardTab::Users { "block" } else { "none" }>
                    <UserSummaryList
                        users=users.get()
                        loading=users_loading.get()
                        error=users_error.get()
                        search=users_search.get()
                        has_more=users_cursor.get().is_some()
                        on_search_change=Box::new({
                            let fetch_users = fetch_users.clone();
                            move |value| {
                                users_search.set(value);
                                users_cursor.set(None);
                                fetch_users(true);
                            }
                        })
                        on_load_more=Box::new({
                            let fetch_users = fetch_users.clone();
                            move || fetch_users(false)
                        })
                        on_retry=Box::new({
                            let fetch_users = fetch_users.clone();
                            move || fetch_users(true)
                        })
                    />
                </div>

                <div class="tab-content" style:display=move || if active_tab.get() == DashboardTab::Channels { "block" } else { "none" }>
                    <ChannelSummaryList
                        channels=channels.get()
                        loading=channels_loading.get()
                        error=channels_error.get()
                        search=channels_search.get()
                        has_more=channels_cursor.get().is_some()
                        on_search_change=Box::new({
                            let fetch_channels = fetch_channels.clone();
                            move |value| {
                                channels_search.set(value);
                                channels_cursor.set(None);
                                fetch_channels(true);
                            }
                        })
                        on_load_more=Box::new({
                            let fetch_channels = fetch_channels.clone();
                            move || fetch_channels(false)
                        })
                        on_retry=Box::new({
                            let fetch_channels = fetch_channels.clone();
                            move || fetch_channels(true)
                        })
                    />
                </div>
            </div>
        </div>
    }
}

#[component]
fn DashboardTabButton(
    tab: DashboardTab,
    active_tab: RwSignal<DashboardTab>,
    label: &'static str,
    icon: &'static str,
) -> impl IntoView {
    let tab_for_class = tab.clone();
    let tab_for_aria = tab.clone();
    let tab_for_click = tab;

    view! {
        <button
            class="tab-trigger"
            class:active=move || active_tab.get() == tab_for_class
            aria-selected=move || if active_tab.get() == tab_for_aria { "true" } else { "false" }
            on:click=move |_| active_tab.set(tab_for_click.clone())
        >
            <span>{icon}</span>
            <span>{label}</span>
        </button>
    }
}
