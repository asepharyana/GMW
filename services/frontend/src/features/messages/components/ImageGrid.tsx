import type { MessageRecord } from "../../../shared/api/client";
import { parseMetadata } from "../../../entities/message/types";

interface ImageItem {
  url: string;
  title: string;
  kind: "attachment" | "embed" | "sticker";
  message: MessageRecord;
}

export function ImageGrid({ messages }: { messages: MessageRecord[] }) {
  const images: ImageItem[] = [];

  for (const message of messages) {
    const metadata = parseMetadata(message.metadata);

    // Stickers
    for (const sticker of metadata.stickers ?? []) {
      if (sticker.url) {
        images.push({
          url: sticker.url,
          title: sticker.name || "sticker",
          kind: "sticker",
          message,
        });
      }
    }

    // Attachments
    for (const attachment of metadata.attachments ?? []) {
      if (
        attachment.url &&
        (attachment.contentType?.startsWith("image/") ||
          /\.(png|jpe?g|gif|webp)$/i.test(attachment.name))
      ) {
        images.push({
          url: attachment.url,
          title: attachment.name,
          kind: "attachment",
          message,
        });
      }
    }

    // Embed images
    for (const embed of metadata.embeds ?? []) {
      for (const imgUrl of [embed.image, embed.thumbnail].filter(Boolean)) {
        images.push({
          url: imgUrl as string,
          title: embed.title || "embed image",
          kind: "embed",
          message,
        });
      }
    }
  }

  if (images.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No images found.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {images.map((image, index) => {
        // Stable key using message.id + url
        const stableKey = `${image.message.id}-${image.kind}-${index}`;
        return (
          <a
            key={stableKey}
            href={image.url}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
          >
            <div className="relative aspect-video overflow-hidden">
              {image.kind === "sticker" ? (
                <img
                  src={image.url}
                  alt={image.title}
                  className="h-full w-full object-contain bg-muted/30 p-2 transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <img
                  src={image.url}
                  alt={image.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              )}
              <div className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur">
                {image.kind}
              </div>
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{image.title}</div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 overflow-hidden rounded-full">
                  <img
                    src={
                      image.message.avatar_url ??
                      "https://cdn.discordapp.com/embed/avatars/0.png"
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {image.message.username}
                </span>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
