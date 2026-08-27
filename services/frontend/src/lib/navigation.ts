import {
  Headphones,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Mic,
  Music,
  Search,
  Shield,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The pathname prefix that indicates this item is active */
  matchPrefix: string;
}

/**
 * Primary navigation items shown in the sidebar.
 */
export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    matchPrefix: "/dashboard",
  },
  {
    href: "/messages",
    label: "Messages",
    icon: MessageSquare,
    matchPrefix: "/messages",
  },
  {
    href: "/voice",
    label: "Voice",
    icon: Mic,
    matchPrefix: "/voice",
  },
  {
    href: "/media",
    label: "Media",
    icon: Music,
    matchPrefix: "/media",
  },
  {
    href: "/recordings",
    label: "Recordings",
    icon: Headphones,
    matchPrefix: "/recordings",
  },
  {
    href: "/moderation",
    label: "Moderation",
    icon: Shield,
    matchPrefix: "/moderation",
  },
  {
    href: "/analysis",
    label: "Search",
    icon: Search,
    matchPrefix: "/analysis",
  },
];

/**
 * Mobile bottom bar items. Mirrors the FULL desktop sidebar (all primary nav
 * items) so every page is reachable on mobile; the bar scrolls horizontally on
 * narrow screens (see MobileNav).
 */
export const mobileNavItems: NavItem[] = navItems;

export type NavItemId = (typeof navItems)[number]["href"];

export function isActivePath(pathname: string, matchPrefix: string): boolean {
  // trailingSlash builds surface "/x/" via usePathname — normalize first.
  const path = pathname.replace(/\/+$/, "") || "/";
  if (matchPrefix === "/dashboard") return path === "/dashboard";
  return path.startsWith(matchPrefix);
}
