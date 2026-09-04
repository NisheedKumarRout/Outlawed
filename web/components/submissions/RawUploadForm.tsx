"use client";

import { FileUp, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { RedactionReviewPanel, type RedactionResult } from "@/components/submissions/RedactionReviewPanel";
import { Button } from "@/components/ui/Button";

const SOURCE_TYPES = [
  { value: "session_notes", label: "Session notes" },
  { value: "transcript", label: "Transcript" },
  { value: "slide_deck", label: "Slide deck" },
  { value: "other", label: "Other" },
] as const;

const ACCEPTED = ".txt,.md,.csv,.vtt,.srt,.docx,.pdf,.pptx";
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Raw material upload.
 *
 * The authenticated Next.js route owns storage registration and redaction as
 * one operation. This keeps browser storage/CORS failures from looking like a
 * dead button and lets the UI show the actual server-side error.
 */
export function RawUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<(typeof SOURCE_TYPES)[number]["value"]>("session_notes");
  const [stage, setStage] = useState<"idle" | "uploading" | "redacting">("idle");
  const [result, setResult] = useState<RedactionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That file is over 15 MB. Split it and upload the parts separately.");
      return;
    }

    setError(null);
    setResult(null);
    setStage("uploading");

    try {
      const body = new FormData();
      body.set("file", file);
      body.set("source_type", sourceType);
      setStage("redacting");

      const response = await fetch("/api/agent/ingest", {
        method: "POST",
        body,
      });

      const payload = (await response.json()) as RedactionResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Redaction failed.");

      setResult(payload);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The upload could not be processed.");
    } finally {
      setStage("idle");
    }
  }

  return (
    <div className="raw-upload">
      <div className="raw-upload-notice">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>Redacted before anyone reads it</strong>
          <p>
            Your file is scanned for names, contact details, ID and case numbers
            before it reaches a reviewer. The original never leaves the secure
            service — admins only ever see the redacted version.
          </p>
        </div>
      </div>

      <form className="raw-upload-form" onSubmit={submit}>
        <label className="submission-field">
          <span>Source material<b>Required</b></span>
          <em>
            Typed documents only — .txt, .md, .csv, .vtt, .srt, .docx, .pdf, .pptx.
            Scanned pages and handwriting are not supported; paste the transcribed
            text instead.
          </em>
          <input
            type="file"
            accept={ACCEPTED}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </label>

        <label className="submission-field">
          <span>What is this?<b>Required</b></span>
          <select
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value as typeof sourceType)}
          >
            {SOURCE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </label>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <Button type="submit" disabled={stage !== "idle" || !file}>
          <FileUp size={15} aria-hidden="true" />
          {stage === "uploading"
            ? "Uploading securely and starting redaction…"
            : stage === "redacting"
              ? "Redacting — this can take a minute…"
              : "Upload and redact"}
        </Button>

        {stage === "redacting" ? (
          <p className="raw-upload-progress">
            Scanning the document for identifiers. Longer transcripts are split
            into sections and checked separately, so this is not instant.
          </p>
        ) : null}
      </form>

      {result ? <RedactionReviewPanel result={result} /> : null}
    </div>
  );
}
