import type { FlatComment } from "@/components/comments/CommentThread";
import type { PeerReview } from "@/components/reviews/PeerReviewCard";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

type RawProfile = { display_name: string; role: string } | Array<{ display_name: string; role: string }> | null;

function firstProfile(value: RawProfile) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

type DiscussionSeed = {
  topic: string;
  opening: string;
  practicalStep: string;
  evidenceQuestion: string;
  evidenceReply: string;
  caution: string;
  adaptation: string;
};

function makeDemoDiscussion(postId: string, seed: DiscussionSeed): FlatComment[] {
  const id = (index: number) => `${postId}-demo-${index}`;
  return [
    {
      id: id(1),
      body: seed.opening,
      createdAt: "2026-08-14T09:20:00.000Z",
      parentCommentId: null,
      authorName: "Kavya Shetty",
      authorRole: "Programme manager",
      isAnonymous: false,
      isDeleted: false,
    },
    {
      id: id(2),
      body: seed.practicalStep,
      createdAt: "2026-08-14T12:05:00.000Z",
      parentCommentId: id(1),
      authorName: "Imran Pasha",
      authorRole: "DLSA coordinator",
      isAnonymous: false,
      isDeleted: false,
    },
    {
      id: id(3),
      body: seed.evidenceQuestion,
      createdAt: "2026-08-15T07:40:00.000Z",
      parentCommentId: null,
      authorName: "Dr. Neha Kulkarni",
      authorRole: "Research lead",
      isAnonymous: false,
      isDeleted: false,
    },
    {
      id: id(4),
      body: seed.evidenceReply,
      createdAt: "2026-08-15T11:30:00.000Z",
      parentCommentId: id(3),
      authorName: "Anonymous",
      authorRole: null,
      isAnonymous: true,
      isDeleted: false,
    },
    {
      id: id(5),
      body: seed.caution,
      createdAt: "2026-08-16T08:10:00.000Z",
      parentCommentId: null,
      authorName: "Latha Joseph",
      authorRole: "Training facilitator",
      isAnonymous: false,
      isDeleted: false,
    },
    {
      id: id(6),
      body: seed.adaptation,
      createdAt: "2026-08-17T06:55:00.000Z",
      parentCommentId: null,
      authorName: "Pradeep Kumar",
      authorRole: "Field supervisor",
      isAnonymous: false,
      isDeleted: false,
    },
    {
      id: id(7),
      body: `Could you share the checklist or facilitation note you used for ${seed.topic}? A reusable one-page version would make this much easier to test in another district.`,
      createdAt: "2026-08-17T10:25:00.000Z",
      parentCommentId: id(6),
      authorName: "Sana Mir",
      authorRole: "Legal-aid practitioner",
      isAnonymous: false,
      isDeleted: false,
    },
    {
      id: id(8),
      body: `For reuse, I would record the baseline, the decision that changed, and one follow-up measure for ${seed.topic}. That would keep the insight practical without overstating what the evidence proves.`,
      createdAt: "2026-08-18T09:15:00.000Z",
      parentCommentId: null,
      authorName: "Vivek Rao",
      authorRole: "Monitoring officer",
      isAnonymous: false,
      isDeleted: false,
    },
  ];
}

