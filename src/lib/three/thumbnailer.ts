import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadModel } from "./model";

/**
 * Renders listing thumbnails in the browser for listings that have no stored
 * poster — seeded demo rows, or an upload where the capture step failed.
 *
 * Everything shares one WebGL context and runs strictly one model at a time:
 * a grid of sixty cards must never open sixty contexts, which browsers cap at
 * roughly sixteen before they start silently dropping the oldest.
 */

const SIZE = 512;

const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

type Rig = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  key: THREE.DirectionalLight;
};

let rig: Rig | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getRig(): Rig {
  if (rig) return rig;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    // Required to read pixels back out after the render call returns.
    preserveDrawingBuffer: true,
  });
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x0b0d12, 0.8));

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);

  rig = { renderer, scene, camera, key };
  return rig;
}

async function render(url: string): Promise<string | null> {
  const { renderer, scene, camera } = getRig();
  const model = await loadModel(url);

  try {
    scene.add(model.object);

    const { width, height, depth } = model.sizeM;
    const radius = Math.max(1e-4, Math.hypot(width, height, depth) / 2);
    const fov = (camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fov / 2)) * 1.05;

    camera.near = radius / 100;
    camera.far = distance * 10;
    camera.position.set(distance * 0.5, height * 0.55 + radius * 0.45, distance * 0.85);
    camera.lookAt(0, height * 0.45, 0);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } finally {
    scene.remove(model.object);
    model.dispose();
  }
}

export function renderThumbnail(url: string): Promise<string | null> {
  const cached = cache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = inFlight.get(url);
  if (existing) return existing;

  // Chain onto the queue so only one model occupies the context at a time.
  const task = queue.then(() =>
    render(url)
      .catch(() => null)
      .then((result) => {
        cache.set(url, result);
        inFlight.delete(url);
        return result;
      }),
  );

  queue = task;
  inFlight.set(url, task);
  return task;
}
