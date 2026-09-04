"use client";

import { CornerDownLeft, Lock, Sparkles } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What conditions had to hold for this to work?",
  "What would you warn another organisation about?",
  "What did the peer reviewers push back on?",
];

/**
 * "Ask This Insight" — a chat scoped to one post's own content.
 *
 * The scope lock is enforced server-side (the agent service builds a system
 * prompt from only this post's fields, reviews, and comments). The notice in
 * the footer tells the reader that, because a chat box that silently declines
 * to answer looks broken unless you know why.
 */
export function PostRAGChat({ postId, postTitle }: { postId: string; postTitle: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  async function ask(rawQuestion: string) {
    const trimmed = rawQuestion.trim();
    if (!trimmed || streaming) return;

    setError(null);
    setQuestion("");
    setTurns((current) => [...current, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const response = await fetch("/api/agent/rag-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, question: trimmed }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "The assistant could not answer.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Append each chunk to the last turn as it arrives, so the answer types
      // itself out instead of appearing all at once when the request ends.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setTurns((current) => {
          const next = [...current];
          next[next.length - 1] = {
            role: "assistant",
            content: next[next.length - 1].content + chunk,
          };
          return next;
        });
        transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The assistant could not answer.");
      // Drop the empty assistant turn so the transcript does not keep a blank bubble.
      setTurns((current) => current.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section className="rag-chat" aria-label="Ask this insight">
      <header className="rag-chat-header">
        <Sparkles size={16} aria-hidden="true" />
        <div>
          <h2>Ask this OTR insight</h2>
          <p>Answered only from this published OTR record, its peer reviews, and its comments.</p>
        </div>
      </header>

      <div className="rag-chat-transcript" ref={transcriptRef}>
        {turns.length === 0 ? (
          <div className="rag-chat-empty">
            <p>Ask something specific about &ldquo;{postTitle}&rdquo;.</p>
            <div className="rag-chat-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void ask(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, index) => (
            <div className={`rag-turn rag-turn-${turn.role}`} key={index}>
              {turn.content || (streaming && index === turns.length - 1 ? (
                <span className="rag-typing" aria-label="Thinking">
                  <i /><i /><i />
                </span>
              ) : null)}
            </div>
          ))
        )}
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <form className="rag-chat-form" onSubmit={submit}>
        <input
          className="input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask a question about this insight…"
          disabled={streaming}
          maxLength={2000}
          aria-label="Your question"
        />
        <Button type="submit" disabled={streaming || !question.trim()}>
          {streaming ? "Answering…" : <><CornerDownLeft size={15} /> Ask</>}
        </Button>
      </form>

      <p className="rag-chat-scope">
        <Lock size={12} aria-hidden="true" />
        Scoped to this OTR insight. Questions outside its recorded evidence are
        marked as not covered — never guessed.
      </p>
    </section>
  );
}
