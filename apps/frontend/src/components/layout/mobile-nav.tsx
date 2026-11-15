import { Link, useLocation } from "@tanstack/react-router"
import { cn } from "cn"
import { navItems } from "#/libs/navigation"

/**
 * Mobile bottom dock.
 *
 * Requirements, not accidents:
 *
 *  1. It lists EVERY destination in `navItems` — a partial dock made pages
 *     unreachable on a phone.
 *  2. Every destination is reachable WITHOUT a horizontal scroll.
 *
 * The dock was built for seven destinations, split by weight: the four an
 * operator checks constantly sat on the bar and the three reference surfaces
 * moved into a "More" sheet. Channels, Users, Analysis and Glossary have since
 * been removed, leaving three — they all fit, so the sheet is gone and the bar
 * sizes itself to what is there. The split is still derived from `navItems` and
 * PRIMARY rather than hardcoded twice, so a fourth route re-introduces the
 * sheet with no other edit: anything not in PRIMARY lands in it automatically.
 *
 * Dressed like the desktop rail: a heavy top rule, a mono index, and a lime
 * block for the active destination, so "you are here" is one shape across
 * breakpoints.
 */

/** Tabs that always sit on the bar. */
const PRIMARY = new Set(["/dashboard", "/messages", "/moderation"])

export function MobileNav() {
	const { pathname } = useLocation()
	const normalized = pathname.replace(/\/+$/, "") || "/"

	const primary = navItems.filter((item) => PRIMARY.has(item.href))
	const overflow = navItems.filter((item) => !PRIMARY.has(item.href))
	const overflowActive = overflow.some((item) => item.href === normalized)

	return (
		<nav
			className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-canvas/95 backdrop-blur-md lg:hidden"
			aria-label="Primary"
		>
			<ul
				className={cn(
					"grid divide-x divide-hairline",
					overflow.length > 0 ? "grid-cols-5" : "grid-cols-3",
				)}
			>
				{primary.map((item, index) => {
					const active = item.href === normalized
					return (
						<li key={item.href}>
							<Link
								to={item.href}
								aria-current={active ? "page" : undefined}
								className={cn(
									"nav-dock-item flex min-w-0 flex-col items-start gap-0.5 px-3 py-2 transition-colors",
									active
										? "bg-lime text-lime-ink"
										: "text-ink-soft hover:bg-surface-2",
								)}
							>
								<span
									className={cn(
										"font-mono text-micro tracking-widest",
										active ? "text-lime-ink" : "text-ink-faint",
									)}
									aria-hidden
								>
									{String(index + 1).padStart(2, "0")}
								</span>
								<span className="w-full truncate text-micro-lg font-bold tracking-wider uppercase">
									{item.shortLabel}
								</span>
							</Link>
						</li>
					)
				})}

				{overflow.length > 0 && (
					<li>
						{/*
            A <details> disclosure rather than a stateful popover: it opens and
            closes with no JS state, stays keyboard- and screen-reader-accessible
            for free, and cannot be left stranded open behind a route change.
          */}
						<details className="group/more relative">
							<summary
								className={cn(
									"nav-dock-item flex min-w-0 cursor-pointer list-none flex-col items-start gap-0.5 px-3 py-2 text-micro-lg font-bold tracking-wider uppercase transition-colors [&::-webkit-details-marker]:hidden",
									overflowActive
										? "bg-lime text-lime-ink"
										: "text-ink-soft hover:bg-surface-2",
								)}
							>
								More
							</summary>

							<ul className="glass absolute right-0 bottom-full mb-1 w-44 overflow-hidden p-1">
								{overflow.map((item) => {
									const active = item.href === normalized
									return (
										<li key={item.href}>
											<Link
												to={item.href}
												aria-current={active ? "page" : undefined}
												className={cn(
													// `min-h-11` for the same 44px reason as the dock items
													// themselves. These rows are the ONLY route to the
													// overflow sections on a phone, so they are the least
													// forgiving targets in the app.
													"block min-h-11 truncate rounded-sm px-2 py-2 text-micro-lg transition-colors",
													active
														? "bg-lime text-lime-ink"
														: "text-ink-soft hover:bg-accent hover:text-accent-foreground",
												)}
											>
												{item.label}
											</Link>
										</li>
									)
								})}
							</ul>
						</details>
					</li>
				)}
			</ul>
			{/* Keeps the bar clear of the iOS home indicator. */}
			<div className="bottom-safe-nav-rail" aria-hidden />
		</nav>
	)
}
