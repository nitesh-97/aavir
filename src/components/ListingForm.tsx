"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ModelPreview } from "./ModelPreview";
import { CATEGORIES, MATERIALS, type ListingDTO } from "@/lib/types";
import type { Dimensions } from "@/lib/three/model";

type ColorDraft = {
  key: string;
  name: string;
  hex: string;
  useOriginal: boolean;
  priceDelta: string;
};

type SizeDraft = {
  key: string;
  label: string;
  scale: string;
  priceDelta: string;
};

const newKey = () => Math.random().toString(36).slice(2);

const DEFAULT_COLORS: ColorDraft[] = [
  { key: newKey(), name: "As modelled", hex: "#cccccc", useOriginal: true, priceDelta: "0" },
  { key: newKey(), name: "Matte Black", hex: "#1b1b1f", useOriginal: false, priceDelta: "0" },
  { key: newKey(), name: "Bone White", hex: "#efe9dd", useOriginal: false, priceDelta: "0" },
  { key: newKey(), name: "Terracotta", hex: "#c4633b", useOriginal: false, priceDelta: "0" },
];

const DEFAULT_SIZES: SizeDraft[] = [
  { key: newKey(), label: "Small", scale: "0.7", priceDelta: "-200" },
  { key: newKey(), label: "Standard", scale: "1", priceDelta: "0" },
  { key: newKey(), label: "Large", scale: "1.5", priceDelta: "450" },
];

async function uploadFile(file: File, kind: "model" | "usdz" | "image") {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);

  const response = await fetch("/api/upload", { method: "POST", body });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error ?? "Upload failed.");
  return json.url as string;
}

