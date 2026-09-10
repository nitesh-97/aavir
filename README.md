# Aavir 2.0

A marketplace for 3D-print makers where buyers can place a print **in their own room, at true scale, in the colour and size they'd actually order** before buying.

Sellers upload a `.glb`, define the filament colours and print sizes they offer, and publish. Buyers browse, orbit the model, switch colour and size, then drop it on their floor in AR and slide and turn it until it looks right.

---

## Quick start

The app talks to Postgres (Neon) and Vercel Blob, so local development borrows
the deployment's credentials rather than running its own services.

```bash
npm install
```

Pull the environment down from Vercel. Prisma's CLI reads `.env` specifically,
not `.env.local`, so write it there:

```bash
npx vercel env pull .env
```

Add `AUTH_SECRET` to `.env` if it is not already set in the Vercel project —
see [Environment](#environment). Then create the schema and load the demo
catalogue of seven listings:

```bash
npm run setup
```

```bash
npm run dev
```

Open <http://localhost:3000>. The seeded shop signs in with **`demo@aavir.test` / `demo1234`**.

> Local dev points at the same Neon database as the deployment. To keep them
> apart, create a Neon branch and use its connection string in `.env`.

### Trying AR on a real phone

WebXR only runs in a **secure context**, so `http://192.168.x.x:3000` will not offer AR no matter what the phone supports. Serve over HTTPS instead:

```bash
npm run dev:https
```

That binds to all interfaces with a self-signed certificate. Open `https://<your-machine-ip>:3000` on an Android phone in Chrome and accept the certificate warning.

---

## How AR works here

AR is split by platform, because the two platforms genuinely differ:

| Platform | Mechanism | Place | Move / rotate | Live colour & size |
| --- | --- | --- | --- | --- |
| Android Chrome, and other WebXR browsers | **WebXR `immersive-ar`** rendered with three.js | Tap a detected surface | Yes — custom gestures | Yes, while the print is standing in the room |
| iOS Safari / iPadOS | **AR Quick Look**, fed a USDZ generated in the browser | Handled by iOS | Handled by iOS | Yes — baked into the file before it opens |
| Desktop / anything else | No AR | — | — | — |

Everything except the iOS row is built in `src/components/ArLauncher.tsx`.

**Why the split:** iOS Safari does not implement WebXR at all, so AR there can
only mean Quick Look, which accepts nothing but USDZ. Rather than ask sellers to
export one — and rather than run Apple's USD tooling server-side — the phone
builds it itself with three.js's `USDZExporter`, from the same GLB the preview
already loaded (`src/lib/three/usdz.ts`).

Because the export happens *after* the colour and scale are applied, the buyer's
actual selection is baked into the file. A seller-uploaded static USDZ could
never do that. Two details make it work:

- The file is built **before** the tap, debounced on colour/size changes. Quick
  Look opens from a genuine activation of an `<a rel="ar">`, and a synthetic
  click issued after an `await` has already lost the user gesture.
- When a tint is applied, the base-colour texture is dropped. `USDZExporter`
  wires that map straight into `diffuseColor` and ignores `material.color`, so
  a textured model would otherwise open in Quick Look with the colour choice
  silently discarded. Normal, roughness and AO maps are kept.

A seller-uploaded USDZ is still honoured as a fallback if the export fails.
Where a device has no AR at all, the 3D viewer stays fully usable and the UI
explains why.

### Gestures once placed

- **One finger drag** — slides the print along the floor. Movement is converted from pixels to metres using the XR camera's own projection, so a drag tracks the finger at the object's actual depth.
- **Two finger twist** — turns it about its vertical axis.
- **Move to a new spot** — returns the reticle so the next tap re-places it.

Pinch-to-zoom is deliberately **not** wired up. Size comes only from the seller's size options, which carry real centimetre figures — a free-scale gesture would quietly break the one promise the product makes. To add it anyway, give the placed group a user scale in `ArLauncher.tsx` and multiply it into the size effect.

### What sellers can upload

`.stl`, `.obj`, `.3mf`, `.glb`, `.gltf` — converted to glb **in the seller's
browser** at upload time (`src/lib/three/convert.ts`), so only one format is
ever stored and the preview, WebXR and USDZ paths all have a single thing to
handle. No server-side conversion, no queue, no extra dependency: three.js
already ships the loaders and `GLTFExporter`.

STL is the important one, since it is what every slicer takes, and it happens to
suit this app well. It carries no colour (irrelevant — colour is applied as a
tint) and declares no units (already handled — the seller states the true
height). STL and 3MF are read as millimetres, which is what printing tools work
in; OBJ is left as authored.

STL is also unindexed triangle soup, so conversion runs `mergeVertices`. That
compares normals as well as positions, so coplanar duplicates collapse while
genuinely sharp edges keep their split normals — a 36-vertex cube becomes 24,
not a rounded blob. Source files may be up to 250 MB because the glb that comes
out is much smaller; the 50 MB limit applies to the converted result.

**CAD formats are deliberately not accepted.** STEP, IGES, SLDPRT and F3D are
parametric B-rep surfaces rather than meshes, so converting means tessellating —
which needs OpenCascade compiled to WASM, cannot be done at all for the
proprietary ones, and hinges on a quality trade-off only the seller can judge.
Their CAD tool exposes exactly that as an export dialog, and they already export
STL in order to print. The upload error says so.

### Upload checks and seller guidance

An untextured STL is not the only way a listing goes wrong. The commonest is a
**printer build plate** — several copies or parts arranged for the bed, which is
what a seller has open in their slicer, but which AR then drops into the buyer's
room as a metre-wide arrangement rather than one product.

`src/lib/three/inspect.ts` detects that at upload time and warns, without
blocking. It splits the model into connected bodies rather than counting meshes,
because after an STL round-trip a plate is frequently one mesh holding several
disconnected shells with no object boundaries left to count. Vertices are welded
by quantised position first — an STL stores every triangle independently, so
without welding every triangle looks like its own body.

The signal that actually discriminates is **footprint dominance**, not part
count. A plate is several bodies where none covers much of the footprint; a
genuine assembly has one part that does. Measured against real models:

| Model | Parts | Largest part's share of footprint | Flagged |
| --- | --- | --- | --- |
| Build plate of figures | 15 | 0.24 | **yes** |
| BoomBox | 14 | 1.00 | no |
| Lantern (post, lamp, shade) | 3 | 1.00 | no |
| Avocado | 2 | 0.79 | no |

BoomBox is the case that matters: it has more parts than the plate, and a
part-count rule would flag it. Requiring three parts additionally keeps
two-piece products — a box and its lid — out of it.

`src/components/ExportTips.tsx` carries the rest as guidance in the upload form:
export one model rather than a plate, orient it upright, use a fine tessellation
when exporting STL from CAD (0.01–0.05 mm deviation), and prefer GLB from
Blender when the model has materials worth keeping, since STL and OBJ carry
geometry alone.

### True scale

glTF units are metres by convention, but plenty of real exports arrive in millimetres or in arbitrary units. So scale is resolved in two steps:

1. The browser measures the model's bounding box when it loads (`src/lib/three/model.ts`).
2. The seller states the print's **real height at 1×**, stored on the listing.

Every renderer multiplies by `unitScaleFor(listing, measuredHeight)` before applying the buyer's chosen size. Without this, a model exported in millimetres would be placed a thousand times too small while the listing claimed centimetres.

---

## Architecture

```
src/
  app/
    page.tsx                    Browse: search, category filter, grid
    listing/[id]/page.tsx       Product page (3D preview + variants + AR)
    sell/                       Seller dashboard, upload, edit
    login/, register/
    api/
      auth/{register,login,logout}
      listings/                 GET list, POST create
      listings/[id]/            GET, PATCH, DELETE (owner only)
      upload/                   Multipart intake (local dev)
      upload/blob/              Scoped token for browser-direct Blob upload
  components/
    ModelPreview.tsx            three.js turntable viewer
    ArLauncher.tsx              WebXR session, hit-test, gestures, overlay UI
    ProductExperience.tsx       Buyer-side colour/size state
    ListingForm.tsx             Seller upload/edit form
    ModelThumb.tsx              Lazy fallback thumbnail
    QuickLookButton.tsx         iOS AR entry point
    ExportTips.tsx              Seller export guidance
  lib/
    three/model.ts              Loading, re-anchoring, measuring, tinting
    three/thumbnailer.ts        Shared single-context thumbnail renderer
    three/usdz.ts               In-browser USDZ export for iOS Quick Look
    three/convert.ts            STL / OBJ / 3MF -> glb, in the browser
    three/inspect.ts            Build-plate detection via connected components
    three/finishes.ts           Per-material PBR surface finishes
    auth.ts                     JWT session cookie + bcrypt
    storage.ts                  Upload validation + local-disk driver
prisma/
  schema.prisma                 User, Listing, ColorOption, SizeOption
  seed.ts                       Demo catalogue
legacy/
  ar-viewer.html                The original single-file model-viewer prototype
```

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · three.js · Prisma + Postgres (Neon) · Vercel Blob.

### Colour rendering

Applying a colour clones the model's materials, tints every one, and pushes the finish toward matte (`roughness 0.72`, `metalness 0`) — because an FDM print in one filament is matte, and a glossy authored material recoloured "Matte Black" would read as painted plastic. Sellers can offer an **As-is** option that keeps the authored materials untouched.

### Why uploads can look flat, and what fixes it

An STL or OBJ carries no material data at all — only triangles. So a converted
upload starts as one flat white material at uniform roughness, which gives light
nothing to vary across, next to an authored PBR asset with base-colour, normal,
roughness and occlusion maps. Three things narrow that gap:

- **Crease-angle normals** (`src/lib/three/convert.ts`). STL stores one flat
  normal per triangle, so curves render faceted. Normals are discarded, vertices
  welded by position, then rebuilt with a 35° crease threshold — curves smooth,
  real edges stay sharp.
- **Print finishes** (`src/lib/three/finishes.ts`). Every listing already
  records its material, and the renderer used to ignore it. Now resin reads
  smooth, wood-fill chalky, silk PLA pearlescent. Applied wherever colour is,
  so it reaches the preview *and* the exported USDZ.
- **Ambient occlusion** (`GTAOPass` in `ModelPreview`). Contact shading is most
  of what makes an untextured print read as solid rather than as a silhouette.
  Preview only — iOS Quick Look renders the USDZ itself, so post-processing
  cannot follow it there.

**What still can't be fixed by rendering:** a model exported as a *build plate*
— several copies laid out side by side — will be framed as one wide object,
because that is genuinely what the file contains. A listing should be a single
model, oriented upright, centred near the origin.

### Thumbnails

The seller form captures a frame of the live preview at publish time and uploads it as the listing poster — no separate image upload. Listings with no poster (the seeded rows, or a failed capture) fall back to `ModelThumb`, which renders them lazily through one shared WebGL context, one model at a time. A grid must never open sixty contexts; browsers cap at roughly sixteen and silently drop the oldest.

---

## Deploying (Vercel)

The project targets Vercel with Neon Postgres and Vercel Blob. Three pieces of
setup, all in the Vercel dashboard:

**1. Database.** Storage → Create Database → Neon. It injects `DATABASE_URL`
and `DATABASE_URL_UNPOOLED` into the project automatically. Then create the
tables once, from your machine:

```bash
npx vercel env pull .env && npm run setup
```

**2. Blob storage.** Storage → Create → Blob, then connect it to the project.

Connecting injects `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY`, and the
`@vercel/blob` SDK will happily authenticate with those over OIDC using the
`VERCEL_OIDC_TOKEN` that Vercel supplies automatically. **That is not enough
here.** OIDC covers a server-side `put()`, but `handleUpload` — the function
that mints tokens for browser-direct uploads — reads only
`BLOB_READ_WRITE_TOKEN` and has no OIDC fallback. Since every upload in this
app is browser-direct (see below), you must add that variable by hand: open
the Blob store, copy its read-write token, and add it under Settings →
Environment Variables.

Without it the app believes it is running locally, falls back to writing into
`public/uploads`, and fails on Vercel's read-only filesystem. `saveUpload`
detects that case and says so explicitly rather than surfacing an `EROFS`.

**3. `AUTH_SECRET`.** Settings → Environment Variables. This one is *not*
injected for you, and the app cannot start without it: the root layout reads
the session on every request, so an unset value returns 500 on every page, not
just the seller ones.

```bash
openssl rand -base64 32
```

### Why uploads bypass the API route

Vercel caps serverless request bodies at **4.5 MB**. Print models routinely
exceed that, so a 50 MB `.glb` could never travel through `/api/upload`.
Instead `/api/upload/blob` issues a short-lived scoped token and the browser
uploads straight to Blob storage, with multipart and retry for files over 8 MB.
That token route is the only authorisation checkpoint in the flow, so it checks
the session and the file extension before issuing anything.

Locally, with no `BLOB_READ_WRITE_TOKEN`, the same form falls back to posting
multipart to `/api/upload`, which writes into `public/uploads`. The two paths
share their validation rules in `src/lib/storage.ts` so they cannot drift.

`.github/workflows/static.yml` is disabled: GitHub Pages serves static files
only and cannot run API routes, uploads or a database.

### Environment

| Variable | Injected by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Neon integration | Pooled Postgres connection, used at runtime. |
| `DATABASE_URL_UNPOOLED` | Neon integration | Direct connection for `prisma db push`; DDL through a pooler is unreliable. |
| `BLOB_STORE_ID` | Blob integration | Identifies the store for OIDC auth. Not sufficient on its own. |
| `BLOB_READ_WRITE_TOKEN` | **you** | Required for browser-direct uploads; `handleUpload` accepts no OIDC fallback. |
| `AUTH_SECRET` | **you** | Signs the session JWT. Required — every page fails without it. |

---

## Not built

Scoped out deliberately, so it's clear what's missing rather than half-present:

- **Payments and checkout.** Listings show a price; there is no cart or order flow.
- **Reviews, messaging, seller payouts.**
- **CAD tessellation.** STEP/IGES/SLDPRT are rejected with guidance to export STL; see above.
- **Image moderation or model virus scanning.** Uploads are validated by extension and size only.
