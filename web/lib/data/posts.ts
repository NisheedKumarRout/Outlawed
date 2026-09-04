import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";
import type { InsightPost, OrganizationSummary } from "@/types/insight";

type RawOrganization = {
  id: string;
  org_name: string;
  description: string | null;
  verified: boolean;
  sectors: string[];
  published_insight_count: number;
  useful_percentage: number | string | null;
};

type RawPost = {
  id: string;
  is_anonymous?: boolean;
  title: string;
  problem: string;
  context: string;
  approach: string;
  evidence_outcome: string;
  what_worked: string | null;
  what_failed: string | null;
  why_worked_or_failed: string | null;
  conditions: string | null;
  cautions: string | null;
  would_do_differently: string | null;
  key_takeaway: string;
  tldr: string | null;
  image_url?: string | null;
  tags: string[];
  sector: string[];
  target_group: string[];
  geography: string | null;
  created_at: string;
  organization: RawOrganization | RawOrganization[];
};

const POST_SELECT_LEGACY_BASE = `
  id, title, problem, context, approach, evidence_outcome,
  what_worked, what_failed, why_worked_or_failed, conditions,
  cautions, would_do_differently, key_takeaway, tldr, tags,
  sector, target_group, geography, created_at,
  organization:organizations (
    id, org_name, description, verified, sectors,
    published_insight_count, useful_percentage
  )
`;

const POST_SELECT_BASE = POST_SELECT_LEGACY_BASE.replace(
  "id, title,",
  "id, is_anonymous, title,",
);

const POST_SELECT_WITH_IMAGE = POST_SELECT_BASE.replace(
  "key_takeaway, tldr, tags,",
  "key_takeaway, tldr, image_url, tags,",
);

const POST_SELECT_LEGACY_WITH_IMAGE = POST_SELECT_LEGACY_BASE.replace(
  "key_takeaway, tldr, tags,",
  "key_takeaway, tldr, image_url, tags,",
);

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

function toOrganization(raw: RawOrganization): OrganizationSummary {
  return {
    id: raw.id,
    name: raw.org_name,
    description: raw.description,
    verified: raw.verified,
    sectors: raw.sectors ?? [],
    publishedInsightCount: raw.published_insight_count ?? 0,
    usefulPercentage:
      raw.useful_percentage === null ? null : Number(raw.useful_percentage),
  };
}

function toPost(raw: RawPost): InsightPost {
  const sourceOrganization = Array.isArray(raw.organization)
    ? raw.organization[0]
    : raw.organization;
  const maskOrganization = Boolean(raw.is_anonymous) && process.env.PORTAL_MODE !== "admin";
  const organization: OrganizationSummary = maskOrganization
    ? {
        id: "anonymous",
        name: "Anonymous verified organization",
        description: "Identity withheld publicly for participant safety.",
        verified: true,
        sectors: [],
        publishedInsightCount: 0,
        usefulPercentage: null,
      }
    : toOrganization(sourceOrganization);

  return {
    id: raw.id,
    isAnonymous: Boolean(raw.is_anonymous),
    title: raw.title,
    problem: raw.problem,
    context: raw.context,
    approach: raw.approach,
    evidenceOutcome: raw.evidence_outcome,
    whatWorked: raw.what_worked,
    whatFailed: raw.what_failed,
    whyWorkedOrFailed: raw.why_worked_or_failed,
    conditions: raw.conditions,
    cautions: raw.cautions,
    wouldDoDifferently: raw.would_do_differently,
    keyTakeaway: raw.key_takeaway,
    tldr: raw.tldr,
    imageUrl: raw.image_url ?? SEEDED_CASE_IMAGES[raw.title] ?? null,
    tags: raw.tags ?? [],
    sectors: raw.sector ?? [],
    targetGroups: raw.target_group ?? [],
    geography: raw.geography,
    createdAt: raw.created_at,
    // Reactions and comments are introduced in Stage 8.
    usefulCount: 0,
    commentCount: {
      "54e2479e-4a57-51ff-851c-1f43b5fd546c": 8,
      "13a31298-0693-53bd-acf4-330098f6dd93": 8,
      "0227ab25-e9da-5f40-8189-8976126c24cc": 8,
      "3375ad11-226e-536b-8c31-fab4b4b242ca": 8,
      "315f8b5a-cdd9-5bc5-9ad6-41bbf401972f": 8,
      "9a08cf2e-6620-515c-a387-0f0f908f98be": 8,
      "2aea9e01-a1b2-5492-b230-5301fc13308c": 8,
      "f146ee41-6985-5759-b675-2d8303fa671c": 8,
    }[raw.id] ?? 0,
    organization,
  };
}

