pub mod message;
pub mod guild;
pub mod voice;
pub mod media;
pub mod dashboard;
pub mod recording;
pub mod ui_state;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embed_media_string() {
        // Simulate what Discord sends: thumbnail as a plain URL string
        let json = r#"{"title":"Test","thumbnail":"https://cdn.example.com/image.gif"}"#;
        let embed: message::EmbedInfo = serde_json::from_str(json).unwrap();
        assert_eq!(embed.title, Some("Test".into()));
        let thumb = embed.thumbnail.unwrap();
        assert_eq!(thumb.url, "https://cdn.example.com/image.gif");
        assert_eq!(thumb.width, None);
        assert_eq!(thumb.height, None);
    }

    #[test]
    fn test_embed_media_object() {
        // Standard embed media object
        let json = r#"{"thumbnail":{"url":"https://cdn.example.com/img.png","width":128,"height":128}}"#;
        let embed: message::EmbedInfo = serde_json::from_str(json).unwrap();
        let thumb = embed.thumbnail.unwrap();
        assert_eq!(thumb.url, "https://cdn.example.com/img.png");
        assert_eq!(thumb.width, Some(128));
        assert_eq!(thumb.height, Some(128));
    }

    #[test]
    fn test_embed_media_null() {
        let json = r#"{"title":"No Media Here"}"#;
        let embed: message::EmbedInfo = serde_json::from_str(json).unwrap();
        assert_eq!(embed.thumbnail, None);
        assert_eq!(embed.image, None);
    }

    #[test]
    fn test_embed_media_both_strings() {
        // Discord might send both image and thumbnail as strings 
        let json = r#"{"image":"https://cdn.example.com/banner.gif","thumbnail":"https://cdn.example.com/thumb.gif"}"#;
        let embed: message::EmbedInfo = serde_json::from_str(json).unwrap();
        assert_eq!(embed.image.as_ref().unwrap().url, "https://cdn.example.com/banner.gif");
        assert_eq!(embed.thumbnail.as_ref().unwrap().url, "https://cdn.example.com/thumb.gif");
    }

    #[test]
    fn test_full_message_metadata_with_string_thumbnail() {
        // Full realistic metadata with string thumbnail (the actual bug)
        let json = r#"{
            "stickers": [],
            "embeds": [{
                "title": "Meisho Doto Tm Opera O",
                "description": null,
                "url": "https://klipy.com/gifs/test",
                "color": null,
                "image": null,
                "thumbnail": "https://static.klipy.com/ii/test.webp",
                "author": null,
                "footer": null,
                "fields": []
            }]
        }"#;
        let meta: message::MessageMetadata = serde_json::from_str(json).unwrap();
        let embeds = meta.embeds.unwrap();
        assert_eq!(embeds.len(), 1);
        let embed = &embeds[0];
        assert_eq!(embed.title.as_deref(), Some("Meisho Doto Tm Opera O"));
        assert!(embed.image.is_none());
        let thumb = embed.thumbnail.as_ref().unwrap();
        assert_eq!(thumb.url, "https://static.klipy.com/ii/test.webp");
        assert_eq!(thumb.width, None);
        assert_eq!(thumb.height, None);
    }
}
