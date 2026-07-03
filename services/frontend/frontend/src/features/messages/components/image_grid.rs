use leptos::prelude::*;
use shared_types::message::MessageRecord;

#[component]
pub fn ImageGrid(messages: Vec<MessageRecord>) -> impl IntoView {
    let mut seen_urls = std::collections::HashSet::new();
    let mut urls = Vec::new();

    for msg in &messages {
        if let Some(meta) = &msg.metadata {
            // attachments with image MIME
            if let Some(atts) = &meta.attachments {
                for att in atts {
                    let is_img = att
                        .content_type
                        .as_deref()
                        .map(|ct| ct.starts_with("image/"))
                        .unwrap_or(false)
                        || att.name.to_lowercase().ends_with(".png")
                        || att.name.to_lowercase().ends_with(".jpg")
                        || att.name.to_lowercase().ends_with(".jpeg")
                        || att.name.to_lowercase().ends_with(".gif")
                        || att.name.to_lowercase().ends_with(".webp");
                    if is_img && seen_urls.insert(att.url.clone()) {
                        urls.push(att.url.clone());
                    }
                }
            }
            // stickers
            if let Some(stickers) = &meta.stickers {
                for s in stickers {
                    if let Some(ref url) = s.url {
                        if seen_urls.insert(url.clone()) {
                            urls.push(url.clone());
                        }
                    }
                }
            }
            // embed images
            if let Some(embeds) = &meta.embeds {
                for e in embeds {
                    if let Some(ref img) = e.image {
                        if seen_urls.insert(img.url.clone()) {
                            urls.push(img.url.clone());
                        }
                    }
                    if let Some(ref thumb) = e.thumbnail {
                        if seen_urls.insert(thumb.url.clone()) {
                            urls.push(thumb.url.clone());
                        }
                    }
                }
            }
        }
    }

    if urls.is_empty() {
        return view! {
            <div class="flex items-center justify-center h-32 text-secondary italic">
                "No images found"
            </div>
        }
        .into_any();
    }

    view! {
        <div class="image-grid">
            {urls.into_iter().map(|url| {
                let url_clone = url.clone();
                view! {
                    <a href=url_clone target="_blank" class="image-grid-item">
                        <img src=url alt="attachment" loading="lazy" />
                    </a>
                }
            }).collect::<Vec<_>>()}
        </div>
    }
    .into_any()
}
