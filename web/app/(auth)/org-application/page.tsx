"use client";

import { ArrowRight, CheckCircle2, FileCheck2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

export default function OrganizationApplicationPage() {
  const [orgName, setOrgName] = useState("");
  const [description, setDescription] = useState("");
  const [proof, setProof] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Please sign in before applying.");

      const { error: insertError } = await supabase.from("verification_requests").insert({
        profile_id: userData.user.id,
        request_type: "organization",
        payload: { org_name: orgName, description, proof },
      });
      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not submit the application.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return <main className="application-shell"><section className="application-success"><CheckCircle2 size={42} /><span className="page-eyebrow">Application received</span><h1>Your organization is under review.</h1><p>OutLawed India will verify the details before enabling organization publishing access. Your account remains an individual account until approval.</p><Link href="/feed" className="button button-primary">Explore the feed <ArrowRight size={16} /></Link></section></main>;
  }

  return (
    <main className="application-shell">
      <form className="application-form" onSubmit={handleSubmit}>
        <div className="application-heading"><FileCheck2 size={28} /><div><span className="page-eyebrow">Organization verification</span><h1>Apply to publish on OTR</h1><p>Tell OutLawed India who you are and how your organization contributes to legal aid.</p></div></div>
        <label>Organization name<Input value={orgName} onChange={(event) => setOrgName(event.target.value)} required /></label>
        <label>About the organization<textarea className="form-textarea" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} required /></label>
        <label>Proof or supporting link<textarea className="form-textarea" value={proof} onChange={(event) => setProof(event.target.value)} rows={3} placeholder="Website, registration details, or a short note explaining what can be verified" required /></label>
        <p className="application-note">Submitting this form does not change your role or verify the organization. That happens only after an OutLawed India admin approves it.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <Button type="submit" disabled={loading}>{loading ? "Submitting…" : "Submit application"}<ArrowRight size={16} /></Button>
      </form>
    </main>
  );
}
