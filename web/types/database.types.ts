/**
 * Database types for the OUTLAWED OTR Supabase schema.
 *
 * Hand-authored to match `supabase/schema.sql`. The canonical way to produce
 * this file is:
 *
 *     supabase gen types typescript --project-id <ref> > web/types/database.types.ts
 *
 * which needs Supabase CLI auth. Regenerate with that command after any schema
 * change rather than editing this by hand — and if you do edit it by hand,
 * change `supabase/schema.sql` in the same commit or the two silently drift.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "individual" | "org" | "reviewer" | "admin";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type VerificationType = "organization" | "peer_reviewer";
export type PostStatus = "draft" | "pending" | "approved" | "rejected" | "changes_requested";
export type PostVisibility = "public" | "registered" | "verified_org" | "restricted";
export type FeedbackValue = "useful" | "somewhat_useful" | "not_useful";
export type TargetKind = "post" | "comment";
export type ReportStatus = "open" | "resolved" | "dismissed";
export type SubmissionSource = "session_notes" | "transcript" | "slide_deck" | "other";
export type RedactionStatus = "processing" | "needs_manual_review" | "cleared" | "failed";

type Profile = {
  id: string;
  role: UserRole;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  reviewer_status: VerificationStatus | null;
  created_at: string;
};

type Organization = {
  id: string;
  org_name: string;
  description: string | null;
  website: string | null;
  sectors: string[];
  verified: boolean;
  verified_at: string | null;
  published_insight_count: number;
  useful_percentage: number | null;
  created_at: string;
};

type VerificationRequest = {
  id: string;
  profile_id: string;
  request_type: VerificationType;
  payload: Json;
  status: VerificationStatus;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type Post = {
  id: string;
  org_id: string;
  is_anonymous: boolean;
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
  sector: string[];
  target_group: string[];
  geography: string | null;
  tags: string[];
  tldr: string | null;
  image_url: string | null;
  visibility: PostVisibility;
  status: PostStatus;
  embedding: string | null;
  view_count: number;
  admin_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type PostRevision = {
  id: string;
  post_id: string;
  editor_id: string;
  snapshot: Json;
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_id: string;
  is_anonymous: boolean;
  body: string;
  is_deleted: boolean;
  flagged: boolean;
  created_at: string;
};

type CommentVote = {
  comment_id: string;
  user_id: string;
  value: number;
  created_at: string;
};

type PeerReview = {
  id: string;
  post_id: string;
  reviewer_id: string;
  strength: string | null;
  concern: string | null;
  missing_context: string | null;
  risk: string | null;
  recommendation: string | null;
  created_at: string;
};

type PostFeedbackRow = {
  post_id: string;
  user_id: string;
  value: FeedbackValue;
  created_at: string;
};

type PostTranslation = {
  post_id: string;
  language_code: "kn";
  source_updated_at: string;
  content: Json;
  model: string;
  created_at: string;
  updated_at: string;
};

type Pin = {
  user_id: string;
  post_id: string;
  created_at: string;
};

type SearchLog = {
  id: string;
  user_id: string | null;
  query: string;
  filters: Json | null;
  created_at: string;
};

type Report = {
  id: string;
  target_kind: TargetKind;
  target_id: string;
  reporter_id: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  resolved_by: string | null;
  created_at: string;
};

type RawSubmission = {
  id: string;
  org_id: string;
  source_type: SubmissionSource;
  original_filename: string | null;
  /** service-role only — excluded from the raw_submissions_review view */
  storage_path: string;
  /** service-role only — excluded from the raw_submissions_review view */
  extracted_text: string | null;
  redacted_text: string | null;
  redaction_report: Json | null;
  redaction_status: RedactionStatus;
  redaction_error: string | null;
  linked_post_id: string | null;
  created_at: string;
};

type RagChatLog = {
  id: string;
  post_id: string;
  user_id: string | null;
  question: string;
  answer: string | null;
  created_at: string;
};

/** Insert/Update shapes: server-defaulted columns become optional. */
type Defaulted<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * postgrest-js structurally matches on `Relationships`; omitting the key makes
 * every query resolve to `never`, and leaving it empty makes embedded selects
 * (`author:profiles(...)`) fail to resolve. Only the foreign keys we actually
 * join on are declared below — add an entry when you add an embedded select.
 */
type Rel<
  Name extends string,
  Column extends string,
  Target extends string,
> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Target;
  referencedColumns: ["id"];
};

