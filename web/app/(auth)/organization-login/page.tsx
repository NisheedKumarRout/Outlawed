"use client";

import { ArrowRight, Building2, Eye, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LegalCompassBrand } from "@/components/layout/BrandLogo";

export default function OrganizationLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, mode: "organization" }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Organization sign-in failed.");
      window.location.replace("/feed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Organization sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story auth-story-organization">
        <LegalCompassBrand className="auth-brand" />
        <div>
          <span className="auth-eyebrow">Verified organization workspace</span>
          <h1>Bring field evidence into the shared library.</h1>
          <p>Submit insights and source material, then track OutLawed India&rsquo;s review before publication.</p>
        </div>
        <p className="auth-trust"><ShieldCheck size={17} /> Publishing access is available only after organization verification.</p>
      </section>

      <section className="auth-form-column">
        <form className="auth-form" onSubmit={submit}>
          <Building2 size={28} className="admin-login-icon" aria-hidden="true" />
          <div><span className="page-eyebrow">Firm / NGO access</span><h2>Organization sign in</h2><p>Use the verified organization account issued through the approval process.</p></div>
          <label>Email address<Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<span className="password-wrap"><Input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}><Eye size={17} /></button></span></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <Button type="submit" disabled={loading}>{loading ? "Checking organization…" : "Continue to workspace"}<ArrowRight size={16} /></Button>
          <p className="auth-switch">Need organization access? <Link href="/organization-signup">Apply here</Link></p>
          <p className="auth-switch">Reading only? <Link href="/login">Reader sign in</Link></p>
        </form>
      </section>
    </main>
  );
}
