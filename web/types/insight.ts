export type OrganizationSummary = {
  id: string;
  name: string;
  description?: string | null;
  verified: boolean;
  sectors: string[];
  publishedInsightCount: number;
  usefulPercentage: number | null;
};

export type InsightPost = {
  id: string;
  isAnonymous: boolean;
  title: string;
  problem: string;
  context: string;
  approach: string;
  evidenceOutcome: string;
  whatWorked: string | null;
  whatFailed: string | null;
  whyWorkedOrFailed: string | null;
  conditions: string | null;
  cautions: string | null;
  wouldDoDifferently: string | null;
  keyTakeaway: string;
  tldr: string | null;
  imageUrl: string | null;
  tags: string[];
  sectors: string[];
  targetGroups: string[];
  geography: string | null;
  createdAt: string;
  usefulCount: number;
  commentCount: number;
  organization: OrganizationSummary;
};
