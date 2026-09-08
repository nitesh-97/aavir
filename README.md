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
| iOS Safari | **AR Quick Look**, only if the seller uploaded a `.usdz` | Handled by iOS | Handled by iOS | No — Quick Look shows the exported file as-is |
| Desktop / anything else | No AR | — | — | — |

Everything except the iOS row is built in `src/components/ArLauncher.tsx`.

**Why the split:** iOS Safari does not implement WebXR at all, and Quick Look needs a USDZ, which cannot be produced from a GLB in the browser. The seller form therefore accepts an optional USDZ upload, and the buyer-facing copy says plainly that Quick Look will not carry the chosen colour. Where a device has no AR at all, the 3D viewer stays fully usable and the UI explains why.

### Gestures once placed

- **One finger drag** — slides the print along the floor. Movement is converted from pixels to metres using the XR camera's own projection, so a drag tracks the finger at the object's actual depth.
- **Two finger twist** — turns it about its vertical axis.
- **Move to a new spot** — returns the reticle so the next tap re-places it.

Pinch-to-zoom is deliberately **not** wired up. Size comes only from the seller's size options, which carry real centimetre figures — a free-scale gesture would quietly break the one promise the product makes. To add it anyway, give the placed group a user scale in `ArLauncher.tsx` and multiply it into the size effect.

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
  lib/
    three/model.ts              Loading, re-anchoring, measuring, tinting
    three/thumbnailer.ts        Shared single-context thumbnail renderer
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

**2. Blob storage.** Storage → Create → Blob. It injects
`BLOB_READ_WRITE_TOKEN`. Nothing else to configure — the app switches to
browser-direct uploads as soon as that variable is present.

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
| `BLOB_READ_WRITE_TOKEN` | Blob integration | Presence of this switches uploads to browser-direct Blob. |
| `AUTH_SECRET` | **you** | Signs the session JWT. Required — every page fails without it. |

---

## Not built

Scoped out deliberately, so it's clear what's missing rather than half-present:

- **Payments and checkout.** Listings show a price; there is no cart or order flow.
- **Reviews, messaging, seller payouts.**
- **GLB → USDZ conversion.** Needs Apple's USD tooling server-side; sellers upload USDZ themselves.
- **Image moderation or model virus scanning.** Uploads are validated by extension and size only.
