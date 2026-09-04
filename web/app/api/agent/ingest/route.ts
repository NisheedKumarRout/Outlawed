import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AgentRequestError,
  AgentUnavailableError,
  callAgent,
} from "@/lib/agent/agentClient";
import { forbidden, getViewer, notConfigured, unauthorized } from "@/lib/auth/session";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/server";

const schema = z.object({
  storage_path: z.string().trim().min(3).max(1024),
  source_type: z.enum(["session_notes", "transcript", "slide_deck", "other"]),
  original_filename: z.string().trim().min(1).max(300).optional(),
});

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".csv",
  ".vtt",
  ".srt",
  ".docx",
  ".pdf",
  ".pptx",
]);

export async function POST(request: Request) {
  if (!hasSupabasePublicEnv()) return notConfigured();

  const viewer = await getViewer();
  if (!viewer) return unauthorized();

  const supabase = await createClient();
  const { data: organization } = await supabase
    .from("organizations")
    .select("id,verified")
    .eq("id", viewer.userId)
    .maybeSingle();

  if (!organization?.verified) {
    return forbidden("A verified organization account is required to upload raw material.");
  }

  let input: z.infer<typeof schema>;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.startsWith("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "The selected file could not be read." }, { status: 400 });
    }

    const file = formData.get("file");
    const sourceType = formData.get("source_type");
    if (!(file instanceof File) || typeof sourceType !== "string") {
      return NextResponse.json({ error: "Choose a file and describe what it is." }, { status: 422 });
    }
    const parsedSourceType = z
      .enum(["session_notes", "transcript", "slide_deck", "other"])
      .safeParse(sourceType);
    if (!parsedSourceType.success) {
      return NextResponse.json({ error: "Choose a valid source type." }, { status: 422 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "The selected file is empty." }, { status: 422 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "That file is over 15 MB. Split it and upload the parts separately." },
        { status: 413 },
      );
    }

    const dot = file.name.lastIndexOf(".");
    const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: "Use a TXT, Markdown, CSV, transcript, DOCX, PDF, or PPTX file." },
        { status: 415 },
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
    const storagePath = `${viewer.userId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("raw-submissions")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("Raw material storage upload failed:", uploadError.message);
      return NextResponse.json(
        { error: `The file could not be stored: ${uploadError.message}` },
        { status: 400 },
      );
    }

    const parsed = schema.safeParse({
      storage_path: storagePath,
      source_type: parsedSourceType.data,
      original_filename: file.name,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Upload details are incomplete." }, { status: 422 });
    }
    input = parsed.data;
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Upload details are incomplete." }, { status: 422 });
    }
    input = parsed.data;
  }

  // The storage policy already restricts writes to `{org_id}/...`, but the
  // path also arrives here as user input and is handed to the service role,
  // which ignores those policies. Re-check the prefix so a crafted path
  // cannot point the redactor at another org's upload.
  if (!input.storage_path.startsWith(`${viewer.userId}/`)) {
    return forbidden("That upload path does not belong to your organization.");
  }

  const { data: submission, error } = await supabase
    .from("raw_submissions")
    .insert({
      org_id: viewer.userId,
      source_type: input.source_type,
      original_filename: input.original_filename ?? null,
      storage_path: input.storage_path,
      redaction_status: "processing",
    })
    .select("id")
    .single();

  if (error || !submission) {
    console.error("Could not register raw submission:", error?.message);
    return NextResponse.json({ error: "The upload could not be registered." }, { status: 400 });
  }

  try {
    // Synchronous by design: at this scale a job queue is a deliberate
    // non-goal. Redaction of a long transcript takes tens of seconds, which
    // is why RawUploadForm shows a progress state rather than a spinner.
    const result = await callAgent<Record<string, unknown>>("/ingest/redact", {
      body: { submission_id: submission.id },
    });
    return NextResponse.json({ submission_id: submission.id, ...result });
  } catch (error) {
    if (error instanceof AgentUnavailableError) {
      return NextResponse.json(
        {
          submission_id: submission.id,
          error: "The redaction service is not configured. The upload was saved but not redacted.",
        },
        { status: 503 },
      );
    }
    if (error instanceof AgentRequestError) {
      return NextResponse.json(
        { submission_id: submission.id, error: error.message },
        { status: error.status },
      );
    }
    console.error("Redaction request failed:", error);
    return NextResponse.json(
      { submission_id: submission.id, error: "Redaction could not be completed." },
      { status: 502 },
    );
  }
}
