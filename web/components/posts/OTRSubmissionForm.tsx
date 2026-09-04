"use client";

import { ArrowLeft, ArrowRight, Check, ImagePlus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { postSubmissionSchema } from "@/lib/validation/post";

type FormState = {
  title: string;
  problem: string;
  context: string;
  approach: string;
  evidence_outcome: string;
  key_takeaway: string;
  what_worked: string;
  what_failed: string;
  why_worked_or_failed: string;
  conditions: string;
  cautions: string;
  would_do_differently: string;
  sector: string;
  target_group: string;
  tags: string;
  geography: string;
  visibility: "public" | "registered" | "verified_org" | "restricted";
};

const initialState: FormState = {
  title: "",
  problem: "",
  context: "",
  approach: "",
  evidence_outcome: "",
  key_takeaway: "",
  what_worked: "",
  what_failed: "",
  why_worked_or_failed: "",
  conditions: "",
  cautions: "",
  would_do_differently: "",
  sector: "",
  target_group: "",
  tags: "",
  geography: "",
  visibility: "registered",
};

const steps = ["The situation", "Evidence", "Lessons", "Review"];
const requiredByStep: Array<Array<keyof FormState>> = [
  ["title", "problem", "context"],
  ["approach", "evidence_outcome", "key_takeaway"],
  [],
  [],
];

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function TextAreaField({
  label,
  name,
  value,
  onChange,
  required = false,
  hint,
}: {
  label: string;
  name: keyof FormState;
  value: string;
  onChange: (name: keyof FormState, value: string) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="submission-field">
      <span>{label}{required ? <b>Required</b> : <small>Optional</small>}</span>
      {hint ? <em>{hint}</em> : null}
      <textarea className="form-textarea" rows={5} value={value} onChange={(event) => onChange(name, event.target.value)} required={required} />
    </label>
  );
}

type StructuredInsight = Partial<Record<keyof FormState, string | string[]>> & {
  confidence?: "high" | "medium" | "low";
  unsupported_fields?: string[];
};

export function OTRSubmissionForm({
  organizationName,
  initialRawText = "",
}: {
  organizationName: string;
  initialRawText?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [submitStage, setSubmitStage] = useState<"idle" | "uploading-image" | "creating-post">("idle");
  const submissionLocked = useRef(false);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [postAnonymously, setPostAnonymously] = useState(false);

  // AI assist: paste raw notes, get the structured fields pre-filled. It is a
  // starting point the organisation then edits — never an auto-submission.
  const [rawText, setRawText] = useState(initialRawText);
  const [structuring, setStructuring] = useState(false);
  const [assistNote, setAssistNote] = useState<string | null>(null);
  const [showAssist, setShowAssist] = useState(Boolean(initialRawText));

  async function runStructuring() {
    if (rawText.trim().length < 40) {
      setError("Paste at least a paragraph of source material.");
      return;
    }

    setStructuring(true);
    setError(null);
    setAssistNote(null);

    try {
      const response = await fetch("/api/agent/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: rawText.trim() }),
      });
      const payload = (await response.json()) as {
        insight?: StructuredInsight;
        error?: string;
      };
      if (!response.ok || !payload.insight) {
        throw new Error(payload.error ?? "Structuring failed.");
      }

      const insight = payload.insight;
      const asText = (value: unknown) =>
        Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "";

      setForm((current) => {
        const next = { ...current };
        for (const key of Object.keys(initialState) as Array<keyof FormState>) {
          if (key === "visibility") continue;
          const value = asText(insight[key]);
          // Never overwrite something the organisation already typed.
          if (value && !current[key].trim()) {
            (next[key] as string) = value;
          }
        }
        return next;
      });

      const unsupported = insight.unsupported_fields ?? [];
      setAssistNote(
        `Draft filled in (confidence: ${insight.confidence ?? "unknown"}).` +
          (unsupported.length
            ? ` Left empty because the source did not cover them: ${unsupported.join(", ")}. Fill these in yourself rather than guessing.`
            : " Review every field before submitting — you are the author of record."),
      );
      setShowAssist(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Structuring failed.");
    } finally {
      setStructuring(false);
    }
  }

  const payload = useMemo(() => ({
    ...form,
    is_anonymous: postAnonymously,
    sector: splitList(form.sector),
    target_group: splitList(form.target_group),
    tags: splitList(form.tags),
  }), [form, postAnonymously]);

  function update(name: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setError(null);
  }

  function nextStep() {
    const missing = requiredByStep[step].find((field) => !form[field].trim());
    if (missing) {
      setError("Complete the required fields before continuing.");
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLocked.current) return;

    // Read the file directly from the submitted form as well as React state.
    // This closes the tiny gap where a user can choose a file and immediately
    // submit before the coverImage state update has rendered.
    const formImage = new FormData(event.currentTarget).get("cover_image");
    const selectedImage = formImage instanceof File && formImage.size > 0
      ? formImage
      : coverImage;

    setError(null);
    const parsed = postSubmissionSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the submission fields.");
      return;
    }

    submissionLocked.current = true;
    setSubmitStage(selectedImage ? "uploading-image" : "creating-post");
    try {
      let imageUrl: string | undefined;
      if (selectedImage) {
        if (selectedImage.size > 5 * 1024 * 1024) {
          throw new Error("The cover photo must be 5 MB or smaller.");
        }

        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("Sign in again before uploading a photo.");

        const safeName = selectedImage.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const imagePath = `${userData.user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("post-images")
          .upload(imagePath, selectedImage, {
            cacheControl: "31536000",
            contentType: selectedImage.type,
            upsert: false,
          });
        if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);

        imageUrl = supabase.storage.from("post-images").getPublicUrl(imagePath).data.publicUrl;
      }

      // The post is never created until the optional image upload above has
      // completed and produced its final public URL.
      setSubmitStage("creating-post");
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, image_url: imageUrl }),
      });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Submission failed.");
      router.push(`/posts/${result.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Submission failed.");
    } finally {
      submissionLocked.current = false;
      setSubmitStage("idle");
    }
  }

  return (
    <form className="otr-form" onSubmit={submit}>
      <header className="otr-form-header">
        <div><span>Submitting as</span><strong>{organizationName}</strong></div>
        <ol>{steps.map((label, index) => <li className={index === step ? "current" : index < step ? "complete" : ""} key={label}><span>{index < step ? <Check size={13} /> : index + 1}</span>{label}</li>)}</ol>
      </header>

      <div className="otr-form-body">
        {step === 0 ? <>
          <div className="ai-assist">
            <button type="button" className="ai-assist-toggle" onClick={() => setShowAssist((v) => !v)}>
              <Sparkles size={14} aria-hidden="true" />
              {showAssist ? "Hide AI assist" : "Start from raw notes instead"}
            </button>

            {showAssist ? (
              <div className="ai-assist-body">
                <p>
                  Paste session notes or redacted transcript text. Every field below
                  gets a draft you then edit — nothing is submitted automatically,
                  and anything the source does not support is left blank rather
                  than invented.
                </p>
                <textarea
                  className="form-textarea"
                  rows={6}
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Paste your raw session notes here…"
                  maxLength={200000}
                />
                <Button type="button" variant="secondary" onClick={() => void runStructuring()} disabled={structuring}>
                  {structuring ? "Structuring…" : "Draft the fields"}
                </Button>
              </div>
            ) : null}

            {assistNote ? <p className="ai-assist-note">{assistNote}</p> : null}
          </div>

          <label className="submission-field"><span>Insight title<b>Required</b></span><Input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="A specific, reusable learning" required /></label>
          <TextAreaField label="Problem" name="problem" value={form.problem} onChange={update} required hint="What practical problem were you trying to solve?" />
          <TextAreaField label="Context" name="context" value={form.context} onChange={update} required hint="Who, where, and under what conditions?" />
        </> : null}

        {step === 1 ? <>
          <TextAreaField label="Approach" name="approach" value={form.approach} onChange={update} required hint="What did the organization actually do?" />
          <TextAreaField label="Evidence and outcome" name="evidence_outcome" value={form.evidence_outcome} onChange={update} required hint="What changed, and what supports that conclusion?" />
          <TextAreaField label="Key takeaway" name="key_takeaway" value={form.key_takeaway} onChange={update} required hint="What should another organization remember?" />
        </> : null}

        {step === 2 ? <>
          <TextAreaField label="What worked" name="what_worked" value={form.what_worked} onChange={update} />
          <TextAreaField label="What failed" name="what_failed" value={form.what_failed} onChange={update} />
          <TextAreaField label="Why it worked or failed" name="why_worked_or_failed" value={form.why_worked_or_failed} onChange={update} />
          <TextAreaField label="Conditions for reuse" name="conditions" value={form.conditions} onChange={update} />
          <TextAreaField label="Cautions" name="cautions" value={form.cautions} onChange={update} />
          <TextAreaField label="What we would do differently" name="would_do_differently" value={form.would_do_differently} onChange={update} />
        </> : null}

        {step === 3 ? <>
          <label className="privacy-choice">
            <input
              type="checkbox"
              checked={postAnonymously}
              onChange={(event) => setPostAnonymously(event.target.checked)}
            />
            <span className="privacy-choice-control" aria-hidden="true" />
            <span>
              <strong>Publish this insight anonymously</strong>
              <small>
                Readers will see “Anonymous verified organization.” OutLawed India
                moderators can still identify the submitting organization.
              </small>
            </span>
          </label>
          <label className="submission-field submission-image-field">
            <span>Cover photo<small>Optional</small></span>
            <em>One JPG, PNG, or WebP image, up to 5 MB. Avoid client-identifying material.</em>
            <span className="submission-image-placeholder">
              <ImagePlus size={24} aria-hidden="true" />
              <strong>{coverImage ? coverImage.name : "Choose a case photo"}</strong>
              <small>{coverImage ? "Click to replace" : "Adds context below the post summary"}</small>
            </span>
            <input
              className="visually-hidden"
              type="file"
              name="cover_image"
              accept="image/jpeg,image/png,image/webp"
              disabled={submitStage !== "idle"}
              onChange={(event) => {
                setCoverImage(event.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </label>
          <div className="submission-grid">
            <label className="submission-field"><span>Sectors<small>Optional</small></span><Input value={form.sector} onChange={(event) => update("sector", event.target.value)} placeholder="Access to Justice, Training" /></label>
            <label className="submission-field"><span>Target groups<small>Optional</small></span><Input value={form.target_group} onChange={(event) => update("target_group", event.target.value)} placeholder="Women, Frontline Workers" /></label>
            <label className="submission-field"><span>Tags<small>Optional</small></span><Input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="PLV, role clarity" /></label>
            <label className="submission-field"><span>Geography<small>Optional</small></span><Input value={form.geography} onChange={(event) => update("geography", event.target.value)} placeholder="District, state, or region" /></label>
          </div>
          <label className="submission-field"><span>Visibility<b>Required</b></span><select value={form.visibility} onChange={(event) => update("visibility", event.target.value)}><option value="registered">Registered members</option><option value="public">Public</option><option value="verified_org">Verified organizations</option><option value="restricted">Restricted</option></select></label>
          <section className="submission-review"><h3>Ready for moderation</h3><p><strong>{form.title}</strong></p><p>{form.key_takeaway}</p><small>{postAnonymously ? "The public author will be anonymous; moderators retain the accountable organization record. " : ""}Submitting creates a pending post. Only an OutLawed India admin can approve publication.</small></section>
        </> : null}

        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </div>

      <footer className="otr-form-footer">
        <div>{step > 0 ? <Button type="button" variant="secondary" onClick={() => setStep((current) => current - 1)}><ArrowLeft size={15} /> Back</Button> : <Link href="/feed">Cancel</Link>}</div>
        {step < steps.length - 1 ? <Button type="button" onClick={nextStep}>Continue <ArrowRight size={15} /></Button> : <Button type="submit" disabled={submitStage !== "idle"}>{submitStage === "uploading-image" ? "Uploading photo…" : submitStage === "creating-post" ? "Creating submission…" : "Submit for review"}</Button>}
      </footer>
    </form>
  );
}
