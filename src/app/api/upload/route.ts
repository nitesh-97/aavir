import { getSession } from "@/lib/auth";
import { isBlobConfigured, isUploadKind, saveUpload, UploadError } from "@/lib/storage";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to upload." }, { status: 401 });

  // Where Blob is configured the client uploads directly and never calls this
  // route; writing to disk there would fail with EROFS anyway.
  if (isBlobConfigured()) {
    return Response.json(
      { error: "This deployment uploads directly to Blob storage." },
      { status: 501 },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "model");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file was attached." }, { status: 400 });
    }
    if (!isUploadKind(kind)) {
      return Response.json({ error: `Unknown upload kind "${kind}".` }, { status: 400 });
    }

    const url = await saveUpload(file, kind);
    return Response.json({ url, name: file.name, size: file.size });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return Response.json({ error: "Upload failed." }, { status: 500 });
  }
}
