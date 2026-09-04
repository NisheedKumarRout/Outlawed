import { z } from "zod";

const requiredText = z.string().trim().min(1, "This field is required.");
const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

export const postSubmissionSchema = z.object({
  title: requiredText,
  problem: requiredText,
  context: requiredText,
  approach: requiredText,
  evidence_outcome: requiredText,
  key_takeaway: requiredText,
  image_url: z.string().trim().url().max(2048).optional(),
  is_anonymous: z.boolean().default(false),
  what_worked: optionalText,
  what_failed: optionalText,
  why_worked_or_failed: optionalText,
  conditions: optionalText,
  cautions: optionalText,
  would_do_differently: optionalText,
  sector: z.array(z.string().trim().min(1)).default([]),
  target_group: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  geography: optionalText,
  visibility: z
    .enum(["public", "registered", "verified_org", "restricted"])
    .default("registered"),
});

export type PostSubmission = z.infer<typeof postSubmissionSchema>;
