import { Link, useLocation } from "@tanstack/react-router"
import { Command, Search, ShieldAlert } from "lucide-react"
import { QueuePulse } from "#/components/layout/queue-ribbon"
import { StatusDot } from "#/components/layout/status-dot"
import { Button } from "#/components/ui/button"
import { ModeToggle } from "#/components/ui/mode-toggle"
import { activeNavItem } from "#/libs/navigation"

/**
 * The wire strip: where you are, whether the pipeline is alive, and the
 * palette trigger.
 *
 * It is a single thin line, not a branded header. The brand lives in the rail
 * on a desktop and in this strip only on a phone, where there is no rail.
 *
 * The command palette is opened by a button here AND by ⌘K / Ctrl+K anywhere in
 * the app, so the shortcut is handled once in `CommandPalette` and this only
 * dispatches the event.
 */
export function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
	const { pathname } = useLocation()
	const current = activeNavItem(pathname)

	return (
		// The header is NOT itself sticky: the shell wraps it and the queue ribbon
		// in a single `sticky top-0` group, so two nested sticky elements would
		// fight over the same offset.
		<header className="flex h-12 items-center gap-3 border-b border-rule bg-canvas/85 px-4 backdrop-blur-md sm:px-8 lg:px-10">
			{/*
        The brand mark is a lime square, decorative. `min-h-11 min-w-11` makes the
        whole home link a real target on touch widths — a 28px tappable logo is
        the classic mis-tap, especially one-handed. It is shown below `lg` only,
        because from `lg` up the rail owns the brand.
      */}
			<Link
				to="/dashboard"
				className="-m-2.5 flex min-h-11 min-w-11 items-center gap-2 p-2.5 lg:hidden"
				aria-label="Guild Moderation Watcher, home"
			>
				<span className="flex size-7 items-center justify-center rounded-sm bg-lime text-lime-ink">
					<ShieldAlert className="size-4" aria-hidden />
				</span>
			</Link>

			<p className="flex min-w-0 items-center gap-2 truncate">
				<span className="hidden font-display text-sm font-extrabold tracking-tighter text-ink sm:inline">
					Guild Moderation Watcher
				</span>
				{current && (
					<>
						<span className="hidden text-ink-faint sm:inline" aria-hidden>
							/
						</span>
						<span className="field-label text-ink-soft">{current.label}</span>
					</>
				)}
			</p>

			<div className="ml-auto flex items-center gap-2 sm:gap-3">
				<QueuePulse className="hidden md:inline-flex" />
				<StatusDot className="hidden sm:flex" />

				{/* Theme control. Always visible, on every breakpoint — it is a global
            preference, not a per-page one. */}
				<ModeToggle />

				{/*
          No colour/radius overrides on the Button itself: the design gate gives
          the primitive ownership of that, and `outline` already reads correctly
          against the chrome.

          The one thing overridden is the hit area, and only on touch widths.
          The `sm` button variant is `h-7` (28px), under the 44px touch minimum.
          This cannot be fixed with padding: `h-7` is `border-box`, so extra
          padding shrinks the icon inside a box that never grows, and margins are
          not part of the hit area at all. The box has to be sized — `min-h-11`
          (44px) below `sm`, back to the primitive's own `h-7` from `sm` up,
          where a mouse makes target size moot.

          On a phone the label and the kbd hint are both hidden, so the trigger
          carries its own accessible name, and the `⌘K` chip is desktop-only —
          shown only where the shortcut genuinely exists.
        */}
				<Button
					variant="outline"
					size="sm"
					onClick={onOpenPalette}
					aria-label="Search sections"
					title="Search sections (⌘K)"
					className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-0"
				>
					<Search aria-hidden />
					<span className="hidden sm:inline">Search</span>
					<kbd className="hidden items-center gap-0.5 rounded-sm border border-hairline bg-surface-2 px-1 font-mono text-micro lg:inline-flex">
						<Command className="size-2.5" aria-hidden />K
					</kbd>
				</Button>
			</div>
		</header>
	)
}
