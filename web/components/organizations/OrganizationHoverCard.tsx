import { BadgeCheck, BookOpenText, CircleGauge } from "lucide-react";

import { formatCompactNumber } from "@/lib/utils";
import type { OrganizationSummary } from "@/types/insight";

export function OrganizationHoverCard({
  organization,
}: {
  organization: OrganizationSummary;
}) {
  return (
    <span className="org-hover-root" tabIndex={0}>
      <span className="org-name-line">
        <span>{organization.name}</span>
        {organization.verified ? (
          <BadgeCheck className="verified-icon" size={16} aria-label="Verified organization" />
        ) : null}
      </span>

      <span className="org-preview" role="tooltip">
        <span className="org-preview-head">
          <span className="org-avatar">{organization.name.slice(0, 2).toUpperCase()}</span>
          <span>
            <strong>{organization.name}</strong>
            <small>
              {organization.verified ? "Verified by OutLawed India" : "Verification pending"}
            </small>
          </span>
        </span>
        <span className="org-preview-stats">
          <span>
            <BookOpenText size={15} />
            <strong>{formatCompactNumber(organization.publishedInsightCount)}</strong>
            published
          </span>
          <span>
            <CircleGauge size={15} />
            <strong>{organization.usefulPercentage ?? "—"}%</strong>
            useful
          </span>
        </span>
      </span>
    </span>
  );
}
