/**
 * discordTokens.ts
 *
 * Normalizes Discord markdown tokens (custom emoji, user/role/channel
 * mentions, timestamps) into readable placeholders before content reaches
 * the LLM. The numeric snowflake IDs inside these tokens are meaningless to
 * an LLM and were the source of repeated false positives in the old
 * regex-based Layer 1 classifier — so raw IDs are never presented.
 */

// <:name:id> | <a:name:id> | <@id> | <@!id> | <@&id> | <#id> | <t:id:style>
const DISCORD_TOKEN_RE =
  /<(?:a?:([^>]{1,32}):(\d{17,20})|@!?(\d{17,20})|@&(\d{17,20})|#(\d{17,20})|t:(\d{10,11})(?::([tTdDRfF]))?)>/g;

/**
 * Replaces Discord markdown tokens with readable placeholders.
 *
 * - `<:name:id>` / `<a:name:id>` → `[emoji:name]`
 * - `<@123>` / `<@!123>`          → `@user`
 * - `<@&123>`                     → `@role`
 * - `<#123>`                      → `#channel`
 * - `<t:123:R>`                   → `[time]`
 *
 * No numeric IDs survive, so digit-shaped patterns can never match them.
 */
export function sanitizeDiscordTokens(content: string): string {
  if (!content.includes("<")) return content;
  return content.replace(
    DISCORD_TOKEN_RE,
    (_full, emojiName, _emojiId, _userId, _roleId, _channelId, _time, _style) => {
      if (emojiName) return `[emoji:${emojiName}]`;
      // Capture groups tell us which alternative matched by position:
      // 3=user, 4=role, 5=channel, 6=time
      if (_userId !== undefined) return "@user";
      if (_roleId !== undefined) return "@role";
      if (_channelId !== undefined) return "#channel";
      if (_time !== undefined) return "[time]";
      return " ";
    },
  );
}
