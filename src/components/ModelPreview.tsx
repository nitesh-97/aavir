"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { applyColor, loadModel, type Dimensions, type LoadedModel } from "@/lib/three/model";

type Props = {
  src: string;
  /** Filament colour to tint with, or null to keep the model's own materials. */
  colorHex: string | null;
  /** Multiplier applied to the model's authored dimensions. */
  scale: number;
  /**
   * The largest scale the viewer can select. The camera is framed once for
   * this, so switching between sizes actually looks like a size change instead
   * of the camera silently re-fitting.
   */
  frameScale?: number;
  autoRotate?: boolean;
  className?: string;
  onMeasured?: (sizeCm: Dimensions) => void;
  /**
   * Filled with a function that renders one frame and returns it as a PNG data
   * URL — used by the seller form to generate a listing thumbnail without
   * asking for a separate upload.
   */
  captureRef?: React.RefObject<(() => string | null) | null>;
};

export function ModelPreview({
  src,
  colorHex,
  scale,
  frameScale,
  autoRotate = true,
  className,
  onMeasured,
  captureRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<LoadedModel | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<((sizeM: Dimensions, framingScale: number) => void) | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  // onMeasured is usually an inline arrow, so keep it out of effect deps.
  const onMeasuredRef = useRef(onMeasured);
  onMeasuredRef.current = onMeasured;

  // ---- Scene setup: runs once for the lifetime of the canvas. ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 4, 2.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x0b0d12, 0.7));

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ opacity: 0.4 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
    camera.position.set(0.6, 0.6, 1.2);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    // Paired with `touch-action: pan-y` on the canvas: a vertical swipe scrolls
    // the page as usual, a horizontal one orbits, and two fingers zoom. Without
    // this a tall product page becomes untouchable on a phone.
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    // Stop the camera dropping below the floor plane.
    controls.maxPolarAngle = Math.PI * 0.495;
    controlsRef.current = controls;

    /** Fit the camera and the shadow frustum around a model of this size. */
    frameRef.current = (sizeM, framingScale) => {
      const width = sizeM.width * framingScale;
      const height = sizeM.height * framingScale;
      const depth = sizeM.depth * framingScale;
      const radius = Math.max(0.05, Math.hypot(width, height, depth) / 2);

      const fov = (camera.fov * Math.PI) / 180;
      const distance = (radius / Math.sin(fov / 2)) * 1.15;

      controls.target.set(0, height * 0.45, 0);
      camera.position.set(distance * 0.55, height * 0.45 + radius * 0.55, distance * 0.85);
      camera.near = Math.max(radius / 500, 0.001);
      camera.far = distance * 20 + radius * 20;
      camera.updateProjectionMatrix();
      controls.minDistance = radius * 0.6;
      controls.maxDistance = distance * 6;
      controls.update();

      const extent = Math.max(radius * 2.5, 0.5);
      key.position.set(extent, extent * 1.6, extent);
      const shadowCam = key.shadow.camera;
      shadowCam.left = -extent;
      shadowCam.right = extent;
      shadowCam.top = extent;
      shadowCam.bottom = -extent;
      shadowCam.near = 0.01;
      shadowCam.far = extent * 8;
      shadowCam.updateProjectionMatrix();
    };

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    if (captureRef) {
      // The drawing buffer is not preserved, so render and read back in the
      // same synchronous block.
      captureRef.current = () => {
        if (!modelRef.current) return null;
        renderer.render(scene, camera);
        try {
          return canvas.toDataURL("image/png");
        } catch {
          return null;
        }
      };
    }

    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      environment.dispose();
      pmrem.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      modelRef.current?.dispose();
      modelRef.current = null;
      renderer.dispose();
      sceneRef.current = null;
      controlsRef.current = null;
      frameRef.current = null;
      if (captureRef) captureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Model swap ----
  useEffect(() => {
    let cancelled = false;
    const scene = sceneRef.current;
    if (!scene || !src) return;

    setStatus("loading");
    setMessage("");

    loadModel(src)
      .then((model) => {
        if (cancelled) {
          model.dispose();
          return;
        }
        if (modelRef.current) {
          scene.remove(modelRef.current.object);
          modelRef.current.dispose();
        }
        modelRef.current = model;
        scene.add(model.object);
        frameRef.current?.(model.sizeM, frameScale ?? scale);
        onMeasuredRef.current?.(model.sizeCm);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(error);
        setStatus("error");
        setMessage(
          "That model could not be loaded. It may be corrupt, or blocked by the host's CORS policy.",
        );
      });

    return () => {
      cancelled = true;
    };
    // scale/frameScale are read once at load time; re-framing is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // ---- Reactive props ----
  useEffect(() => {
    if (modelRef.current) applyColor(modelRef.current.object, colorHex);
  }, [colorHex, status]);

  useEffect(() => {
    modelRef.current?.object.scale.setScalar(scale);
  }, [scale, status]);

  useEffect(() => {
    const model = modelRef.current;
    if (model && frameScale) frameRef.current?.(model.sizeM, frameScale);
  }, [frameScale, status]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.1;
  }, [autoRotate, status]);

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <canvas ref={canvasRef} className="block h-full w-full touch-pan-y" />

      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-edge border-t-brand" />
            <span className="text-xs text-muted">Loading model…</span>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <p className="max-w-xs text-center text-sm text-bad">{message}</p>
        </div>
      )}
    </div>
  );
}
