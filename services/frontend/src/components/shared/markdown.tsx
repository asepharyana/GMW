import { Fragment, type ReactNode } from "react";

/**
 * Minimal, XSS-safe Markdown renderer.
 *
 * Builds React nodes directly (NO dangerouslySetInnerHTML), so AI/user text can
 * never inject markup. Supports the subset that matters for chat + analysis
 * blobs: fenced code blocks, inline `code`, **bold**, *italic*, and newlines.
 * Anything unrecognised is rendered as plain escaped text.
 */

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let i = 0;
  const m: RegExpExecArray | null = regex.exec(text);
  while (m !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={`${keyBase}-b${i}`} className="font-semibold text-ink">
          {m[2]}
        </strong>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <em key={`${keyBase}-i${i}`} className="italic text-ink-soft">
          {m[3]}
        </em>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(
        <code
          key={`${keyBase}-c${i}`}
          className="mono rounded bg-surface-2 px-1 py-0.5 text-[0.85em] text-signal"
        >
          {m[4]}
        </code>,
      );
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderBlock(content: string, keyBase: string): ReactNode[] {
  // Split on triple-backtick fences. Even indices = prose, odd = code block.
  const parts = content.split("```");
  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      const nl = part.indexOf("\n");
      const code = nl >= 0 ? part.slice(nl + 1) : part;
      return (
        <pre
          key={`${keyBase}-pre${idx}`}
          className="my-1.5 overflow-x-auto rounded-[10px] border border-hairline bg-surface-2 p-3"
        >
          <code className="mono block whitespace-pre text-xs text-ink-soft">
            {code.replace(/\n$/, "")}
          </code>
        </pre>
      );
    }
    const lines = part.split("\n");
    return (
      <Fragment key={`${keyBase}-t${idx}`}>
        {lines.map((line, li) => (
          <Fragment key={`${keyBase}-l${idx}-${li}`}>
            {renderInline(line, `${keyBase}-l${idx}-${li}`)}
            {li < lines.length - 1 && <br />}
          </Fragment>
        ))}
      </Fragment>
    );
  });
}

export function MarkdownLite({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return <div className={className}>{renderBlock(content, "md")}</div>;
}
