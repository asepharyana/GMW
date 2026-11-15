import { Outlet } from "@tanstack/react-router"
import { Chatbot } from "#/components/features/chatbot"
import {
	CommandPalette,
	openCommandPalette,
} from "#/components/features/command-palette"
import { ErrorBoundary } from "#/components/layout/error-boundary"
import { MobileNav } from "#/components/layout/mobile-nav"
import { NavRail } from "#/components/layout/nav-rail"
import { QueueRibbon } from "#/components/layout/queue-ribbon"
import { Topbar } from "#/components/layout/topbar"

/**
 * The dashboard chrome: rail, wire strip, chatbot, palette, and the route
 * content slot.
 *
 * WHY THIS LIVES ON `_authenticated`, NOT `__root`
 *
 * kana §3.1 asks for a layout to be a file + sibling-folder pair, and
 * `routes/_authenticated.tsx` is that file. Mounting the chrome there instead of
 * on the root route makes `__root.tsx` a bare route node and puts the visible
 * shell where a guard would live — so the day a guard is added, it wraps the
 * chrome and the content together instead of sitting above an empty outlet.
 *
 * A layout route's component persists across navigations of its children, so
 * the chrome does not remount on navigation. The provider stack does not move
 * at all: `QueryClientProvider` and `WsProvider` remain on `__root` (see
 * `#/components/layout/providers`), which is what actually keeps `/ws` open.
 *
 * Mounting this on `_authenticated` also means `/` never paints it:
 * `routes/index.tsx` redirects in `beforeLoad`, before any component renders.
 *
 * LAYOUT. From `lg` up the page is a full-height rail on the left and one
 * column on the right; the strip and the ribbon stick to the top of THAT column,
 * not across the rail, so the rail's heavy edge runs unbroken from top to
 * bottom. Below `lg` the rail is gone and a dock takes its place.
 */
export function Shell() {
	return (
		<div className="relative min-h-dvh">
			{/* The desk's ground. Fixed, behind everything, pure CSS: a dot matrix
          that dissolves before it reaches the content, plus a lime bloom where
          live data enters. `-z-10` keeps it under the sticky chrome and the
          content without either of them needing a background of its own. */}
			<div className="field-dots -z-10" aria-hidden />

			<div className="flex">
				<NavRail />

				<div className="min-w-0 flex-1">
					{/* The strip and the ribbon are one sticky group: the ribbon reports
              a live failure, and a strip that scrolls out of view the moment you
              scroll down would defeat the point. Putting the ribbon as a sibling
              of the sticky header would leave it static. */}
					<div className="sticky top-0 z-30">
						<QueueRibbon />
						<Topbar onOpenPalette={openCommandPalette} />
					</div>

					{/*
            Reading-width container. `mx-auto` centres the column in the space
            right of the rail; `w-full` keeps it fluid below the cap.

            `route-in` is the shared entrance. It lives on this single <main>
            rather than inside each view, so every route gets identical motion
            from one declaration — and because the animation is pure CSS on
            mount it starts on the first painted frame, with no JS tick and no
            flash of un-animated content.
          */}
					<main className="route-in launcher-clearance measure mx-auto min-w-0 px-4 pt-8 pb-24 sm:px-8 lg:px-10 lg:pb-8">
						<ErrorBoundary>
							<Outlet />
						</ErrorBoundary>
					</main>
				</div>
			</div>

			<MobileNav />
			<Chatbot />
			<CommandPalette />
		</div>
	)
}
