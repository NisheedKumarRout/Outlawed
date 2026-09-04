export type ModerationPost = {
  id: string;
  title: string;
  problem: string;
  keyTakeaway: string;
  status: "pending" | "changes_requested";
  createdAt: string;
  organizationName: string;
};
