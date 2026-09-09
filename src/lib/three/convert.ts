import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
  mergeVertices,
  toCreasedNormals,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Converts the formats print sellers actually own into glb, in their browser.
 *
 * Print files are STL far more often than glTF, so demanding glb would push a
 * conversion step onto every seller. Mesh formats are cheap to convert with
 * loaders three.js already ships, so it happens here instead — at upload time,
 * on the seller's machine, with no server cost and nothing new to install.
 *
 * CAD formats (STEP, IGES, SLDPRT, F3D) are deliberately absent. Those are
 * parametric B-rep surfaces rather than meshes, so converting means
 * tessellating, which needs OpenCascade compiled to WASM and — more to the
 * point — a quality choice only the seller can make. Their CAD tool already
 * offers that as a dialog, and they already export STL to print.
 */

export const NATIVE_EXTENSIONS = [".glb", ".gltf"] as const;
export const CONVERTIBLE_EXTENSIONS = [".stl", ".obj", ".3mf"] as const;
export const ACCEPTED_MODEL_EXTENSIONS = [
  ...NATIVE_EXTENSIONS,
  ...CONVERTIBLE_EXTENSIONS,
];

/**
 * Source files can be far larger than the upload limit, because converting
 * shrinks them: an STL repeats all three vertices of every triangle and stores
 * no index, so the glb that comes out is routinely several times smaller.
 */
export const MAX_SOURCE_BYTES = 250 * 1024 * 1024;

/**
 * STL declares no units at all, and 3MF defaults to millimetres. Both are
 * millimetres in practice, because that is what slicers work in — whereas
 * glTF is metres by convention. A wrong guess here is not fatal: the seller
 * states the true height in centimetres and everything downstream corrects
 * against that.
 */
const MM_TO_M = 0.001;

/**
 * Edges meeting at a sharper angle than this stay hard; anything shallower is
 * smoothed. 35 degrees keeps chamfers, bevels and box corners crisp while
 * letting a coarsely tessellated curve read as curved rather than faceted.
 */
const CREASE_ANGLE_RADIANS = (35 * Math.PI) / 180;

export class ConversionError extends Error {}

export function extensionOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

export function needsConversion(filename: string) {
  return (CONVERTIBLE_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

export function isAcceptedModel(filename: string) {
  return (ACCEPTED_MODEL_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

function printMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0,
  });
}

/**
 * Rebuilds normals for a mesh format that has no useful ones.
 *
 * STL is unindexed triangle soup carrying one flat normal per triangle, which
 * is why an STL of a curved object renders visibly faceted. Discarding those
 * normals first lets mergeVertices weld purely by position and recover the real
 * topology; toCreasedNormals then decides smooth versus hard per edge by angle.
 * Doing it in that order matters — merging while the flat normals are still
 * attached would weld nothing, since no two of them agree.
 */
function rebuildNormals(geometry: THREE.BufferGeometry) {
  let working = geometry;
  working.deleteAttribute("normal");

  try {
    const merged = mergeVertices(working);
    if (merged !== working) {
      working.dispose();
      working = merged;
    }
  } catch {
    // An exotic attribute layout; the unmerged geometry is still valid.
  }

  try {
    const creased = toCreasedNormals(working, CREASE_ANGLE_RADIANS);
    if (creased !== working) {
      working.dispose();
      working = creased;
    }
  } catch {
    working.computeVertexNormals();
  }

  return working;
}

function meshFromGeometry(geometry: THREE.BufferGeometry) {
  return new THREE.Mesh(rebuildNormals(geometry), printMaterial());
}

/**
 * GLTFExporter only writes Standard and Physical materials; anything else is
 * dropped to a default. OBJLoader hands back Phong, so translate first.
 */
function standardiseMaterials(root: THREE.Object3D) {
  const converted = new Map<THREE.Material, THREE.Material>();

  const convert = (material: THREE.Material): THREE.Material => {
    const asStandard = material as THREE.MeshStandardMaterial;
    if (asStandard.isMeshStandardMaterial) return material;

    let replacement = converted.get(material);
    if (replacement) return replacement;

    const source = material as THREE.MeshPhongMaterial;
    const standard = printMaterial();
    if (source.color) standard.color.copy(source.color);
    if (source.map) standard.map = source.map;
    if (source.normalMap) standard.normalMap = source.normalMap;
    standard.side = source.side;
    standard.transparent = source.transparent;
    standard.opacity = source.opacity;
    standard.name = source.name;

    replacement = standard;
    converted.set(material, replacement);
    return replacement;
  };

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(convert)
      : convert(mesh.material);
  });
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material?.dispose();
  });
}

/** Converts an STL, OBJ or 3MF file into an equivalent .glb File. */
export async function convertToGlb(file: File): Promise<File> {
  const ext = extensionOf(file.name);

  if (!needsConversion(file.name)) {
    throw new ConversionError(`Nothing to convert for "${ext || file.name}".`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ConversionError(
      `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB, above the ${
        MAX_SOURCE_BYTES / 1024 / 1024
      } MB conversion limit.`,
    );
  }

  let root: THREE.Object3D;

  try {
    if (ext === ".stl") {
      root = meshFromGeometry(new STLLoader().parse(await file.arrayBuffer()));
      root.scale.setScalar(MM_TO_M);
    } else if (ext === ".obj") {
      // OBJ carries no unit convention; Blender and most sculpting tools
      // export in metres already, so it is left alone.
      root = new OBJLoader().parse(await file.text());
    } else {
      root = new ThreeMFLoader().parse(await file.arrayBuffer());
      root.scale.setScalar(MM_TO_M);
    }
  } catch (caught) {
    console.error(caught);
    throw new ConversionError(
      `That ${ext} file could not be read. It may be corrupt, or saved in an unsupported variant.`,
    );
  }

  let meshCount = 0;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshCount += 1;
    // OBJ and 3MF may carry authored normals, which are respected. Only a mesh
    // arriving without any gets them rebuilt.
    if (ext !== ".stl" && !mesh.geometry.getAttribute("normal")) {
      mesh.geometry = rebuildNormals(mesh.geometry);
    }
  });
  if (meshCount === 0) {
    disposeTree(root);
    throw new ConversionError("That file contains no geometry.");
  }

  try {
    standardiseMaterials(root);
    root.updateMatrixWorld(true);

    const result = await new GLTFExporter().parseAsync(root, {
      binary: true,
      onlyVisible: true,
    });

    if (!(result instanceof ArrayBuffer)) {
      throw new ConversionError("Conversion produced an unexpected result.");
    }

    const glbName = `${file.name.replace(/\.[^.]+$/, "")}.glb`;
    return new File([result], glbName, { type: "model/gltf-binary" });
  } finally {
    disposeTree(root);
  }
}
