/**
 * Surface finish per print material.
 *
 * Every listing already records what it is printed in, and until now the
 * renderer ignored that entirely — every print, from matte wood-fill to glossy
 * resin, was drawn with one hard-coded roughness. That is the main reason an
 * untextured upload looks dull next to an authored PBR asset: a flat colour at
 * uniform roughness gives light nothing to vary across.
 *
 * These values are applied wherever a filament colour is applied, so they reach
 * the product preview and the exported USDZ alike.
 */

export type PrintFinish = {
  /** 0 = mirror, 1 = fully diffuse. */
  roughness: number;
  /** Filaments are dielectric; only the metallic-looking silks lift above 0. */
  metalness: number;
};

export const DEFAULT_FINISH: PrintFinish = { roughness: 0.72, metalness: 0 };

const FINISHES: Record<string, PrintFinish> = {
  // Standard matte filament with a slight sheen off the layer lines.
  PLA: { roughness: 0.7, metalness: 0 },
  // Prints noticeably glossier than PLA, and slightly translucent.
  PETG: { roughness: 0.42, metalness: 0 },
  // Matte, and usually a touch rougher than PLA.
  ABS: { roughness: 0.8, metalness: 0 },
  // Flexible, satin rather than glossy.
  TPU: { roughness: 0.6, metalness: 0 },
  // No layer lines to speak of — the smoothest thing on the list.
  Resin: { roughness: 0.24, metalness: 0 },
  // Loaded with wood particles: very diffuse, almost chalky.
  "Wood-fill PLA": { roughness: 0.95, metalness: 0 },
  // Pearlescent. A little metalness is what gives silk its sheen.
  "Silk PLA": { roughness: 0.2, metalness: 0.35 },
};

export function finishFor(material: string | null | undefined): PrintFinish {
  if (!material) return DEFAULT_FINISH;
  return FINISHES[material] ?? DEFAULT_FINISH;
}
