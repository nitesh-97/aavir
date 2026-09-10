import * as THREE from "three";

/**
 * Looks at what a seller actually uploaded and reports anything that will make
 * a poor listing — chiefly a printer build plate: several copies or parts laid
 * out side by side, which is what you send to a slicer, not what a buyer wants
 * to see placed in their room.
 *
 * Detection walks connected components rather than counting meshes, because a
 * plate is very often a single mesh containing several disconnected shells; by
 * the time it has been through an STL round-trip there are no object boundaries
 * left to count.
 */

export type ModelReport = {
  /** Distinct solid bodies, ignoring negligible fragments. */
  parts: number;
  /** True when those parts sit side by side on a shared base. */
  plateLike: boolean;
  /** Footprint of everything together, in centimetres. */
  footprintCm: { width: number; depth: number };
  /** Share of the total footprint occupied by the largest single part. */
  largestPartShare: number;
};

/** Above this, component analysis is skipped rather than freezing the tab. */
const MAX_VERTICES = 2_000_000;

/** Fragments smaller than this share of the model's diagonal are ignored. */
const NEGLIGIBLE_DIAGONAL_SHARE = 0.02;

class DisjointSet {
  private parent: Int32Array;

  constructor(size: number) {
    this.parent = new Int32Array(size);
    for (let i = 0; i < size; i += 1) this.parent[i] = i;
  }

  find(value: number): number {
    let node = value;
    while (this.parent[node] !== node) {
      this.parent[node] = this.parent[this.parent[node]]; // path halving
      node = this.parent[node];
    }
    return node;
  }

  union(a: number, b: number) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}

type Component = { box: THREE.Box3 };

/**
 * Groups a mesh's triangles into connected bodies.
 *
 * Vertices are welded by quantised position first: an STL stores every triangle
 * independently, so without welding each triangle would look like its own
 * component and every model would appear to be a plate.
 */
function componentsOf(mesh: THREE.Mesh, weldTolerance: number): Component[] {
  const position = mesh.geometry.getAttribute("position");
  if (!position) return [];

  const count = position.count;
  const index = mesh.geometry.getIndex();
  const triangleCount = index ? index.count / 3 : count / 3;

  const weld = new Map<string, number>();
  const canonical = new Int32Array(count);
  const inverse = Math.max(weldTolerance, 1e-9);

  for (let i = 0; i < count; i += 1) {
    const key = `${Math.round(position.getX(i) / inverse)},${Math.round(
      position.getY(i) / inverse,
    )},${Math.round(position.getZ(i) / inverse)}`;
    const existing = weld.get(key);
    if (existing === undefined) {
      weld.set(key, i);
      canonical[i] = i;
    } else {
      canonical[i] = existing;
    }
  }

  const sets = new DisjointSet(count);
  for (let t = 0; t < triangleCount; t += 1) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    sets.union(canonical[a], canonical[b]);
    sets.union(canonical[b], canonical[c]);
  }

  mesh.updateWorldMatrix(true, false);
  const boxes = new Map<number, THREE.Box3>();
  const vertex = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    const root = sets.find(canonical[i]);
    vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const box = boxes.get(root);
    if (box) box.expandByPoint(vertex);
    else boxes.set(root, new THREE.Box3().setFromPoints([vertex.clone()]));
  }

  return [...boxes.values()].map((box) => ({ box }));
}

export function analyseModel(root: THREE.Object3D): ModelReport | null {
  const meshes: THREE.Mesh[] = [];

  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.getAttribute("position")) return;
    meshes.push(mesh);
  });

  if (meshes.length === 0) return null;

  const overall = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  overall.getSize(size);
  const diagonal = size.length();
  if (diagonal === 0) return null;

  const footprintCm = {
    width: Math.round(size.x * 1000) / 10,
    depth: Math.round(size.z * 1000) / 10,
  };

  let components: Component[];

  if (meshes.length > 1) {
    // Separate mesh objects are separate bodies already. Splitting them further
    // would also mean re-analysing shared geometry once per instance — a plate
    // is frequently one geometry referenced by many nodes.
    components = meshes.map((mesh) => ({
      box: new THREE.Box3().setFromObject(mesh),
    }));
  } else {
    // A single mesh may still hold several disconnected shells, which is what a
    // plate looks like after an STL round-trip has erased object boundaries.
    const only = meshes[0];
    const vertices = only.geometry.getAttribute("position").count;
    if (vertices > MAX_VERTICES) return null;
    components = componentsOf(only, diagonal / 10000);
  }

  // Drop specks: support scraps, stray vertices, sprue.
  const significant = components.filter((component) => {
    const componentSize = new THREE.Vector3();
    component.box.getSize(componentSize);
    return componentSize.length() / diagonal >= NEGLIGIBLE_DIAGONAL_SHARE;
  });

  if (significant.length <= 1) {
    return { parts: significant.length, plateLike: false, footprintCm, largestPartShare: 1 };
  }

  const totalFootprint = Math.max(size.x * size.z, 1e-9);
  let largestFootprint = 0;
  for (const component of significant) {
    const componentSize = new THREE.Vector3();
    component.box.getSize(componentSize);
    largestFootprint = Math.max(largestFootprint, componentSize.x * componentSize.z);
  }

  const largestPartShare = largestFootprint / totalFootprint;

  // Several bodies, none of which dominates the footprint. The share test is
  // what separates a plate from a genuine assembly: a lamp with a shade and a
  // stem is several parts too, but one of them covers most of the footprint,
  // whereas copies laid out on a bed each occupy a small slice of a wide area.
  //
  // Requiring three parts keeps two-piece products — a box and its lid — out of
  // it. Overlap between parts is deliberately not tested: packed layouts nest
  // their bounding boxes, so demanding every part be clear of every other
  // missed exactly the case this is for.
  const plateLike = significant.length >= 3 && largestPartShare < 0.4;

  return { parts: significant.length, plateLike, footprintCm, largestPartShare };
}
