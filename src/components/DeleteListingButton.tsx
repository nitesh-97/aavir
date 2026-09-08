"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteListingButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      className="btn-ghost text-bad hover:border-bad"
      onClick={async () => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
        setBusy(true);
        const response = await fetch(`/api/listings/${id}`, { method: "DELETE" });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          alert(body.error ?? "Could not delete that listing.");
          setBusy(false);
          return;
        }
        router.refresh();
      }}
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