const DISCUSSION_SEEDS: Record<string, DiscussionSeed> = {
  "54e2479e-4a57-51ff-851c-1f43b5fd546c": {
    topic: "cybercrime referrals",
    opening: "This matches what our district teams are seeing. Cyber-fraud complaints now arrive alongside domestic-violence and entitlement matters, but the referral map is still unclear.",
    practicalStep: "We added a one-page evidence-preservation checklist covering device safety, acknowledgement numbers, and escalation to the cybercrime portal.",
    evidenceQuestion: "Was confidence measured after participants handled a real referral, or immediately after training? That separates workshop confidence from retained practice.",
    evidenceReply: "In our pilot we checked again after six weeks and asked for one anonymised referral example. Confidence fell slightly, but the evidence-preservation steps were still recalled.",
    caution: "Avoid asking survivors to repeatedly forward screenshots. Training must pair referral knowledge with consent, device safety, and minimum-data handling.",
    adaptation: "For our taluk teams we would add the district cyber-cell contact, Kannada screenshots of the portal, and a role-play where the first authority does not respond.",
  },
  "13a31298-0693-53bd-acf4-330098f6dd93": {
    topic: "local-language trust building",
    opening: "The useful shift is naming the earlier police experience instead of treating mistrust as a knowledge deficit. Participation improved once facilitators invited that history into the room.",
    practicalStep: "We used Kannada role-plays with the exact words a PLV could use at the station, followed by a debrief on what to do if acknowledgement is refused.",
    evidenceQuestion: "Was the improvement linked to Kannada delivery, the interactive format, or the presence of a trusted local facilitator? Those conditions should be separated.",
    evidenceReply: "Participants said language mattered most, but the facilitator relationship mattered too. A translated lecture alone did not create the same willingness to practise difficult conversations.",
    caution: "A general message that the system works can invalidate people who have already faced non-response. The route must include escalation after the first failure.",
    adaptation: "We would repeat the scenario three months later and track whether PLVs actually used the DLSA escalation route, not only whether they remembered it.",
  },
  "0227ab25-e9da-5f40-8189-8976126c24cc": {
    topic: "a shared OTR learning repository",
    opening: "A shared repository will be trusted only if contributors can see how an insight moved from raw discussion to reviewed publication. The review trail matters as much as search.",
    practicalStep: "Please preserve failed approaches and changes requested by reviewers. Those details are often removed from reports but are the most useful part for another organization.",
    evidenceQuestion: "What would count as repository use: page views, saved insights, or a documented programme decision that changed after reading one?",
    evidenceReply: "We would count an insight as reused only when a team records what it adapted and why. Search traffic is useful operationally, but it is not evidence of knowledge-to-action.",
    caution: "Do not publish raw workshop discussion as institutional truth. Contributors need redaction, review, and a right to correct how their experience was interpreted.",
    adaptation: "A lightweight quarterly curation meeting could retire outdated guidance, merge duplicates, and ask the original organization whether the conditions still hold.",
  },
  "3375ad11-226e-536b-8c31-fab4b4b242ca": {
    topic: "PLV compensation tracking",
    opening: "The absence of a common compensation record is itself an operational finding. Teams cannot compare delays when each district uses a different category or no register at all.",
    practicalStep: "We started with four fields only: activity date, approved amount, payment date, and reason for delay. That was enough to reveal where the process stalled.",
    evidenceQuestion: "Are the reported differences caused by policy variation, budget release timing, or inconsistent recording? The intervention depends on which explanation is true.",
    evidenceReply: "Our review found all three, but missing records were the largest barrier. We could not responsibly label a district as delayed until the ledger was reconciled.",
    caution: "Publishing district comparisons before validating the underlying records could unfairly blame frontline staff and make future data sharing less likely.",
    adaptation: "I would pilot one shared monthly template with two districts before proposing a statewide dashboard. The definitions need agreement before the software.",
  },
  "315f8b5a-cdd9-5bc5-9ad6-41bbf401972f": {
    topic: "formal recognition of PLV practice",
    opening: "Changing officials’ perception of PLVs is valuable, but it only becomes institutional when a routine or decision right changes after the training.",
    practicalStep: "One district added PLVs to the weekly referral review and named a staff contact for escalations. That small process change was more durable than the workshop pledge.",
    evidenceQuestion: "Which observable practice changed after officials reported greater confidence in PLVs? Attitude data alone cannot show whether access improved.",
    evidenceReply: "We saw more invitations to case-review meetings, but not a consistent rise in formal referrals. The insight should therefore claim a relationship shift, not system-wide integration.",
    caution: "Do not make individual PLVs dependent on one supportive officer. Staff transfers can erase progress unless the practice is written into the district routine.",
    adaptation: "We would pair the dialogue with a 90-day action sheet naming the responsible officer, the PLV role, and the review date for each promised change.",
  },
  "9a08cf2e-6620-515c-a387-0f0f908f98be": {
    topic: "strategic PLV deployment",
    opening: "This explains why good outcomes disappear when one coordinator moves. Deployment decisions are being carried in a person’s memory rather than in a shared operating process.",
    practicalStep: "A simple coverage map of court, police-station, prison, and community touchpoints helped us see where PLVs were duplicated and where nobody was assigned.",
    evidenceQuestion: "What minimum information is needed to move from ad-hoc placement to strategy without creating a reporting burden that PLVs cannot maintain?",
    evidenceReply: "We used location, language, availability, referral volume, and supervisor. Anything more detailed was rarely updated and quickly became misleading.",
    caution: "A deployment matrix can look efficient while ignoring safety, travel time, caste dynamics, disability access, and the trust a PLV has already built locally.",
    adaptation: "We would review the map with PLVs themselves every quarter rather than treating it as a management-only allocation exercise.",
  },
  "2aea9e01-a1b2-5492-b230-5301fc13308c": {
    topic: "PLV workload and role clarity",
    opening: "Layering PLV duties onto ASHA, Anganwadi, and teaching work makes the programme depend on invisible labour. Recognition without workload adjustment is not enough.",
    practicalStep: "Our coordinators now ask what existing duty will be paused before assigning a new PLV task. That one question exposes when the plan assumes unlimited availability.",
    evidenceQuestion: "Was workload measured in hours, missed primary-job duties, or emotional burden? Each would lead to a different safeguard.",
    evidenceReply: "We captured weekly hours and missed duties, then added a short wellbeing check. The interviews showed that unpredictable calls were more disruptive than total hours alone.",
    caution: "Role-clarity documents can shift responsibility onto PLVs without giving them authority, supervision, transport, or a route to decline unsafe assignments.",
    adaptation: "I would co-design a role boundary with workers and supervisors, including tasks that are explicitly out of scope and how urgent referrals are handed over.",
  },
  "f146ee41-6985-5759-b675-2d8303fa671c": {
    topic: "tenure-sensitive PLV training",
    opening: "Separating new and experienced PLVs is important because the same exercise can feel intimidating to one group and repetitive to the other.",
    practicalStep: "We paired a short shared foundation with two breakouts: supported scenario practice for new PLVs and case reflection plus mentoring skills for experienced PLVs.",
    evidenceQuestion: "Did participants choose their track, or were they assigned by years of service? Tenure alone may not reflect confidence or case exposure.",
    evidenceReply: "Self-selection worked better. Several long-tenured PLVs chose the foundation track, while newer volunteers with prior community work chose advanced scenarios.",
    caution: "Calling one group advanced can create hierarchy. Frame the tracks around current learning needs and let participants move without explanation.",
    adaptation: "We would begin with a private confidence-and-exposure check, then build mixed pairs later so experience travels without dominating the room.",
  },
};

