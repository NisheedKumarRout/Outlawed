"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OutlawedIndiaBrand } from "@/components/layout/BrandLogo";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, mode: "admin" }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Admin sign-in failed.");
      }

      window.location.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Admin sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-shell">
      <form className="auth-form admin-login-form" onSubmit={submit}>
        <OutlawedIndiaBrand className="admin-login-brand" href="/admin-login" />
        <div>
          <span className="page-eyebrow">OutLawed India operations</span>
          <h2>Admin sign in</h2>
          <p>Central insight library, organization verification, and proposal decisions.</p>
        </div>
        <label>Email address<Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <Button type="submit" disabled={loading}>{loading ? "Checking access…" : "Continue to admin"}</Button>
        <p className="auth-switch"><Link href="/login">Return to the public OTR website</Link></p>
      </form>
    </main>
  );
}
