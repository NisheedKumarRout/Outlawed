import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export function AdminStatCard({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "attention";
}) {
  const body = (
    <>
      <div className="admin-stat-top">
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {hint ? <p>{hint}</p> : null}
    </>
  );

  const className = `admin-stat admin-stat-${tone}`;

  return href ? (
    <Link href={href} className={className}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
