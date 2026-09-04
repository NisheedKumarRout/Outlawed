import { SectionShell } from "@/components/layout/SectionShell";
import { OTRSubmissionForm } from "@/components/posts/OTRSubmissionForm";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

type PageProps = { searchParams: Promise<{ submission?: string }> };

export default async function NewPostPage({ searchParams }: PageProps) {
  if (!hasSupabasePublicEnv()) {
    return <SectionShell eyebrow="Organization submission" title="Submit an OTR insight" description="Supabase must be connected before submissions can be created."><div className="quiet-state"><h2>Connect Supabase to continue</h2><p>Add the project URL and publishable key to web/.env.local.</p></div></SectionShell>;
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const { data: organization } = userId
    ? await supabase.from("organizations").select("org_name,verified").eq("id", userId).maybeSingle()
    : { data: null };

  if (!organization?.verified) {
    return <SectionShell eyebrow="Organization submission" title="Verification required" description="Only verified organizations can submit practice insights."><div className="quiet-state"><h2>Your organization is still pending verification</h2><p>OutLawed India must approve the organization before this submission form becomes available.</p></div></SectionShell>;
  }

  // Arriving from the ingestion queue: seed the AI assist box with the
  // redacted text so nobody re-types a transcript by hand. Read through the
  // review view, which has no unredacted columns to hand back.
  const { submission } = await searchParams;
  let initialRawText = "";
  if (submission) {
    const { data } = await supabase
      .from("raw_submissions_review")
      .select("redacted_text")
      .eq("id", submission)
      .maybeSingle();
    initialRawText = (data?.redacted_text as string | null) ?? "";
  }

  return (
    <SectionShell eyebrow="Verified organizations" title="Submit an OTR insight" description="Turn a programme experience into evidence another organization can assess and adapt.">
      <OTRSubmissionForm organizationName={organization.org_name} initialRawText={initialRawText} />
    </SectionShell>
  );
}
