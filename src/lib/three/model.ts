import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Google's hosted decoder, the same one three's own examples use. Draco- and
// meshopt-compressed glb files are common exports from Blender and Thingiverse.
const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";

let cachedLoader: GLTFLoader | null = null;

function getLoader(): GLTFLoader {
  if (cachedLoader) return cachedLoader;
  const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  cachedLoader = loader;
  return loader;
}

export type Dimensions = { width: number; height: number; depth: number };

export type LoadedModel = {
  /**
   * Wrapper whose origin sits at the centre of the model's footprint — bottom
   * centre — so it drops straight onto a detected floor and scales upward from
   * it rather than sinking through it.
   */
  object: THREE.Group;
  /** Authored size in centimetres. glTF units are metres by convention. */
  sizeCm: Dimensions;
  /** Authored size in metres, i.e. what one world unit of scale represents. */
  sizeM: Dimensions;
  dispose: () => void;
};

type MaterialSnapshot = {
  color: THREE.Color;
  roughness: number;
  metalness: number;
};

const snapshots = new WeakMap<THREE.Material, MaterialSnapshot>();

function isColorMaterial(
  material: THREE.Material,
): material is THREE.MeshStandardMaterial {
  return "color" in material && (material as THREE.MeshStandardMaterial).color instanceof THREE.Color;
}

function eachMaterial(root: THREE.Object3D, fn: (m: THREE.Material, mesh: THREE.Mesh) => void) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) fn(material, mesh);
  });
}

/**
 * Materials arrive shared across meshes and, when a loader cache is in play,
 * across model instances. Clone them so tinting one preview never bleeds into
 * another, and record the authored values so "Original" can be restored.
 */
function prepareMaterials(root: THREE.Object3D) {
  const clones = new Map<THREE.Material, THREE.Material>();

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    const clone = (material: THREE.Material) => {
      let copy = clones.get(material);
      if (!copy) {
        copy = material.clone();
        clones.set(material, copy);
        if (isColorMaterial(copy)) {
          snapshots.set(copy, {
            color: copy.color.clone(),
            roughness: copy.roughness ?? 1,
            metalness: copy.metalness ?? 0,
          });
        }
      }
      return copy;
    };

    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(clone)
      : clone(mesh.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

/**
 * Tint every material to a filament colour, or pass null to restore the
 * model's authored materials.
 *
 * A tint also flattens the finish towards matte, because that is what an FDM
 * print in a single filament actually looks like — a glossy authored material
 * recoloured "Matte Black" would otherwise read as painted plastic.
 */
export function applyColor(root: THREE.Object3D, hex: string | null) {
  eachMaterial(root, (material) => {
    if (!isColorMaterial(material)) return;
    const original = snapshots.get(material);

    if (hex == null) {
      if (original) {
        material.color.copy(original.color);
        material.roughness = original.roughness;
        material.metalness = original.metalness;
      }
    } else {
      material.color.set(hex);
      material.roughness = 0.72;
      material.metalness = 0;
    }
    material.needsUpdate = true;
  });
}

export function measure(object: THREE.Object3D): { sizeM: Dimensions; sizeCm: Dimensions } {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const sizeM = { width: size.x, height: size.y, depth: size.z };
  return {
    sizeM,
    sizeCm: {
      width: Math.round(size.x * 1000) / 10,
      height: Math.round(size.y * 1000) / 10,
      depth: Math.round(size.z * 1000) / 10,
    },
  };
}

export async function loadModel(url: string): Promise<LoadedModel> {
  const gltf = await getLoader().loadAsync(url);
  const inner = gltf.scene;

  prepareMaterials(inner);

  // Re-anchor: x/z centred on the footprint, y sitting on zero.
  const carrier = new THREE.Group();
  carrier.add(inner);
  const box = new THREE.Box3().setFromObject(carrier);
  const center = new THREE.Vector3();
  box.getCenter(center);
  carrier.position.set(-center.x, -box.min.y, -center.z);

  const object = new THREE.Group();
  object.add(carrier);

  const { sizeM, sizeCm } = measure(object);

  return {
    object,
    sizeM,
    sizeCm,
    dispose() {
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
      });
    },
  };
}
