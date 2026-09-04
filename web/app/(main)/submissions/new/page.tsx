import type { Metadata } from "next";
import Link from "next/link";

import { SectionShell } from "@/components/layout/SectionShell";
import { RawUploadForm } from "@/components/submissions/RawUploadForm";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Upload raw material" };

export default async function NewSubmissionPage() {
  if (!hasSupabasePublicEnv()) {
    return (
      <SectionShell
        eyebrow="Secure ingestion"
        title="Upload raw session material"
        description="Supabase must be connected before uploads can be accepted."
      >
        <div className="quiet-state">
          <h2>Connect Supabase to continue</h2>
          <p>Add the project URL and publishable key to web/.env.local.</p>
        </div>
      </SectionShell>
    );
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const { data: profile } = userId
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle()
    : { data: null };
  const { data: organization } = userId
    ? await supabase
        .from("organizations")
        .select("org_name,verified")
        .eq("id", userId)
        .maybeSingle()
    : { data: null };

  if (profile?.role === "admin") {
    return (
      <SectionShell
        eyebrow="Secure ingestion"
        title="Organization upload only"
        description="OutLawed India reviews redacted uploads but does not submit organization material."
      >
        <div className="quiet-state">
          <h2>You are signed in as the platform administrator</h2>
          <p>
            Sign in with a verified organization account to upload a PDF. Admins can
            review completed and failed redactions in the <Link href="/ingestion-queue">ingestion queue</Link>.
          </p>
        </div>
      </SectionShell>
    );
  }

  if (!userId || !organization?.verified) {
    return (
      <SectionShell
        eyebrow="Secure ingestion"
        title="Verification required"
        description="Only verified organizations can upload raw session material."
      >
        <div className="quiet-state">
          <h2>Your organization is still pending verification</h2>
          <p>
            OutLawed India must approve the organization before raw uploads become
            available. <Link href="/org-application">Apply for verification</Link>.
          </p>
        </div>
      </SectionShell>
    );
  }

  const { data: previous } = await supabase
    .from("raw_submissions_review")
    .select("id, original_filename, redaction_status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <SectionShell
      eyebrow={organization.org_name}
      title="Upload raw session material"
      description="Session notes, a transcript, or a slide deck. It is redacted before anyone reviews it."
    >
      <RawUploadForm />

      {previous?.length ? (
        <section className="submission-history">
          <h3>Your recent uploads</h3>
          <ul>
            {previous.map((row) => (
              <li key={row.id as string}>
                <Link href={`/submissions/${row.id}`}>
                  {(row.original_filename as string) ?? "Untitled upload"}
                </Link>
                <span className={`status-label status-${row.redaction_status}`}>
                  {String(row.redaction_status).replace(/_/g, " ")}
                </span>
                <time>{new Date(row.created_at as string).toLocaleDateString("en-IN")}</time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </SectionShell>
  );
}
