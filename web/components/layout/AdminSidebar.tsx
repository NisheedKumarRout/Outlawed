"use client";

import {
  BadgeCheck,
  FileCheck2,
  Flag,
  LayoutDashboard,
  LibraryBig,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { OutlawedIndiaBrand } from "@/components/layout/BrandLogo";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/library", label: "Insight library", icon: LibraryBig },
  { href: "/moderation", label: "Proposals", icon: FileCheck2 },
  { href: "/ingestion-queue", label: "Ingestion", icon: ShieldAlert },
  { href: "/verifications", label: "Organizations", icon: BadgeCheck },
  { href: "/knowledge-gaps", label: "Knowledge gaps", icon: TrendingDown },
  { href: "/reports", label: "Reports", icon: Flag },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar admin-sidebar" aria-label="OutLawed administration">
      <OutlawedIndiaBrand className="brand-lockup admin-brand-lockup" />

      <span className="nav-eyebrow">Admin portal</span>
      <nav className="sidebar-nav">
        {links.map(({ href, label, icon: Icon }) => {
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
        })}
      </nav>

      <p className="sidebar-note">
        OutLawed India operator portal · verify organizations and control publication.
      </p>
    </aside>
  );
}
