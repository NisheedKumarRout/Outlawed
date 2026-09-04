"use client";

import { ArrowRight, Eye, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LegalCompassBrand } from "@/components/layout/BrandLogo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, mode: "reader" }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "We could not sign you in.");
      }

      const nextPath = new URLSearchParams(window.location.search).get("next");
      const destination =
        nextPath?.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/feed";

      window.location.replace(destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not sign you in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <LegalCompassBrand className="auth-brand" />
        <div>
          <span className="auth-eyebrow">Verified knowledge to action</span>
          <h1>The hard-won lessons should travel.</h1>
          <p>Find what worked, what failed, and the conditions that matter before adapting a legal-aid intervention.</p>
        </div>
        <p className="auth-trust"><ShieldCheck size={17} /> Organizations and submissions are reviewed by OutLawed India.</p>
      </section>

      <section className="auth-form-column">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div><span className="page-eyebrow">Reader access</span><h2>Sign in to read OTR</h2><p>Browse the verified practice knowledge feed. Reader accounts cannot publish or moderate.</p></div>
          <label>Email address<Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<span className="password-wrap"><Input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}><Eye size={17} /></button></span></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <Button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}<ArrowRight size={16} /></Button>
          <p className="auth-switch">New to OTR? <Link href="/signup">Create an account</Link></p>
          <p className="auth-switch">Represent a firm or NGO? <Link href="/organization-login">Organization sign in</Link></p>
        </form>
      </section>
    </main>
  );
}
