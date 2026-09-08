import {
  arr,
  hexColor,
  num,
  optionalNum,
  optionalStr,
  str,
  ValidationError,
} from "./validate";
import { CATEGORIES, MATERIALS } from "./types";

export type ParsedListing = ReturnType<typeof parseListingBody>;

/**
 * Both create and update accept the same shape. Colour and size options are
 * always sent as complete lists — the writer replaces them wholesale rather
 * than diffing, which keeps ordering and deletion trivial.
 */
export function parseListingBody(body: Record<string, unknown>) {
  const colorsRaw = arr(body.colors ?? [], "Colours");
  const sizesRaw = arr(body.sizes ?? [], "Sizes");

  if (sizesRaw.length === 0) {
    throw new ValidationError("Add at least one size option.");
  }
  if (colorsRaw.length === 0) {
    throw new ValidationError("Add at least one colour option.");
  }
  if (colorsRaw.length > 24) throw new ValidationError("That's more than 24 colours.");
  if (sizesRaw.length > 12) throw new ValidationError("That's more than 12 sizes.");

  const category = str(body.category, "Category", { max: 40 });
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    throw new ValidationError(`"${category}" isn't one of the available categories.`);
  }

  const material = str(body.material, "Material", { max: 40 });
  if (!(MATERIALS as readonly string[]).includes(material)) {
    throw new ValidationError(`"${material}" isn't one of the available materials.`);
  }

  const modelUrl = str(body.modelUrl, "3D model", { max: 500 });

  const colors = colorsRaw.map((entry, index) => {
    const color = entry as Record<string, unknown>;
    const useOriginal = Boolean(color.useOriginal);
    return {
      name: str(color.name, `Colour ${index + 1} name`, { max: 40 }),
      // "Original" keeps the authored materials, so its swatch is only a hint.
      hex: useOriginal ? "#cccccc" : hexColor(color.hex, `Colour ${index + 1}`),
      useOriginal,
      priceDelta: optionalNum(color.priceDelta, `Colour ${index + 1} price`, {
        min: -100000,
        max: 100000,
      }) ?? 0,
      position: index,
    };
  });

  const sizes = sizesRaw.map((entry, index) => {
    const size = entry as Record<string, unknown>;
    return {
      label: str(size.label, `Size ${index + 1} name`, { max: 40 }),
      scale: num(size.scale, `Size ${index + 1} scale`, { min: 0.05, max: 20 }),
      priceDelta: optionalNum(size.priceDelta, `Size ${index + 1} price`, {
        min: -100000,
        max: 100000,
      }) ?? 0,
      position: index,
    };
  });

  return {
    title: str(body.title, "Title", { min: 3, max: 120 }),
    description: optionalStr(body.description, "Description", 4000) ?? "",
    category,
    material,
    modelUrl,
    usdzUrl: optionalStr(body.usdzUrl, "USDZ file", 500),
    posterUrl: optionalStr(body.posterUrl, "Thumbnail", 500),
    basePrice: num(body.basePrice, "Price", { min: 0, max: 10_000_000 }),
    currency: str(body.currency ?? "INR", "Currency", { min: 3, max: 3 }).toUpperCase(),
    baseWidthCm: optionalNum(body.baseWidthCm, "Width", { min: 0, max: 100000 }),
    baseHeightCm: optionalNum(body.baseHeightCm, "Height", { min: 0, max: 100000 }),
    baseDepthCm: optionalNum(body.baseDepthCm, "Depth", { min: 0, max: 100000 }),
    published: body.published == null ? true : Boolean(body.published),
    colors,
    sizes,
  };
}
