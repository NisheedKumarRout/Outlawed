"use client";

import {
  Bookmark,
  CircleUserRound,
  Columns3,
  Home,
  PlusSquare,
  Search,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LegalCompassBrand } from "@/components/layout/BrandLogo";
import type { UserRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

const readerLinks = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/compare", label: "Compare", icon: Columns3 },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
];

const organizationLinks = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/compare", label: "Compare", icon: Columns3 },
  { href: "/posts/new", label: "Submit", icon: PlusSquare },
  { href: "/submissions/new", label: "Upload material", icon: Upload },
  { href: "/pinned", label: "Pinned", icon: Bookmark },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
];

export function Sidebar({ role }: { role: UserRole | null }) {
  const pathname = usePathname();

  function navLink({
    href,
    label,
    icon: Icon,
  }: {
    href: string;
    label: string;
    icon: typeof Home;
  }) {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        className={cn("nav-link", active && "nav-link-active")}
        aria-current={active ? "page" : undefined}
      >
        <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <LegalCompassBrand className="brand-lockup" />

      <nav className="sidebar-nav">
        {(role === "org" ? organizationLinks : readerLinks).map(navLink)}
      </nav>

      <p className="sidebar-note">
        {role === "org"
          ? "Organization workspace · submissions require OutLawed approval."
          : "Reader access · browse verified practice knowledge."}
      </p>
    </aside>
  );
}
