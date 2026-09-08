"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm text-muted hover:text-text disabled:opacity-50"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        startTransition(() => {
          router.refresh();
          router.push("/");
        });
      }}
    >
      Sign out
    </button>
  );
}
