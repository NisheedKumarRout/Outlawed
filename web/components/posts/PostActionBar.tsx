"use client";

import {
  Bookmark,
  BookmarkCheck,
  Columns3,
  Languages,
  Link2,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";

type KannadaTranslation = {
  title: string;
  problem: string;
  context: string;
  approach: string;
  evidence_outcome: string;
  key_takeaway: string;
  what_worked: string | null;
  what_failed: string | null;
  why_worked_or_failed: string | null;
  conditions: string | null;
  cautions: string | null;
  would_do_differently: string | null;
  tldr: string | null;
};

type TranslationResponse = {
  cached: boolean;
  translation: KannadaTranslation;
  error?: string;
};

const FULL_FIELDS: Array<[keyof KannadaTranslation, string]> = [
  ["context", "ಕ್ಷೇತ್ರದ ಸಂದರ್ಭ"],
  ["approach", "ನಾವು ಮಾಡಿದದ್ದು"],
  ["evidence_outcome", "ಬದಲಾವಣೆ ಮತ್ತು ಸಾಕ್ಷ್ಯ"],
  ["key_takeaway", "ಮುಖ್ಯ ಕಲಿಕೆ"],
  ["what_worked", "ಏನು ಫಲ ನೀಡಿತು"],
  ["what_failed", "ಏನು ಫಲಿಸಲಿಲ್ಲ"],
  ["cautions", "ಎಚ್ಚರಿಕೆ"],
  ["conditions", "ಮರುಬಳಕೆಯ ಷರತ್ತುಗಳು"],
  ["would_do_differently", "ಮುಂದಿನ ಬಾರಿ"],
];

export function PostActionBar({
  postId,
  usefulCount,
  commentCount,
  compact = false,
}: {
  postId: string;
  usefulCount: number;
  commentCount: number;
  compact?: boolean;
}) {
  const subscribeToSaved = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener("otr-saved-change", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("otr-saved-change", onChange);
    };
  }, []);
  const getSavedSnapshot = useCallback(
    () => localStorage.getItem(`otr-saved:${postId}`) === "true",
    [postId],
  );
  const saved = useSyncExternalStore(subscribeToSaved, getSavedSnapshot, () => false);
  const [translation, setTranslation] = useState<KannadaTranslation | null>(null);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function toggleSave() {
    const next = !saved;
    localStorage.setItem(`otr-saved:${postId}`, String(next));
    window.dispatchEvent(new Event("otr-saved-change"));
    setNotice(next ? "Saved on this device." : "Removed from saved posts.");
  }

  async function share() {
    const url = `${window.location.origin}/posts/${postId}`;
    if (navigator.share) {
      await navigator.share({ title: "LegalCompass insight", url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setNotice("Link copied.");
  }

  async function toggleTranslation() {
    setNotice(null);
    if (translation) {
      setTranslationOpen((current) => !current);
      return;
    }

    setTranslating(true);
    try {
      const response = await fetch("/api/agent/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      const payload = (await response.json()) as TranslationResponse;
      if (!response.ok) throw new Error(payload.error ?? "Translation failed.");
      setTranslation(payload.translation);
      setTranslationOpen(true);
      setNotice(payload.cached ? "Loaded saved Kannada translation." : "Kannada translation created and saved.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Translation failed.");
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className="post-action-shell">
      <div className="post-action-bar" aria-label="Post actions">
        <Link href={`/posts/${postId}#feedback`}><ThumbsUp size={15} /> {usefulCount} Useful</Link>
        <Link href={`/posts/${postId}#discussion`}><MessageSquare size={15} /> {commentCount} Discussion</Link>
        <Link href={`/compare?post=${postId}`}><Columns3 size={15} /> Compare</Link>
        <button type="button" onClick={toggleSave} className={saved ? "action-active" : undefined}>
          {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />} {saved ? "Saved" : "Save"}
        </button>
        <button type="button" onClick={() => void share()}><Link2 size={15} /> Share</button>
        <button
          type="button"
          onClick={() => void toggleTranslation()}
          className={translationOpen ? "translate-active" : "translate-action"}
          disabled={translating}
        >
          <Languages size={15} /> {translating ? "Translating…" : translationOpen ? "English" : "ಕನ್ನಡ / Kannada"}
        </button>
        {compact ? <Link className="read-full-link" href={`/posts/${postId}`}>Read full report →</Link> : null}
      </div>

      {notice ? <p className="post-action-notice" role="status">{notice}</p> : null}

      {translationOpen && translation ? (
        <section className="kannada-translation" lang="kn" aria-label="Kannada translation">
          <div className="kannada-translation-heading">
            <span>ಕನ್ನಡ ಅನುವಾದ</span>
            <small>OTR ದಾಖಲೆಯ ನಿಷ್ಠಾವಂತ ಅನುವಾದ</small>
          </div>
          <h3>{translation.title}</h3>
          <p>{translation.problem}</p>
          {compact ? (
            <div><strong>ಮುಖ್ಯ ಕಲಿಕೆ</strong><p>{translation.key_takeaway}</p></div>
          ) : (
            FULL_FIELDS.map(([field, label]) => translation[field] ? (
              <div key={field}><strong>{label}</strong><p>{translation[field]}</p></div>
            ) : null)
          )}
        </section>
      ) : null}
    </div>
  );
}