type Table<Row, Insert = Row, Update = Partial<Row>, Relationships = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Defaulted<Profile, "role" | "avatar_url" | "bio" | "reviewer_status" | "created_at">>;
      organizations: Table<
        Organization,
        Defaulted<
          Organization,
          | "description"
          | "website"
          | "sectors"
          | "verified"
          | "verified_at"
          | "published_insight_count"
          | "useful_percentage"
          | "created_at"
        >
      >;
      verification_requests: Table<
        VerificationRequest,
        Defaulted<VerificationRequest, "id" | "status" | "admin_notes" | "reviewed_by" | "reviewed_at" | "created_at">,
        Partial<VerificationRequest>,
        [Rel<"verification_requests_profile_id_fkey", "profile_id", "profiles">]
      >;
      posts: Table<
        Post,
        Defaulted<
          Post,
          | "id"
          | "is_anonymous"
          | "what_worked"
          | "what_failed"
          | "why_worked_or_failed"
          | "conditions"
          | "cautions"
          | "would_do_differently"
          | "sector"
          | "target_group"
          | "geography"
          | "tags"
          | "tldr"
          | "image_url"
          | "visibility"
          | "status"
          | "embedding"
          | "view_count"
          | "admin_notes"
          | "approved_by"
          | "approved_at"
          | "created_at"
          | "updated_at"
        >,
        Partial<Post>,
        [Rel<"posts_org_id_fkey", "org_id", "organizations">]
      >;
      post_revisions: Table<PostRevision, Defaulted<PostRevision, "id" | "created_at">>;
      comments: Table<
        Comment,
        Defaulted<Comment, "id" | "parent_comment_id" | "is_anonymous" | "is_deleted" | "flagged" | "created_at">,
        Partial<Comment>,
        [Rel<"comments_author_id_fkey", "author_id", "profiles">]
      >;
      comment_votes: Table<CommentVote, Defaulted<CommentVote, "created_at">>;
      peer_reviews: Table<
        PeerReview,
        Defaulted<
          PeerReview,
          "id" | "strength" | "concern" | "missing_context" | "risk" | "recommendation" | "created_at"
        >,
        Partial<PeerReview>,
        [Rel<"peer_reviews_reviewer_id_fkey", "reviewer_id", "profiles">]
      >;
      post_feedback: Table<PostFeedbackRow, Defaulted<PostFeedbackRow, "created_at">>;
      post_translations: Table<
        PostTranslation,
        Defaulted<PostTranslation, "created_at" | "updated_at">
      >;
      pins: Table<Pin, Defaulted<Pin, "created_at">>;
      search_logs: Table<SearchLog, Defaulted<SearchLog, "id" | "user_id" | "filters" | "created_at">>;
      reports: Table<
        Report,
        Defaulted<Report, "id" | "description" | "status" | "resolved_by" | "created_at">
      >;
      raw_submissions: Table<
        RawSubmission,
        Defaulted<
          RawSubmission,
          | "id"
          | "original_filename"
          | "extracted_text"
          | "redacted_text"
          | "redaction_report"
          | "redaction_status"
          | "redaction_error"
          | "linked_post_id"
          | "created_at"
        >
      >;
      rag_chat_logs: Table<RagChatLog, Defaulted<RagChatLog, "id" | "user_id" | "answer" | "created_at">>;
    };
    Views: {
      /**
       * Client-facing projection of raw_submissions. Deliberately has no
       * storage_path or extracted_text column — RLS is row-level, so the view
       * is what keeps unredacted material out of every client query.
       */
      raw_submissions_review: {
        Row: Omit<RawSubmission, "storage_path" | "extracted_text">;
        Relationships: [];
      };
      /** Aggregate feedback counts. Individual ratings stay private. */
      post_feedback_summary: {
        Row: {
          post_id: string;
          useful_count: number;
          somewhat_useful_count: number;
          not_useful_count: number;
          total_count: number;
        };
        Relationships: [];
      };
      knowledge_gap_summary: {
        Row: { sector: string; insight_count: number };
        Relationships: [];
      };
    };
    Functions: {
      match_posts: {
        Args: { query_embedding: string; match_count?: number; filter_sector?: string | null };
        Returns: Array<{ id: string; title: string; similarity: number }>;
      };
      search_posts_lexical: {
        Args: { query_text: string; match_count?: number; filter_sector?: string | null };
        Returns: Array<{ id: string; title: string; similarity: number }>;
      };
      increment_post_view: {
        Args: { target_post_id: string };
        Returns: void;
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_verified_org: { Args: { check_id: string }; Returns: boolean };
      is_verified_reviewer: { Args: Record<string, never>; Returns: boolean };
      is_privileged_actor: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      user_role: UserRole;
      verification_status: VerificationStatus;
      verification_type: VerificationType;
      post_status: PostStatus;
      post_visibility: PostVisibility;
      feedback_value: FeedbackValue;
      target_kind: TargetKind;
      report_status: ReportStatus;
      submission_source: SubmissionSource;
      redaction_status: RedactionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
