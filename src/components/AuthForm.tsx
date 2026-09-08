"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
        ...(isRegister ? { displayName: form.get("displayName") } : {}),
      }),
    }).catch(() => null);

    if (!response) {
      setError("Could not reach the server.");
      setBusy(false);
      return;
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "That did not work.");
      setBusy(false);
      return;
    }

    router.replace("/sell");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">
        {isRegister ? "Open your print shop" : "Welcome back"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {isRegister
          ? "Sellers upload models, set colours and sizes, and buyers try them in AR."
          : "Sign in to manage your listings."}
      </p>

      <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-6">
        {isRegister && (
          <div>
            <label className="label" htmlFor="displayName">
              Shop name
            </label>
            <input
              id="displayName"
              name="displayName"
              required
              minLength={2}
              maxLength={60}
              className="field"
              placeholder="Bright Layer Studio"
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" required className="field" />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={isRegister ? 8 : 1}
            className="field"
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
          {isRegister && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
        </div>

        {error && <p className="text-sm text-bad">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Working…" : isRegister ? "Create shop" : "Sign in"}
        </button>

        <p className="text-center text-sm text-muted">
          {isRegister ? (
            <>
              Already selling?{" "}
              <Link href="/login" className="text-brand hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/register" className="text-brand hover:underline">
                Open a shop
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
