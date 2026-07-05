use leptos::prelude::*;
use regex::Regex;
use shared_types::message::{AiSeverity, AiStatus};
use std::sync::OnceLock;
use wasm_bindgen::prelude::*;

// ─── Helpers ──────────────────────────────────────────────

pub fn custom_emoji_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<(a)?:([a-zA-Z0-9_]+):(\d+)>").unwrap())
}

pub fn render_emojis(content: &str) -> Vec<AnyView> {
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

pub fn time_ago(ts: i64) -> String {
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

pub fn fmt_time(ts: i64) -> String {
    let d = js_sys::Date::new(&JsValue::from_f64(ts as f64));
    format!("{:02}:{:02}", d.get_hours(), d.get_minutes())
}

pub fn severity_class(s: &AiSeverity) -> &'static str {
    match s {
        AiSeverity::Critical | AiSeverity::High => "badge-destructive",
        AiSeverity::Medium => "badge-warning",
        AiSeverity::Low => "badge-info",
        AiSeverity::None => "badge-outline",
    }
}

pub fn is_fallback(t: &str) -> bool {
    t.starts_with("[Attachment:") || t.starts_with("[Sticker:") || t.starts_with("[Embed]")
}

pub fn get_cats(raw: &Option<Vec<String>>) -> Vec<String> {
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
pub fn StatusBadgeInline(status: AiStatus) -> impl IntoView {
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
