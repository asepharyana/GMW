import type { MessageRecord } from "../../../entities/message/types.js";
import { parseMetadata } from "../../../shared/lib/utils.js";
import { EmptyStateMascot } from "../../../widgets/mascot/MascotImage";

interface ImageItem {
  url: string;
  title: string;
  kind: "attachment" | "embed" | "sticker";
  message: MessageRecord;
}

function kindBadge(kind: ImageItem["kind"]): string {
  switch (kind) {
    case "sticker":
      return "bg-primary/10 text-primary border-primary/20";
    case "attachment":
      return "bg-primary-soft text-primary border-primary/30";
    case "embed":
      return "bg-tertiary-soft text-tertiary border-tertiary/20";
  }
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
    return <EmptyStateMascot />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {images.map((image) => {
        // Stable key using message.id + url
        const stableKey = `${image.message.id}-${image.kind}-${image.url}`;
        return (
          <a
            key={stableKey}
            href={image.url}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-xl border border-primary/20 bg-white shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
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
              <span
                className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider shadow-sm backdrop-blur ${kindBadge(image.kind)}`}
              >
                {image.kind}
              </span>
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{image.title}</div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 overflow-hidden rounded-full ring-1 ring-primary/30">
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
