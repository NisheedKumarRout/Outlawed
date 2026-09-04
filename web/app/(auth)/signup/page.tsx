"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LegalCompassBrand } from "@/components/layout/BrandLogo";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (signUpError) throw signUpError;

      if (!data.session) {
        setMessage("Check your email to confirm your account, then sign in to continue.");
        return;
      }

      router.push("/feed");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not create your account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell auth-shell-signup">
      <section className="auth-story">
        <LegalCompassBrand className="auth-brand" />
        <div><span className="auth-eyebrow">Reader account</span><h1>Learn from verified field experience.</h1><p>Reader accounts can browse and search approved insights without publishing or moderation access.</p></div>
        <p className="auth-trust">Firm and NGO accounts use a separate verification process.</p>
      </section>

      <section className="auth-form-column">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div><span className="page-eyebrow">Reader registration</span><h2>Create a read-only account</h2></div>
          <label>Display name<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required /></label>
          <label>Email address<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Password<Input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /><small>Use at least 8 characters.</small></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {message ? <p className="form-success" role="status">{message}</p> : null}
          <Button type="submit" disabled={loading || Boolean(message)}>{loading ? "Creating account…" : "Create reader account"}<ArrowRight size={16} /></Button>
          <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
          <p className="auth-switch">Represent an organization? <Link href="/organization-signup">Apply for publishing access</Link></p>
        </form>
      </section>
    </main>
  );
}
