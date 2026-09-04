"use client";

import { ArrowRight, Building2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LegalCompassBrand } from "@/components/layout/BrandLogo";
import { createClient } from "@/lib/supabase/client";

export default function OrganizationSignupPage() {
  const router = useRouter();
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: contactName, account_intent: "organization" } },
      });
      if (signUpError) throw signUpError;

      if (!data.session) {
        setMessage("Confirm the email address, then sign in to complete the organization application. The admin request is created when that application is submitted.");
        return;
      }

      router.push("/org-application");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The organization account could not be started.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell auth-shell-signup">
      <section className="auth-story auth-story-organization">
        <LegalCompassBrand className="auth-brand" />
        <div><span className="auth-eyebrow">Firm / NGO onboarding</span><h1>Publishing starts with verification.</h1><p>Create the accountable contact first. You will then submit the organization&rsquo;s proof and programme details to OutLawed India.</p></div>
        <p className="auth-trust">No proposal becomes public until the organization and the insight are both approved.</p>
      </section>

      <section className="auth-form-column">
        <form className="auth-form" onSubmit={submit}>
          <Building2 size={28} className="admin-login-icon" aria-hidden="true" />
          <div><span className="page-eyebrow">Organization application</span><h2>Create the accountable contact</h2><p>This account remains read-only until OutLawed India approves the application.</p></div>
          <label>Contact person<Input value={contactName} onChange={(event) => setContactName(event.target.value)} autoComplete="name" required /></label>
          <label>Work email<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Password<Input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /><small>Use at least 8 characters.</small></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {message ? (
            <div className="signup-next-step" role="status">
              <p className="form-success">{message}</p>
              <Link href="/login?next=%2Forg-application" className="button button-secondary">
                Continue to organization application <ArrowRight size={16} />
              </Link>
            </div>
          ) : null}
          <Button type="submit" disabled={loading || Boolean(message)}>{loading ? "Creating account…" : "Continue to verification"}<ArrowRight size={16} /></Button>
          <p className="auth-switch">Already verified? <Link href="/organization-login">Organization sign in</Link></p>
          <p className="auth-switch">Reading only? <Link href="/signup">Create a reader account</Link></p>
        </form>
      </section>
    </main>
  );
}
