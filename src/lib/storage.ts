import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Local-disk storage driver. Files land in /public/uploads and are served
 * straight off the filesystem by Next.
 *
 * To deploy on a platform with an ephemeral or read-only filesystem (Vercel,
 * Netlify, most containers), replace the body of `saveUpload` with an S3 /
 * R2 / Supabase Storage put and return the resulting public URL. Nothing else
 * in the app touches the filesystem.
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export const UPLOAD_KINDS = {
  model: { extensions: [".glb", ".gltf"], label: "3D model" },
  usdz: { extensions: [".usdz"], label: "USDZ file" },
  image: { extensions: [".png", ".jpg", ".jpeg", ".webp"], label: "image" },
} as const;

export type UploadKind = keyof typeof UPLOAD_KINDS;

export function isUploadKind(value: string): value is UploadKind {
  return value in UPLOAD_KINDS;
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export class UploadError extends Error {}

export async function saveUpload(file: File, kind: UploadKind): Promise<string> {
  const { extensions, label } = UPLOAD_KINDS[kind];
  const ext = path.extname(file.name).toLowerCase();

  if (!(extensions as readonly string[]).includes(ext)) {
    throw new UploadError(
      `Unsupported ${label} format "${ext || file.name}". Expected ${extensions.join(", ")}.`,
    );
  }
  if (file.size === 0) {
    throw new UploadError(`That ${label} is empty.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `That ${label} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), bytes);

  return `/uploads/${filename}`;
}