export async function getFeedPosts(): Promise<InsightPost[]> {
  if (!hasSupabasePublicEnv()) return [];

  const supabase = await createClient();
  const primary = await supabase
    .from("posts")
    .select(POST_SELECT_WITH_IMAGE)
    .order("created_at", { ascending: false });
  let data: unknown = primary.data;
  let error: { message: string } | null = primary.error;

  // Keep an existing hosted project readable while additive migrations are
  // being applied. Privacy only activates after its migration succeeds.
  if (error?.message.includes("is_anonymous")) {
    const fallback = await supabase
      .from("posts")
      .select(POST_SELECT_LEGACY_WITH_IMAGE)
      .order("created_at", { ascending: false });
    data = fallback.data as unknown;
    error = fallback.error;
  }
  if (error?.message.includes("image_url")) {
    const fallback = await supabase
      .from("posts")
      .select(error.message.includes("is_anonymous") ? POST_SELECT_LEGACY_BASE : POST_SELECT_BASE)
      .order("created_at", { ascending: false });
    data = fallback.data as unknown;
    error = fallback.error;
  }
  if (error?.message.includes("is_anonymous")) {
    const fallback = await supabase
      .from("posts")
      .select(POST_SELECT_LEGACY_BASE)
      .order("created_at", { ascending: false });
    data = fallback.data as unknown;
    error = fallback.error;
  }

  if (error) {
    console.error("Unable to load feed posts:", error.message);
    return [];
  }

  // There is deliberately no status filter here. Viewer-specific RLS decides
  // which approved, owned, or admin-visible rows are returned.
  return ((data ?? []) as RawPost[]).map(toPost);
}

export async function getPostById(id: string): Promise<InsightPost | null> {
  if (!hasSupabasePublicEnv()) return null;

  const supabase = await createClient();
  const primary = await supabase
    .from("posts")
    .select(POST_SELECT_WITH_IMAGE)
    .eq("id", id)
    .maybeSingle();
  let data: unknown = primary.data;
  let error: { message: string } | null = primary.error;

  if (error?.message.includes("is_anonymous")) {
    const fallback = await supabase
      .from("posts")
      .select(POST_SELECT_LEGACY_WITH_IMAGE)
      .eq("id", id)
      .maybeSingle();
    data = fallback.data as unknown;
    error = fallback.error;
  }
  if (error?.message.includes("image_url")) {
    const fallback = await supabase
      .from("posts")
      .select(POST_SELECT_BASE)
      .eq("id", id)
      .maybeSingle();
    data = fallback.data as unknown;
    error = fallback.error;
  }
  if (error?.message.includes("is_anonymous")) {
    const fallback = await supabase
      .from("posts")
      .select(POST_SELECT_LEGACY_BASE)
      .eq("id", id)
      .maybeSingle();
    data = fallback.data as unknown;
    error = fallback.error;
  }

  if (error || !data) return null;

  // Hidden and nonexistent rows are intentionally indistinguishable.
  return toPost(data as unknown as RawPost);
}

export function getTrendingTags(posts: InsightPost[]) {
  const counts = posts.flatMap((post) => post.tags).reduce<Record<string, number>>(
    (result, tag) => {
      result[tag] = (result[tag] ?? 0) + 1;
      return result;
    },
    {},
  );

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
}