const CASE_DISCUSSIONS = Object.fromEntries(
  Object.entries(DISCUSSION_SEEDS).map(([postId, seed]) => [postId, makeDemoDiscussion(postId, seed)]),
) as Record<string, FlatComment[]>;

export async function getPostComments(postId: string): Promise<FlatComment[]> {
  const caseComments = CASE_DISCUSSIONS[postId] ?? [];
  if (!hasSupabasePublicEnv()) return caseComments;

  const supabase = await createClient();
  // Flagged comments are withheld from the thread; deleted ones are kept as
  // tombstones so replies underneath them still have somewhere to hang.
  const primary = await supabase
    .from("comments")
    .select("id, body, created_at, parent_comment_id, is_deleted, is_anonymous, author:profiles(display_name, role)")
    .eq("post_id", postId)
    .eq("flagged", false)
    .order("created_at", { ascending: true });

  let data: unknown = primary.data;
  let error: { message: string } | null = primary.error;

  // The discussion stays readable while the additive privacy migration is
  // being applied; anonymous posting itself is enabled only after it exists.
  if (error?.message.includes("is_anonymous")) {
    const fallback = await supabase
      .from("comments")
      .select("id, body, created_at, parent_comment_id, is_deleted, author:profiles(display_name, role)")
      .eq("post_id", postId)
      .eq("flagged", false)
      .order("created_at", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) return caseComments;

  const storedComments = (data as Array<{
    id: string;
    body: string;
    created_at: string;
    parent_comment_id: string | null;
    is_deleted: boolean;
    is_anonymous?: boolean;
    author: RawProfile;
  }>).map((row) => {
    const author = firstProfile(row.author as RawProfile);
    const isAnonymous = Boolean(row.is_anonymous);
    return {
      id: row.id as string,
      body: row.is_deleted ? "[removed by a moderator]" : (row.body as string),
      createdAt: row.created_at as string,
      parentCommentId: (row.parent_comment_id as string | null) ?? null,
      authorName: isAnonymous ? "Anonymous" : author?.display_name ?? "Member",
      authorRole: isAnonymous ? null : author?.role ?? null,
      isAnonymous,
      isDeleted: Boolean(row.is_deleted),
    };
  });

  return [...caseComments, ...storedComments];
}

export async function getPeerReviews(postId: string): Promise<PeerReview[]> {
  if (!hasSupabasePublicEnv()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("peer_reviews")
    .select(
      "id, strength, concern, missing_context, risk, recommendation, created_at, reviewer:profiles(display_name, role)",
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const reviewer = firstProfile(row.reviewer as RawProfile);
    return {
      id: row.id as string,
      strength: (row.strength as string | null) ?? null,
      concern: (row.concern as string | null) ?? null,
      missingContext: (row.missing_context as string | null) ?? null,
      risk: (row.risk as string | null) ?? null,
      recommendation: (row.recommendation as string | null) ?? null,
      createdAt: row.created_at as string,
      reviewerName: reviewer?.display_name ?? "Peer reviewer",
    };
  });
}

export type FeedbackSummary = {
  usefulCount: number;
  somewhatUsefulCount: number;
  notUsefulCount: number;
  totalCount: number;
};

export async function getFeedbackSummary(postId: string): Promise<FeedbackSummary> {
  const empty = { usefulCount: 0, somewhatUsefulCount: 0, notUsefulCount: 0, totalCount: 0 };
  if (!hasSupabasePublicEnv()) return empty;

  const supabase = await createClient();
  // Aggregates come from the view, which runs as its owner — counts are public
  // while individual ratings stay private to their author.
  const { data } = await supabase
    .from("post_feedback_summary")
    .select("useful_count, somewhat_useful_count, not_useful_count, total_count")
    .eq("post_id", postId)
    .maybeSingle();

  if (!data) return empty;

  return {
    usefulCount: Number(data.useful_count ?? 0),
    somewhatUsefulCount: Number(data.somewhat_useful_count ?? 0),
    notUsefulCount: Number(data.not_useful_count ?? 0),
    totalCount: Number(data.total_count ?? 0),
  };
}

export type FeedbackValue = "useful" | "somewhat_useful" | "not_useful";

export async function getViewerFeedback(postId: string): Promise<FeedbackValue | null> {
  if (!hasSupabasePublicEnv()) return null;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("post_feedback")
    .select("value")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data?.value as FeedbackValue | undefined) ?? null;
}

export async function isPinned(postId: string): Promise<boolean> {
  if (!hasSupabasePublicEnv()) return false;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return false;

  const { data } = await supabase
    .from("pins")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}
