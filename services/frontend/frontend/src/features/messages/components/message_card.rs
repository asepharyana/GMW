use leptos::prelude::*;
use regex::Regex;
use shared_types::message::{AiSeverity, AiStatus, AttachmentRef, MessageRecord};
use std::sync::{Arc, OnceLock};
use wasm_bindgen::prelude::*;


// ─── Helpers ──────────────────────────────────────────────

fn custom_emoji_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<(a)?:([a-zA-Z0-9_]+):(\d+)>").unwrap())
}

fn render_emojis(content: &str) -> Vec<AnyView> {
    let re = custom_emoji_regex();
    let mut parts: Vec<AnyView> = Vec::new();
    let mut last = 0;
    let content_owned = content.to_string();
    for cap in re.captures_iter(&content_owned) {
        let m = cap.get(0).unwrap();
        if m.start() > last {
            let text = content_owned[last..m.start()].to_string();
            parts.push(view! { <span>{text}</span> }.into_any());
        }
        let animated = cap.get(1).is_some();
        let name = cap.get(2).map(|c| c.as_str()).unwrap_or("").to_string();
        let id = cap.get(3).map(|c| c.as_str()).unwrap_or("0").to_string();
        let ext = if animated { "gif" } else { "png" };
        let url = format!("https://cdn.discordapp.com/emojis/{}.{}?size=128", id, ext);
        let title = format!(":{}:", name);
        parts.push(
            view! {
                <img src=url alt=name class="custom-emoji" title=title loading="lazy" />
            }
            .into_any(),
        );
        last = m.end();
    }
    if last < content_owned.len() {
        let text = content_owned[last..].to_string();
        parts.push(view! { <span>{text}</span> }.into_any());
    }
    parts
}

fn time_ago(ts: i64) -> String {
    let now = js_sys::Date::now() as i64;
    // created_at is in milliseconds (from Discord's message.createdTimestamp)
    let secs = if now > ts { (now - ts) / 1000 } else { 0 };
    if secs < 60 {
        format!("{}s ago", secs)
    } else if secs < 3600 {
        format!("{}m ago", secs / 60)
    } else if secs < 86400 {
        format!("{}h ago", secs / 3600)
    } else {
        let d = js_sys::Date::new(&JsValue::from_f64(ts as f64));
        format!("{}", d.to_locale_date_string("en-US", &JsValue::UNDEFINED))
    }
}

fn fmt_time(ts: i64) -> String {
    let d = js_sys::Date::new(&JsValue::from_f64(ts as f64));
    format!("{:02}:{:02}", d.get_hours(), d.get_minutes())
}

fn severity_class(s: &AiSeverity) -> &'static str {
    match s {
        AiSeverity::Critical | AiSeverity::High => "badge-destructive",
        AiSeverity::Medium => "badge-warning",
        AiSeverity::Low => "badge-info",
        AiSeverity::None => "badge-outline",
    }
}

fn is_fallback(t: &str) -> bool {
    t.starts_with("[Attachment:") || t.starts_with("[Sticker:") || t.starts_with("[Embed]")
}

