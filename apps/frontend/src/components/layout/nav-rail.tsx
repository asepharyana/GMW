import { Link, useLocation } from "@tanstack/react-router"
import { cn } from "cn"
import { ShieldAlert } from "lucide-react"
import { navItems } from "#/libs/navigation"

/**
 * Desktop navigation rail.
 *
 * Still the plain, familiar vertical rail the project guide asks us to keep — a
 * previous attempt replaced it with a constellation metaphor that shipped green
 * and was then rejected for hurting usability. What changed is the dress, not
 * the behaviour: every destination keeps a visible, horizontal label.
 *
 * What the rail carries from the desk language: a mono index (`01`, `02`, `03`)
 * because there are three destinations and an index tells the reader how many,
 * and a lime block for "you are here". The block survives a monochrome
 * screenshot, which a tint or a thin marker does not.
 *
 * The vertical wordmark at the foot is decoration with a job: it is where the
 * product's full name lives on a screen that otherwise only says "GMW".
 */
export function NavRail() {
	const { pathname } = useLocation()
	const normalized = pathname.replace(/\/+$/, "") || "/"

	return (
		<nav
			className="sticky top-0 hidden h-dvh w-28 shrink-0 flex-col border-r border-rule lg:flex"
			aria-label="Primary"
		>
			<Link
				to="/dashboard"
				className="group flex h-16 items-center gap-2 border-b border-rule px-3"
				aria-label="Guild Moderation Watcher, home"
			>
				<span className="flex size-9 items-center justify-center rounded-sm bg-lime text-lime-ink transition-transform group-hover:-rotate-6">
					<ShieldAlert className="size-5" aria-hidden />
				</span>
				<span className="font-display text-lg leading-none font-extrabold tracking-tighter text-ink">
					GMW
				</span>
			</Link>

			<ul className="flex flex-col">
				{navItems.map((item, index) => {
					const active = item.href === normalized
					return (
						<li key={item.href}>
							<Link
								to={item.href}
								aria-current={active ? "page" : undefined}
								title={item.description}
								className={cn(
									"flex flex-col gap-3 border-b border-hairline px-3 pt-3 pb-4 transition-colors",
									active
										? "bg-lime text-lime-ink"
										: "text-ink-soft hover:bg-surface-2 hover:text-ink",
								)}
							>
								{/* Tabular figures keep the three numbers in a column even
                    though `01` and `03` differ in width. */}
								<span
									className={cn(
										"font-mono text-micro tracking-widest tabular-nums",
										active ? "text-lime-ink" : "text-ink-faint",
									)}
									aria-hidden
								>
									{String(index + 1).padStart(2, "0")}
								</span>
								<span className="text-micro-lg font-bold tracking-wider uppercase">
									{item.label}
								</span>
							</Link>
						</li>
					)
				})}
			</ul>

			<div className="mt-auto flex flex-1 items-end justify-center pb-6">
				<p className="vertical-text field-label">Guild Moderation Watcher</p>
			</div>
		</nav>
	)
}
