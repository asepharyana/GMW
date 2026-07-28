import {
  LayoutDashboard,
  MessageSquare,
  Mic,
  Headphones,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavItemWithMatch extends NavItem {
  matchPrefix: string;
}

export const navItems: NavItemWithMatch[] = [
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
    href: "/recordings",
    label: "Recordings",
    icon: Headphones,
    matchPrefix: "/recordings",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    matchPrefix: "/settings",
  },
];

export const mobileNavItems: NavItemWithMatch[] = navItems.filter((item) =>
  ["/dashboard", "/messages", "/voice", "/recordings"].includes(item.href),
);

export function isActivePath(
  pathname: string,
  matchPrefix: string,
): boolean {
  if (matchPrefix === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(matchPrefix);
}
