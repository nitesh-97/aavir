import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import {
  assertExtension,
  isBlobConfigured,
  isUploadKind,
  MAX_UPLOAD_BYTES,
  UPLOAD_KINDS,
  UploadError,
} from "@/lib/storage";

/**
 * Issues a short-lived, scoped token so the browser can upload straight to
 * Vercel Blob. The file itself never passes through this function — which is
 * the point, since serverless request bodies are capped at 4.5 MB and a print
 * model is routinely larger than that.
 */
export async function POST(request: Request) {
  if (!isBlobConfigured()) {
    return Response.json(
      { error: "Blob storage is not configured on this deployment." },
      { status: 501 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // This is the only authorisation checkpoint in the client-upload flow:
        // once a token is issued the browser talks to Blob directly.
        const session = await getSession();
        if (!session) throw new UploadError("Sign in to upload.");

        const kind = clientPayload ?? "model";
        if (!isUploadKind(kind)) throw new UploadError(`Unknown upload kind "${kind}".`);

        assertExtension(pathname, kind);

        return {
          allowedContentTypes: [...UPLOAD_KINDS[kind].contentTypes],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
      // Fires as a server-to-server callback from Blob. It cannot reach a
      // localhost dev server, so nothing here may be load-bearing — the client
      // already receives the final URL from `upload()`.
      onUploadCompleted: async () => {},
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return Response.json({ error: "Could not start the upload." }, { status: 500 });
  }
}