fn get_cats(raw: &Option<Vec<String>>) -> Vec<String> {
    raw.as_ref()
        .map(|v| {
            v.iter()
                .filter(|c| *c != "analysis_incomplete")
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

// ─── StatusBadgeInline ────────────────────────────────────
#[component]
fn StatusBadgeInline(status: AiStatus) -> impl IntoView {
    let (cl, icon_svg): (&'static str, AnyView) = match &status {
        AiStatus::Clean => ("status-badge-clean", view! { <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15.586L6.707 12.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 10-1.414-1.414L10 15.586z"></path></svg> }.into_any()),
        AiStatus::Flagged => ("status-badge-flagged", view! { <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg> }.into_any()),
        AiStatus::Error => ("status-badge-error", view! { <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg> }.into_any()),
        AiStatus::Pending => {
            ("status-badge-pending", ().into_any())
        },
        AiStatus::Processing => {
            ("status-badge-processing", ().into_any())
        },
        AiStatus::Warn => {
            ("status-badge-warn", ().into_any())
        },
    };
    view! {
        <span class=format!("status-badge {}", cl)>
            {icon_svg}
            {format!("{:?}", status)}
        </span>
    }
}

// ─── MessageRow ───────────────────────────────────────────
#[component]
pub fn MessageRow(
    message: MessageRecord,
    on_reanalyze: Arc<dyn Fn(String) + Send + Sync + 'static>,
) -> impl IntoView {
    let cats = get_cats(&message.ai_categories);
    let conf = message.ai_confidence.or(message.ai_moderation_score);
    let display = message
        .edited_content
        .as_deref()
        .unwrap_or(&message.content);
    let show = !display.is_empty() && !is_fallback(display);
    let ai_st = message.ai_status.clone().unwrap_or(AiStatus::Pending);

    let analysis_summary = {
        let mut p = cats.iter().take(3).cloned().collect::<Vec<_>>().join(", ");
        if cats.len() > 3 {
            p = format!("{} +{} more", p, cats.len() - 3);
        }
        if !p.is_empty() {
            p.push_str(" · ");
        }
        p.push_str(&format!(
            "{}% conf",
            conf.map(|c| (c * 100.0) as u8).unwrap_or(0)
        ));
        p
    };

    // Attachments
    let all_atts = message
        .metadata
        .as_ref()
        .and_then(|m| m.attachments.as_ref())
        .cloned()
        .unwrap_or_default();
    let imgs: Vec<AttachmentRef> = all_atts
        .iter()
        .filter(|a| {
            a.content_type
                .as_deref()
                .map(|ct| ct.starts_with("image/"))
                .unwrap_or(false)
                || a.name.to_lowercase().ends_with(".png")
                || a.name.to_lowercase().ends_with(".jpg")
                || a.name.to_lowercase().ends_with(".jpeg")
                || a.name.to_lowercase().ends_with(".gif")
                || a.name.to_lowercase().ends_with(".webp")
        })
        .cloned()
        .collect();
    let vids: Vec<AttachmentRef> = all_atts
        .iter()
        .filter(|a| {
            a.content_type
                .as_deref()
                .map(|ct| ct.starts_with("video/"))
                .unwrap_or(false)
                || a.name.to_lowercase().ends_with(".mp4")
                || a.name.to_lowercase().ends_with(".webm")
                || a.name.to_lowercase().ends_with(".mov")
        })
        .cloned()
        .collect();

    let stickers = message
        .metadata
        .as_ref()
        .and_then(|m| m.stickers.as_ref())
        .cloned()
        .unwrap_or_default();

    let reanalyze_id = message.id.clone();
    let on_click_re = move |_| on_reanalyze(reanalyze_id.clone());

    view! {
        <div class="msg-row">
            {/* Header */}
            <div class="msg-row-bar">
                <span class="msg-row-time" title=time_ago(message.created_at)>
                    {fmt_time(message.created_at)}
                </span>
                {message.edited_at.is_some().then(|| view! {
                    <span class="msg-row-badge edited">
                        "✎ edited"
                    </span>
                })}
                {message.deleted_at.is_some().then(|| view! {
                    <span class="msg-row-badge deleted">
                        "🗑 deleted"
                    </span>
                })}
                <div class="msg-row-status">
                    <StatusBadgeInline status=ai_st.clone() />
                    {message.ai_severity.as_ref().filter(|s| **s != AiSeverity::None).map(|sev| view! {
                        <span class=format!("badge text-xs {}", severity_class(sev))>{format!("{:?}", sev)}</span>
                    })}
                </div>
            </div>

            {/* Content */}
            {show.then(|| {
                let rendered = render_emojis(display);
                view! {
                    <p class="msg-row-body" class:is-deleted=message.deleted_at.is_some()>
                        {rendered.into_iter().collect::<Vec<_>>()}
                    </p>
                }
            })}

            {/* Stickers */}
            {(!stickers.is_empty()).then(|| view! {
                <div class="msg-media-row">
                    {stickers.iter().map(|s| {
                        let url_owned = s.url.clone().unwrap_or_default();
                        let name_owned = s.name.clone().unwrap_or_default();
                        let has_url = !url_owned.is_empty();
                        view! {
                            <div>
                                {if has_url {
                                    view! {
                                        <img src=url_owned alt=name_owned class="msg-sticker" loading="lazy" />
                                    }.into_any()
                                } else {
                                    view! {
                                        <div class="msg-sticker-placeholder">
                                            "😊"
                                        </div>
                                    }.into_any()
                                }}
                            </div>
                        }
                    }).collect::<Vec<_>>()}
                </div>
            })}

            {/* Images */}
            {if !imgs.is_empty() {
                let imgs_local = imgs.clone();
                let images_view = imgs_local.iter().take(4).map(|a| {
                    let url1 = a.url.clone();
                    let url2 = a.url.clone();
                    let name1 = a.name.clone();
                    view! {
                        <a href=url1 target="_blank" class="msg-thumb-link">
                            <img src=url2 alt=name1 class="msg-thumb" loading="lazy" />
                        </a>
                    }
                }).collect::<Vec<_>>();
                let overflow = if imgs.len() > 4 {
                    let extra = imgs.len() - 4;
                    view! {
                        <div class="msg-media-overflow">
                            <span>{"+"} {extra}</span> <span class="ml-0.5">"🖼"</span>
                        </div>
                    }.into_any()
                } else {
                    ().into_any()
                };
                view! {
                    <div class="msg-media-row is-scroll">
                        {images_view}
                        {overflow}
                    </div>
                }.into_any()
            } else {
                ().into_any()
            }}

            {/* Videos */}
            {if !vids.is_empty() {
                let vids_local = vids.clone();
                let videos_view = vids_local.iter().take(4).map(|a| {
                    let url = a.url.clone();
                    view! {
                        <video src=url controls class="msg-video" preload="metadata"></video>
                    }
                }).collect::<Vec<_>>();
                let overflow = if vids.len() > 4 {
                    let extra = vids.len() - 4;
                    view! {
                        <div class="msg-media-overflow tall">
                            <span>{"+"} {extra}</span> <span class="ml-0.5">"▶"</span>
                        </div>
                    }.into_any()
                } else {
                    ().into_any()
                };
                view! {
                    <div class="msg-media-row is-scroll">
                        {videos_view}
                        {overflow}
                    </div>
                }.into_any()
            } else {
                ().into_any()
            }}

            {/* Categories */}
            {if !cats.is_empty() {
                let cats_local = cats.clone();
                view! {
                    <div class="msg-cats">
                        {cats_local.iter().map(|c| view! {
                            <span class="badge badge-secondary text-xs">{c.clone()}</span>
                        }).collect::<Vec<_>>()}
                    </div>
                }.into_any()
            } else {
                ().into_any()
            }}

            {/* AI Analysis */}
            {message.ai_analysis.as_ref().map(|analysis| {
                let f_cls = if ai_st == AiStatus::Flagged { "flagged" } else { "clean" };
                let icon = if ai_st == AiStatus::Flagged { "🚨" } else { "ℹ️" };
                let analysis_summary_str = analysis_summary.clone();
                let analysis_str = analysis.clone();
                view! {
                    <div class=format!("msg-analysis {}", f_cls)>
                        <div class="msg-analysis-row">
                            <span class="msg-analysis-icon">{icon}</span>
                            <div class="msg-analysis-body">
                                <span class="msg-analysis-summary">{analysis_summary_str}</span>
                                <div class="msg-analysis-text">{analysis_str}</div>
                            </div>
                        </div>
                    </div>
                }
            })}

            {/* Error */}
            {message.ai_error.as_ref().map(|e| {
                let error_str = e.clone();
                view! {
                    <div class="msg-error">
                        <span>"AI error: "{error_str}</span>
                    </div>
                }
            })}

            {/* Re-analyze */}
            <div class="msg-actions">
                <button
                    class=format!("btn btn-sm {}", if ai_st == AiStatus::Error { "btn-destructive" } else { "btn-outline" })
                    on:click=on_click_re
                    disabled=ai_st == AiStatus::Processing
                >
                    <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"></path></svg>
                    " Re-analyze"
                </button>
                {(ai_st == AiStatus::Error).then(|| view! {
                    <span class="msg-retry-hint">"Click to retry"</span>
                })}
            </div>
        </div>
    }
}

// ─── MessageCard ──────────────────────────────────────────
#[component]
pub fn MessageCard(
    messages: Vec<MessageRecord>,
    on_reanalyze: Arc<dyn Fn(String) + Send + Sync + 'static>,
) -> impl IntoView {
    let first = &messages[0];
    let has_multi = messages.len() > 1;
    let deleted = first.deleted_at.is_some();
    let avatar = first
        .avatar_url
        .clone()
        .unwrap_or_else(|| "https://cdn.discordapp.com/embed/avatars/0.png".into());
    let loc_label = first
        .metadata
        .as_ref()
        .and_then(|m| m.channel.as_ref())
        .map(|c| {
            if let Some(ref tn) = c.thread_name {
                format!("# {} › {}", c.channel_name.as_deref().unwrap_or("?"), tn)
            } else {
                format!("# {}", c.channel_name.as_deref().unwrap_or("?"))
            }
        });
    let card_cls = if deleted { " is-deleted" } else { "" };

    view! {
        <article class=format!("msg-card{}", card_cls)>
            <div class="msg-card-inner">
                <img src=avatar alt="" class="msg-card-avatar" />
                <div class="msg-card-body">
                    <div class="msg-card-head">
                        <span class="msg-card-name">{first.username.clone()}</span>
                        {loc_label.as_ref().map(|l| {
                            let label_str = l.clone();
                            view! {
                                <span class="msg-card-channel">{label_str}</span>
                            }
                        })}
                        <span class="msg-card-time">
                            {time_ago(first.created_at)}
                            {has_multi.then(|| format!(" · {} msgs", messages.len()))}
                        </span>
                    </div>
                    <div class="msg-card-messages" class:separated=has_multi>
                        {messages.into_iter().enumerate().map(|(i, msg)| {
                            view! {
                                <MessageRow message=msg on_reanalyze=on_reanalyze.clone() />
                            }
                        }).collect::<Vec<_>>()}
                    </div>
                </div>
            </div>
        </article>
    }
}

// ─── Skeleton ─────────────────────────────────────────────
#[component]
pub fn MessageCardSkeleton() -> impl IntoView {
    view! {
        <article class="msg-card">
            <div class="msg-skel">
                <div class="msg-skel-avatar"></div>
                <div class="msg-skel-lines">
                    <div class="msg-skel-line" style="width:192px"></div>
                    <div class="msg-skel-line" style="width:100%"></div>
                    <div class="msg-skel-line" style="width:75%"></div>
                    <div class="msg-skel-badges">
                        <div class="msg-skel-badge" style="width:64px"></div>
                        <div class="msg-skel-badge" style="width:80px"></div>
                    </div>
                </div>
            </div>
        </article>
    }
}
