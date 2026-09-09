import * as THREE from "three";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import { applyColor, loadModel } from "./model";

/**
 * Builds a USDZ in the browser so iOS can open it in AR Quick Look.
 *
 * iOS Safari has no WebXR, and Quick Look only accepts USDZ, which cannot be
 * produced from a GLB server-side without Apple's USD tooling. Exporting from
 * the already-loaded three.js scene sidesteps that entirely — and because the
 * export happens after the colour and scale are applied, the buyer's actual
 * selection is baked into the file rather than being lost, which is what a
 * seller-uploaded static USDZ could never do.
 */

export type UsdzRequest = {
  modelUrl: string;
  /** Filament colour, or null to keep the model's authored materials. */
  colorHex: string | null;
  /** The seller's size multiplier. */
  sizeScale: number;
  /** The listing's real height at 1x, in centimetres, if it is known. */
  baseHeightCm: number | null;
};

export function usdzCacheKey(request: UsdzRequest) {
  return [
    request.modelUrl,
    request.colorHex ?? "original",
    request.sizeScale,
    request.baseHeightCm ?? "unmeasured",
  ].join("|");
}

export async function buildUsdz(request: UsdzRequest): Promise<Blob> {
  const model = await loadModel(request.modelUrl);

  try {
    applyColor(model.object, request.colorHex);

    // USDZExporter wires the base-colour texture straight into diffuseColor and
    // ignores material.color, so on a textured model the chosen filament would
    // silently disappear. Drop that one map when a tint is in play — a print in
    // a single filament has no base-colour texture anyway. Normal, roughness
    // and AO maps stay, so the surface keeps its detail.
    if (request.colorHex !== null) {
      model.object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const standard = material as THREE.MeshStandardMaterial;
          if (standard.map) {
            standard.map = null;
            standard.needsUpdate = true;
          }
        }
      });
    }

    // USDZ carries real-world units, so the same correction the live renderers
    // use has to be applied here or Quick Look would place the print at the
    // file's authored scale rather than its true size.
    const unitScale =
      request.baseHeightCm && model.sizeCm.height
        ? request.baseHeightCm / model.sizeCm.height
        : 1;
    model.object.scale.setScalar(unitScale * request.sizeScale);
    model.object.updateMatrixWorld(true);

    const exporter = new USDZExporter();
    const bytes = await exporter.parseAsync(model.object, {
      quickLookCompatible: true,
      includeAnchoringProperties: true,
      ar: {
        anchoring: { type: "plane" },
        planeAnchoring: { alignment: "horizontal" },
      },
    });

    return new Blob([bytes], { type: "model/vnd.usdz+zip" });
  } finally {
    model.dispose();
  }
}
