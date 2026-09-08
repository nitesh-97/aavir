/** Plain shapes shared between server components and client components. */

export type ColorOptionDTO = {
  id: string;
  name: string;
  hex: string;
  useOriginal: boolean;
  priceDelta: number;
};

export type SizeOptionDTO = {
  id: string;
  label: string;
  /** Multiplies the model's authored dimensions. */
  scale: number;
  priceDelta: number;
};

export type ListingDTO = {
  id: string;
  title: string;
  description: string;
  category: string;
  material: string;
  modelUrl: string;
  usdzUrl: string | null;
  posterUrl: string | null;
  basePrice: number;
  currency: string;
  baseWidthCm: number | null;
  baseHeightCm: number | null;
  baseDepthCm: number | null;
  published: boolean;
  sellerId: string;
  sellerName: string;
  createdAt: string;
  colors: ColorOptionDTO[];
  sizes: SizeOptionDTO[];
};

export const CATEGORIES = [
  "Decor",
  "Planters",
  "Lighting",
  "Desk & Office",
  "Toys & Games",
  "Kitchen",
  "Storage",
  "Art",
  "Functional",
] as const;

export const MATERIALS = ["PLA", "PETG", "ABS", "TPU", "Resin", "Wood-fill PLA", "Silk PLA"] as const;

/** Dimensions in centimetres, i.e. the model's own size times the chosen scale. */
export function scaledDimensions(
  listing: Pick<ListingDTO, "baseWidthCm" | "baseHeightCm" | "baseDepthCm">,
  scale: number,
) {
  const round = (v: number | null) => (v == null ? null : Math.round(v * scale * 10) / 10);
  return {
    width: round(listing.baseWidthCm),
    height: round(listing.baseHeightCm),
    depth: round(listing.baseDepthCm),
  };
}

/**
 * glTF units are metres by convention, but plenty of real exports come out in
 * millimetres or in arbitrary units. The seller states the print's true height,
 * so every renderer multiplies the loaded model by this correction before
 * applying the chosen size — otherwise "true scale" in AR would be a lie.
 */
export function unitScaleFor(
  listing: Pick<ListingDTO, "baseHeightCm">,
  measuredHeightCm: number | null | undefined,
) {
  if (!listing.baseHeightCm || !measuredHeightCm) return 1;
  return listing.baseHeightCm / measuredHeightCm;
}

/**
 * Renders whatever dimensions are known. A listing may carry only a height —
 * width and depth are measured in the browser and filled in on first save — so
 * this degrades to "18 cm tall" rather than showing nothing.
 */
export function formatDimensions(dims: {
  width: number | null;
  height: number | null;
  depth: number | null;
}) {
  if (dims.width != null && dims.height != null && dims.depth != null) {
    return `${dims.width} × ${dims.height} × ${dims.depth} cm`;
  }
  if (dims.height != null) return `${dims.height} cm tall`;
  return null;
}

export function priceFor(
  listing: Pick<ListingDTO, "basePrice">,
  color: Pick<ColorOptionDTO, "priceDelta"> | null | undefined,
  size: Pick<SizeOptionDTO, "priceDelta"> | null | undefined,
) {
  return listing.basePrice + (color?.priceDelta ?? 0) + (size?.priceDelta ?? 0);
}

export function formatPrice(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
