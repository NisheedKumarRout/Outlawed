import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SectionShell } from "@/components/layout/SectionShell";
import { PostCard } from "@/components/posts/PostCard";
import { Badge } from "@/components/ui/Badge";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";
import type { InsightPost } from "@/types/insight";

type PageProps = { params: Promise<{ id: string }> };

const SEEDED_CASE_IMAGES: Record<string, string> = {
  "Cybercrime Awareness Is Missing From Standard PLV Training": "/case-images/cybercrime-training.webp",
  "Long-Tenured PLVs Want Validation, New PLVs Want Courage": "/case-images/plv-tenure-workshop.webp",
  "Interactive, Local-Language Training Reduced Fear of Police Non-Response": "/case-images/local-language-training.webp",
  "A Shared Repository Was the Ecosystem's Own Idea": "/case-images/peer-review-session.webp",
  "Confusion Regarding Funds: What Districts Don't Track": "/case-images/district-funding-review.webp",
  "Bridging the Formal and the Informal": "/case-images/formal-informal-bridge.webp",
  "Deployment Without a System: Why PLV Impact Depends on One Person": "/case-images/plv-field-deployment.webp",
  "The Identity Crisis of PLVs": "/case-images/plv-identity-workers.webp",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!hasSupabasePublicEnv()) return { title: "Organization" };
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("org_name")
    .eq("id", id)
    .maybeSingle();
  return { title: (data?.org_name as string) ?? "Organization" };
}

export default async function OrganizationPage({ params }: PageProps) {
  if (!hasSupabasePublicEnv()) notFound();

  const { id } = await params;
  const supabase = await createClient();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, org_name, description, website, sectors, verified, published_insight_count, useful_percentage")
    .eq("id", id)
    .maybeSingle();

  if (!organization) notFound();

  // No status filter: RLS returns approved insights to everyone, plus this
  // org's own unpublished ones when the org itself is viewing.
  const primaryPosts = await supabase
    .from("posts")
    .select(
      "id, title, problem, context, approach, evidence_outcome, what_worked, what_failed, " +
        "why_worked_or_failed, conditions, cautions, would_do_differently, key_takeaway, " +
        "tldr, tags, sector, target_group, geography, is_anonymous, created_at",
    )
    .eq("org_id", id)
    .eq("is_anonymous", false)
    .order("created_at", { ascending: false });

  let rows: unknown = primaryPosts.data;
  if (primaryPosts.error?.message.includes("is_anonymous")) {
    const fallbackPosts = await supabase
      .from("posts")
      .select(
        "id, title, problem, context, approach, evidence_outcome, what_worked, what_failed, " +
          "why_worked_or_failed, conditions, cautions, would_do_differently, key_takeaway, " +
          "tldr, tags, sector, target_group, geography, created_at",
      )
      .eq("org_id", id)
      .order("created_at", { ascending: false });
    rows = fallbackPosts.data;
  }

  const organizationSummary = {
    id: organization.id as string,
    name: organization.org_name as string,
    description: (organization.description as string | null) ?? null,
    verified: Boolean(organization.verified),
    sectors: (organization.sectors as string[]) ?? [],
    publishedInsightCount: Number(organization.published_insight_count ?? 0),
    usefulPercentage:
      organization.useful_percentage === null ? null : Number(organization.useful_percentage),
  };

  // The Supabase client is untyped until database.types.ts is generated, so
  // select() widens to a union with its error shape. Same cast as lib/data/posts.ts.
  const postRows = (rows ?? []) as Array<Record<string, unknown>>;

  const posts: InsightPost[] = postRows.map((row) => ({
    id: row.id as string,
    isAnonymous: false,
    title: row.title as string,
    problem: row.problem as string,
    context: row.context as string,
    approach: row.approach as string,
    evidenceOutcome: row.evidence_outcome as string,
    whatWorked: (row.what_worked as string | null) ?? null,
    whatFailed: (row.what_failed as string | null) ?? null,
    whyWorkedOrFailed: (row.why_worked_or_failed as string | null) ?? null,
    conditions: (row.conditions as string | null) ?? null,
    cautions: (row.cautions as string | null) ?? null,
    wouldDoDifferently: (row.would_do_differently as string | null) ?? null,
    keyTakeaway: row.key_takeaway as string,
    tldr: (row.tldr as string | null) ?? null,
    imageUrl: SEEDED_CASE_IMAGES[row.title as string] ?? null,
    tags: (row.tags as string[]) ?? [],
    sectors: (row.sector as string[]) ?? [],
    targetGroups: (row.target_group as string[]) ?? [],
    geography: (row.geography as string | null) ?? null,
    createdAt: row.created_at as string,
    usefulCount: 0,
    commentCount: 0,
    organization: organizationSummary,
  }));

  return (
    <SectionShell
      eyebrow={organizationSummary.verified ? "Verified organization" : "Organization"}
      title={organizationSummary.name}
      description={organizationSummary.description ?? "Practice insights contributed to OTR."}
    >
      <div className="org-profile-meta">
        {organizationSummary.sectors.map((sector) => (
          <Badge key={sector}>{sector}</Badge>
        ))}
        {organization.website ? (
          <a href={organization.website as string} rel="noreferrer noopener" target="_blank">
            {organization.website as string}
          </a>
        ) : null}
      </div>

      {posts.length ? (
        <div className="feed-list">
          {posts.map((post) => <PostCard post={post} key={post.id} />)}
        </div>
      ) : (
        <div className="quiet-state">
          <h2>No published insights yet</h2>
          <p>This organization has not had a submission approved so far.</p>
        </div>
      )}
    </SectionShell>
  );
}
