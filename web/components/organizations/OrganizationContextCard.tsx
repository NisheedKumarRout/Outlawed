import { BookOpenText, CircleGauge } from "lucide-react";

import { OrganizationHoverCard } from "@/components/organizations/OrganizationHoverCard";
import { Badge } from "@/components/ui/Badge";
import { formatCompactNumber } from "@/lib/utils";
import type { OrganizationSummary } from "@/types/insight";

export function OrganizationContextCard({
  organization,
}: {
  organization: OrganizationSummary;
}) {
  return (
    <div className="context-card org-context-card" aria-label="Authoring organization">
        <span className="page-eyebrow">Authoring organization</span>
        <div className="org-context-title">
          <span className="org-avatar org-avatar-large">
            {organization.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h2><OrganizationHoverCard organization={organization} /></h2>
            <span className="verified-text">
              {organization.verified ? "Verified by OutLawed India" : "Verification pending"}
            </span>
          </div>
        </div>
        {organization.description ? <p>{organization.description}</p> : null}
        <div className="org-sector-list">
          {organization.sectors.map((sector) => (
            <Badge key={sector}>{sector}</Badge>
          ))}
        </div>
        <div className="org-context-stats">
          <span>
            <BookOpenText size={18} />
            <strong>{formatCompactNumber(organization.publishedInsightCount)}</strong>
            <small>Published</small>
          </span>
          <span>
            <CircleGauge size={18} />
            <strong>{organization.usefulPercentage ?? "—"}%</strong>
            <small>Useful</small>
          </span>
        </div>
    </div>
  );
}
