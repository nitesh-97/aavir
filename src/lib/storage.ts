import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Two storage backends, chosen by whether Vercel Blob is configured:
 *
 *   Blob   — production. The browser uploads straight to Blob storage and the
 *            server only issues a scoped token. Serverless request bodies are
 *            capped at 4.5 MB, so a 50 MB .glb could never travel through an
 *            API route; it has to bypass the function entirely.
 *   Local  — development. Files land in /public/uploads so `npm run dev` works
 *            with no cloud credentials at all.
 *
 * Both paths share the validation below, so the rules cannot drift apart.
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export const UPLOAD_KINDS = {
  model: {
    extensions: [".glb", ".gltf"],
    label: "3D model",
    // Browsers are inconsistent about glTF types and often send nothing at all,
    // so the extension is the real check and this list stays permissive.
    contentTypes: [
      "model/gltf-binary",
      "model/gltf+json",
      "application/octet-stream",
      "application/json",
      "",
    ],
  },
  usdz: {
    extensions: [".usdz"],
    label: "USDZ file",
    contentTypes: ["model/vnd.usdz+zip", "application/zip", "application/octet-stream", ""],
  },
  image: {
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    label: "image",
    contentTypes: ["image/png", "image/jpeg", "image/webp"],
  },
} as const;

export type UploadKind = keyof typeof UPLOAD_KINDS;

export function isUploadKind(value: string): value is UploadKind {
  return value in UPLOAD_KINDS;
}

export class UploadError extends Error {}

/** True when Vercel Blob credentials are present, i.e. on Vercel. */
export function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export type UploadMode = "blob" | "local";

export function uploadMode(): UploadMode {
  return isBlobConfigured() ? "blob" : "local";
}

/** Throws unless `filename` carries an extension this kind accepts. */
export function assertExtension(filename: string, kind: UploadKind) {
  const { extensions, label } = UPLOAD_KINDS[kind];
  const ext = path.extname(filename).toLowerCase();

  if (!(extensions as readonly string[]).includes(ext)) {
    throw new UploadError(
      `Unsupported ${label} format "${ext || filename}". Expected ${extensions.join(", ")}.`,
    );
  }
  return ext;
}

export function assertSize(bytes: number, kind: UploadKind) {
  const { label } = UPLOAD_KINDS[kind];
  if (bytes === 0) throw new UploadError(`That ${label} is empty.`);
  if (bytes > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `That ${label} is ${(bytes / 1024 / 1024).toFixed(1)} MB. The limit is ${
        MAX_UPLOAD_BYTES / 1024 / 1024
      } MB.`,
    );
  }
}

/** Storage key for an upload, e.g. `models/<uuid>.glb`. */
export function storageKey(filename: string, kind: UploadKind) {
  const ext = assertExtension(filename, kind);
  return `${kind}s/${randomUUID()}${ext}`;
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * Local-disk driver. Used in development only — Vercel's filesystem is
 * read-only at runtime, so this would fail there with EROFS.
 */
export async function saveUpload(file: File, kind: UploadKind): Promise<string> {
  const ext = assertExtension(file.name, kind);
  assertSize(file.size, kind);

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()));

  return `/uploads/${filename}`;
}
