import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aavir — 3D prints you can place in your room",
  description:
    "A marketplace for 3D print makers. Preview any print in augmented reality, at true size, in the colour you'd order.",
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en">
      <body className="min-h-full">
        <header className="sticky top-0 z-40 border-b border-edge bg-ink/70 backdrop-blur-lg">
          <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="mr-auto flex items-center gap-2 text-lg font-bold">
              <span aria-hidden className="text-xl">◈</span>
              <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent">
                Aavir
              </span>
            </Link>

            <Link href="/" className="hidden text-sm text-muted hover:text-text sm:block">
              Browse
            </Link>

            {session ? (
              <>
                <Link href="/sell" className="text-sm text-muted hover:text-text">
                  My shop
                </Link>
                <Link href="/sell/new" className="btn-primary">
                  Upload
                </Link>
                <SignOutButton />
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-muted hover:text-text">
                  Sign in
                </Link>
                <Link href="/register" className="btn-primary">
                  Start selling
                </Link>
              </>
            )}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

        <footer className="mx-auto max-w-6xl px-4 pt-8 pb-12 text-xs text-muted">
          Aavir — preview prints at true size in your own space before you order.
        </footer>
      </body>
    </html>
  );
}