export function ListingForm({ existing }: { existing?: ListingDTO }) {
  const router = useRouter();
  const isEdit = Boolean(existing);

  const [modelUrl, setModelUrl] = useState(existing?.modelUrl ?? "");
  const [modelName, setModelName] = useState(existing ? "Current model" : "");
  const [usdzUrl, setUsdzUrl] = useState(existing?.usdzUrl ?? "");
  const [posterUrl, setPosterUrl] = useState(existing?.posterUrl ?? "");

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [category, setCategory] = useState(existing?.category ?? CATEGORIES[0]);
  const [material, setMaterial] = useState(existing?.material ?? MATERIALS[0]);
  const [basePrice, setBasePrice] = useState(String(existing?.basePrice ?? ""));
  const [currency, setCurrency] = useState(existing?.currency ?? "INR");
  const [published, setPublished] = useState(existing?.published ?? true);

  const [colors, setColors] = useState<ColorDraft[]>(
    existing
      ? existing.colors.map((c) => ({
          key: newKey(),
          name: c.name,
          hex: c.hex,
          useOriginal: c.useOriginal,
          priceDelta: String(c.priceDelta),
        }))
      : DEFAULT_COLORS,
  );

  const [sizes, setSizes] = useState<SizeDraft[]>(
    existing
      ? existing.sizes.map((s) => ({
          key: newKey(),
          label: s.label,
          scale: String(s.scale),
          priceDelta: String(s.priceDelta),
        }))
      : DEFAULT_SIZES,
  );

  // The glb supplies the proportions; the seller states the true printed
  // height. Everything real-world is derived from the two together, because a
  // great many exports are in millimetres or arbitrary units rather than metres.
  const [measured, setMeasured] = useState<Dimensions | null>(null);
  const [trueHeight, setTrueHeight] = useState(
    existing?.baseHeightCm != null ? String(existing.baseHeightCm) : "",
  );

  const correction =
    measured && measured.height > 0 && Number(trueHeight) > 0
      ? Number(trueHeight) / measured.height
      : 1;

  const baseSize: Dimensions | null = measured
    ? {
        width: Math.round(measured.width * correction * 10) / 10,
        height: Math.round(measured.height * correction * 10) / 10,
        depth: Math.round(measured.depth * correction * 10) / 10,
      }
    : null;

  const [previewColorKey, setPreviewColorKey] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(1);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureRef = useRef<(() => string | null) | null>(null);

  const previewColor = colors.find((c) => c.key === previewColorKey) ?? colors[0];
  const frameScale = Math.max(...sizes.map((s) => Number(s.scale) || 1), 1);

  async function handleModelFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadFile(file, "model");
      setModelUrl(url);
      setModelName(file.name);
      if (!title) setTitle(file.name.replace(/\.(glb|gltf)$/i, "").replace(/[-_]/g, " "));
      // A replaced model invalidates the old thumbnail and measurements.
      setPosterUrl("");
      setMeasured(null);
      setTrueHeight("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleUsdzFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      setUsdzUrl(await uploadFile(file, "usdz"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  /** Render one frame of the preview and store it as the grid thumbnail. */
  async function capturePoster(): Promise<string> {
    if (posterUrl) return posterUrl;
    const dataUrl = captureRef.current?.();
    if (!dataUrl) return "";
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "poster.png", { type: "image/png" });
      const url = await uploadFile(file, "image");
      setPosterUrl(url);
      return url;
    } catch {
      // A thumbnail is a nicety; never block publishing on it.
      return "";
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!modelUrl) {
      setError("Upload a GLB or glTF model first.");
      return;
    }

    setSaving(true);
    const poster = await capturePoster();

    const payload = {
      title,
      description,
      category,
      material,
      modelUrl,
      usdzUrl: usdzUrl || null,
      posterUrl: poster || null,
      basePrice: Number(basePrice),
      currency,
      baseWidthCm: baseSize?.width ?? null,
      baseHeightCm: baseSize?.height ?? null,
      baseDepthCm: baseSize?.depth ?? null,
      published,
      colors: colors.map((c) => ({
        name: c.name,
        hex: c.hex,
        useOriginal: c.useOriginal,
        priceDelta: Number(c.priceDelta) || 0,
      })),
      sizes: sizes.map((s) => ({
        label: s.label,
        scale: Number(s.scale),
        priceDelta: Number(s.priceDelta) || 0,
      })),
    };

    const response = await fetch(
      isEdit ? `/api/listings/${existing!.id}` : "/api/listings",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ).catch(() => null);

    if (!response) {
      setError("Could not reach the server.");
      setSaving(false);
      return;
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "Could not save the listing.");
      setSaving(false);
      return;
    }

    router.push(`/listing/${body.id}`);
    router.refresh();
  }

  const scaledCm = (scale: number): Dimensions | null =>
    baseSize
      ? {
          width: Math.round(baseSize.width * scale * 10) / 10,
          height: Math.round(baseSize.height * scale * 10) / 10,
          depth: Math.round(baseSize.depth * scale * 10) / 10,
        }
      : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      {/* ---------- Left: model + preview ---------- */}
      <div className="space-y-4">
        <div className="card overflow-hidden">
          {modelUrl ? (
            <>
              <ModelPreview
                src={modelUrl}
                colorHex={previewColor?.useOriginal ? null : (previewColor?.hex ?? null)}
                scale={correction * previewScale}
                frameScale={correction * frameScale}
                captureRef={captureRef}
                className="aspect-square w-full"
                onMeasured={(sizeCm) => {
                  setMeasured(sizeCm);
                  // A fresh model proposes its own height; the seller can correct it.
                  setTrueHeight((current) => current || String(sizeCm.height));
                }}
              />
              <div className="space-y-3 border-t border-edge p-3">
                <p className="truncate text-xs text-muted">{modelName}</p>

                {measured && (
                  <div>
                    <label className="label" htmlFor="trueHeight">
                      Real height at 1× (cm)
                    </label>
                    <input
                      id="trueHeight"
                      className="field"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={trueHeight}
                      onChange={(e) => setTrueHeight(e.target.value)}
                    />
                    <p className="mt-1.5 text-xs text-muted">
                      The file measures {measured.height} cm tall if its units are metres.
                      Correct it here and AR will place the print at its real size —
                      {baseSize
                        ? ` ${baseSize.width} × ${baseSize.height} × ${baseSize.depth} cm.`
                        : "."}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-edge p-8 text-center transition hover:border-brand">
              <span className="text-4xl opacity-40">◈</span>
              <span className="font-semibold">
                {uploading ? "Uploading…" : "Drop a GLB or glTF here"}
              </span>
              <span className="text-xs text-muted">Up to 50 MB</span>
              <input
                type="file"
                accept=".glb,.gltf"
                hidden
                disabled={uploading}
                onChange={(e) => handleModelFile(e.target.files?.[0])}
              />
            </label>
          )}
        </div>

        {modelUrl && (
          <>
            <div className="card space-y-3 p-4">
              <p className="label mb-0">Preview</p>
              <div className="flex flex-wrap gap-2">
                {colors.map((color) => (
                  <button
                    key={color.key}
                    type="button"
                    title={color.name}
                    onClick={() => setPreviewColorKey(color.key)}
                    className={`h-7 w-7 rounded-full border-2 ${
                      color.key === previewColor?.key ? "border-brand" : "border-edge"
                    }`}
                    style={{
                      background: color.useOriginal
                        ? "linear-gradient(135deg,#e8ecf3,#8a93a6)"
                        : color.hex,
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((size) => (
                  <button
                    key={size.key}
                    type="button"
                    onClick={() => setPreviewScale(Number(size.scale) || 1)}
                    className={`chip ${
                      Number(size.scale) === previewScale ? "chip-on" : "text-muted"
                    }`}
                  >
                    {size.label || "Untitled"}
                  </button>
                ))}
              </div>
            </div>

            <label className="btn-ghost w-full cursor-pointer">
              {usdzUrl ? "Replace USDZ (iOS AR)" : "Add a USDZ for iOS AR (optional)"}
              <input
                type="file"
                accept=".usdz"
                hidden
                disabled={uploading}
                onChange={(e) => handleUsdzFile(e.target.files?.[0])}
              />
            </label>
            <p className="-mt-2 text-xs text-muted">
              iPhones have no WebXR, so iOS AR needs a USDZ export of the same model. Without
              one, iOS buyers still get the 3D preview.
            </p>

            <label className="btn-ghost w-full cursor-pointer">
              Replace 3D model
              <input
                type="file"
                accept=".glb,.gltf"
                hidden
                disabled={uploading}
                onChange={(e) => handleModelFile(e.target.files?.[0])}
              />
            </label>
          </>
        )}
      </div>

      {/* ---------- Right: details ---------- */}
      <div className="space-y-6">
        <div className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input
              id="title"
              className="field"
              required
              minLength={3}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Faceted Planter"
            />
          </div>

          <div>
            <label className="label" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              className="field min-h-24"
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Printed in 0.2 mm layers, drainage hole included…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="category">
                Category
              </label>
              <select
                id="category"
                className="field"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="material">
                Material
              </label>
              <select
                id="material"
                className="field"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              >
                {MATERIALS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <div>
              <label className="label" htmlFor="basePrice">
                Base price
              </label>
              <input
                id="basePrice"
                className="field"
                type="number"
                min={0}
                step="0.01"
                required
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="1499"
              />
            </div>
            <div>
              <label className="label" htmlFor="currency">
                Currency
              </label>
              <input
                id="currency"
                className="field uppercase"
                maxLength={3}
                minLength={3}
                required
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
        </div>

        {/* Colours */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Colours</h2>
            <button
              type="button"
              className="btn-ghost px-3 py-1 text-xs"
              onClick={() =>
                setColors((current) => [
                  ...current,
                  {
                    key: newKey(),
                    name: "New colour",
                    hex: "#6c8cff",
                    useOriginal: false,
                    priceDelta: "0",
                  },
                ])
              }
            >
              Add colour
            </button>
          </div>

          <ul className="space-y-2">
            {colors.map((color, index) => (
              <li key={color.key} className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${color.name} swatch`}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded border border-edge bg-panel-2 disabled:opacity-40"
                  value={color.hex}
                  disabled={color.useOriginal}
                  onChange={(e) =>
                    setColors((current) =>
                      current.map((c, i) => (i === index ? { ...c, hex: e.target.value } : c)),
                    )
                  }
                />
                <input
                  className="field flex-1"
                  aria-label="Colour name"
                  value={color.name}
                  maxLength={40}
                  onChange={(e) =>
                    setColors((current) =>
                      current.map((c, i) => (i === index ? { ...c, name: e.target.value } : c)),
                    )
                  }
                />
                <input
                  className="field w-24"
                  aria-label="Price difference"
                  type="number"
                  step="0.01"
                  value={color.priceDelta}
                  onChange={(e) =>
                    setColors((current) =>
                      current.map((c, i) =>
                        i === index ? { ...c, priceDelta: e.target.value } : c,
                      ),
                    )
                  }
                />
                <label
                  className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-muted"
                  title="Keep the model's own materials instead of tinting"
                >
                  <input
                    type="checkbox"
                    checked={color.useOriginal}
                    onChange={(e) =>
                      setColors((current) =>
                        current.map((c, i) =>
                          i === index ? { ...c, useOriginal: e.target.checked } : c,
                        ),
                      )
                    }
                  />
                  As-is
                </label>
                <button
                  type="button"
                  aria-label={`Remove ${color.name}`}
                  className="shrink-0 px-1.5 text-muted hover:text-bad disabled:opacity-30"
                  disabled={colors.length <= 1}
                  onClick={() =>
                    setColors((current) => current.filter((_, i) => i !== index))
                  }
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            The price column is the difference from the base price. &ldquo;As-is&rdquo; keeps
            the textures the model was authored with.
          </p>
        </div>

        {/* Sizes */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Sizes</h2>
            <button
              type="button"
              className="btn-ghost px-3 py-1 text-xs"
              onClick={() =>
                setSizes((current) => [
                  ...current,
                  { key: newKey(), label: "New size", scale: "1", priceDelta: "0" },
                ])
              }
            >
              Add size
            </button>
          </div>

          <ul className="space-y-2">
            {sizes.map((size, index) => {
              const dims = scaledCm(Number(size.scale) || 1);
              return (
                <li key={size.key} className="flex items-center gap-2">
                  <input
                    className="field flex-1"
                    aria-label="Size name"
                    value={size.label}
                    maxLength={40}
                    onChange={(e) =>
                      setSizes((current) =>
                        current.map((s, i) =>
                          i === index ? { ...s, label: e.target.value } : s,
                        ),
                      )
                    }
                  />
                  <input
                    className="field w-20"
                    aria-label="Scale multiplier"
                    type="number"
                    step="0.05"
                    min="0.05"
                    max="20"
                    value={size.scale}
                    onChange={(e) =>
                      setSizes((current) =>
                        current.map((s, i) =>
                          i === index ? { ...s, scale: e.target.value } : s,
                        ),
                      )
                    }
                  />
                  <input
                    className="field w-24"
                    aria-label="Price difference"
                    type="number"
                    step="0.01"
                    value={size.priceDelta}
                    onChange={(e) =>
                      setSizes((current) =>
                        current.map((s, i) =>
                          i === index ? { ...s, priceDelta: e.target.value } : s,
                        ),
                      )
                    }
                  />
                  <span className="w-28 shrink-0 text-right text-[11px] text-muted">
                    {dims ? `${dims.width}×${dims.height}×${dims.depth} cm` : "—"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${size.label}`}
                    className="shrink-0 px-1.5 text-muted hover:text-bad disabled:opacity-30"
                    disabled={sizes.length <= 1}
                    onClick={() => setSizes((current) => current.filter((_, i) => i !== index))}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Scale multiplies the model&rsquo;s own dimensions. The centimetre figures are what
            buyers see in AR, so they should match what you actually ship.
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Publish to the marketplace
        </label>

        {error && <p className="text-sm text-bad">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            className="btn-primary flex-1 py-3"
            disabled={saving || uploading || !modelUrl}
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Publish listing"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
