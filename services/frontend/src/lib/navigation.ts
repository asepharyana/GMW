import {
  Headphones,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Mic,
  Music,
  Search,
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
    href: "/analysis",
    label: "Search",
    icon: Search,
    matchPrefix: "/analysis",
  },
];

/**
 * Mobile bottom bar items (subset of primary nav).
 */
export const mobileNavItems: NavItem[] = navItems.filter((item) =>
  ["/dashboard", "/messages", "/voice", "/media"].includes(item.href),
);

export type NavItemId = (typeof navItems)[number]["href"];

export function isActivePath(pathname: string, matchPrefix: string): boolean {
  if (matchPrefix === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(matchPrefix);
}
