"use client";

import { BadgeCheck, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export type VerificationRequestRow = {
  id: string;
  profileId: string;
  requestType: "organization" | "peer_reviewer";
  displayName: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

/**
 * Manual verification is the trust mechanic the whole platform rests on —
 * nothing here is automated, by design.
 *
 * Approving an organization flips organizations.verified, which is what the
 * is_verified_org() RLS predicate checks before allowing any post insert.
 * Approving a reviewer sets profiles.role and reviewer_status, which is what
 * is_verified_reviewer() checks. Both writes are blocked for non-admins by the
 * privilege-guard triggers, so this UI only works for a real admin session.
 */
export function VerificationQueue({ initialRows }: { initialRows: VerificationRequestRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(row: VerificationRequestRow, approve: boolean) {
    setBusyId(row.id);
    setError(null);

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("Your admin session has expired.");
      setBusyId(null);
      return;
    }

    const { error: requestError } = await supabase
      .from("verification_requests")
      .update({
        status: approve ? "verified" : "rejected",
        reviewed_by: userData.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (requestError) {
      setError("The decision could not be saved.");
      setBusyId(null);
      return;
    }

    if (approve && row.requestType === "organization") {
      const orgName =
        (row.payload.org_name as string | undefined) ?? row.displayName ?? "Organization";

      // Upsert: the organizations row may not exist yet if the applicant never
      // completed a profile, and it must exist before verified can mean anything.
      const { error: orgError } = await supabase.from("organizations").upsert({
        id: row.profileId,
        org_name: orgName,
        description: (row.payload.description as string | undefined) ?? null,
        verified: true,
        verified_at: new Date().toISOString(),
      });

      if (!orgError) {
        await supabase.from("profiles").update({ role: "org" }).eq("id", row.profileId);
      } else {
        setError("The organization record could not be updated.");
        setBusyId(null);
        return;
      }
    }

    if (approve && row.requestType === "peer_reviewer") {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role: "reviewer", reviewer_status: "verified" })
        .eq("id", row.profileId);

      if (profileError) {
        setError("The reviewer could not be credentialed.");
        setBusyId(null);
        return;
      }
    }

    setRows((current) => current.filter((item) => item.id !== row.id));
    setBusyId(null);
    router.refresh();
  }

  if (!rows.length) {
    return (
      <div className="quiet-state">
        <BadgeCheck size={28} aria-hidden="true" />
        <h2>No applications waiting</h2>
        <p>Organization partnership and peer reviewer applications appear here.</p>
      </div>
    );
  }

  return (
    <div className="verification-list">
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {rows.map((row) => (
        <article className="verification-row" key={row.id}>
          <div className="verification-row-meta">
            <span className="status-label status-pending">
              {row.requestType === "organization" ? "Organization" : "Peer reviewer"}
            </span>
            <time>{new Date(row.createdAt).toLocaleDateString("en-IN")}</time>
          </div>

          <h2>{(row.payload.org_name as string | undefined) ?? row.displayName}</h2>

          {Object.entries(row.payload)
            .filter(([key]) => key !== "org_name")
            .map(([key, value]) => (
              <p key={key} className="verification-field">
                <strong>{key.replace(/_/g, " ")}</strong>
                <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
              </p>
            ))}

          <div className="verification-actions">
            <Button type="button" onClick={() => void decide(row, true)} disabled={busyId === row.id}>
              <Check size={15} aria-hidden="true" /> Verify
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void decide(row, false)}
              disabled={busyId === row.id}
            >
              <X size={15} aria-hidden="true" /> Reject
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
