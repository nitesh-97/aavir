import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { hash, compare } from "bcryptjs";
import { prisma } from "./db";

const COOKIE_NAME = "aavir_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set. Copy .env.example to .env.");
  }
  return new TextEncoder().encode(secret);
}

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

export function hashPassword(plain: string) {
  return hash(plain, 10);
}

export function verifyPassword(plain: string, passwordHash: string) {
  return compare(plain, passwordHash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * A valid signature is not enough on its own: the token is stateless and lives
 * for thirty days, so an account deleted in the meantime would keep working
 * until a write blew up on a foreign key. The row is re-read on every call —
 * one lookup by primary key — which also means a renamed shop shows its new
 * name without the seller signing in again.
 */
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  let id: string;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.id !== "string") return null;
    id = payload.id;
  } catch {
    // Expired or tampered token — treat as signed out.
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, displayName: true },
  });

  return user ?? null;
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}
