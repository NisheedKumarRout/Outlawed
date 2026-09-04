import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export function WhatWorkedFailedPanel({
  whatWorked,
  whatFailed,
  caution,
  compact = false,
}: {
  whatWorked: string | null;
  whatFailed: string | null;
  caution: string | null;
  compact?: boolean;
}) {
  const blocks = [
    {
      label: "What worked",
      value: whatWorked,
      tone: "worked",
      icon: CheckCircle2,
    },
    {
      label: "What failed",
      value: whatFailed,
      tone: "failed",
      icon: XCircle,
    },
    {
      label: "Caution",
      value: caution,
      tone: "caution",
      icon: AlertTriangle,
    },
  ].filter((block): block is typeof block & { value: string } => Boolean(block.value));

  if (!blocks.length) return null;

  return (
    <div className={cn("outcome-grid", compact && "outcome-grid-compact")}> 
      {blocks.map(({ label, value, tone, icon: Icon }) => (
        <section className={cn("outcome-block", `outcome-${tone}`)} key={label}>
          <header>
            <Icon size={17} strokeWidth={2.1} />
            <h3>{label}</h3>
          </header>
          <p>{value}</p>
        </section>
      ))}
    </div>
  );
}
