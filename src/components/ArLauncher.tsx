"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight.js";
import { applyColor, loadModel, type LoadedModel } from "@/lib/three/model";
import {
  formatDimensions,
  formatPrice,
  priceFor,
  scaledDimensions,
  unitScaleFor,
} from "@/lib/types";
import type { ColorOptionDTO, ListingDTO, SizeOptionDTO } from "@/lib/types";

type Support = "checking" | "supported" | "unsupported";
type Phase = "idle" | "starting" | "scanning" | "placed";

type Props = {
  listing: ListingDTO;
  color: ColorOptionDTO;
  size: SizeOptionDTO;
  onColorChange: (color: ColorOptionDTO) => void;
  onSizeChange: (size: SizeOptionDTO) => void;
};

const UP = new THREE.Vector3(0, 1, 0);

export function ArLauncher({ listing, color, size, onColorChange, onSizeChange }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const [support, setSupport] = useState<Support>("checking");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"colors" | "sizes" | null>(null);

  // The render loop and the touch handlers live outside React, so they read the
  // current selection through refs rather than through closed-over props.
  const modelRef = useRef<LoadedModel | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const shadowRef = useRef<THREE.Mesh | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const placedRef = useRef(false);
  /** Corrects models that were not authored in metres. Set once, at load. */
  const unitScaleRef = useRef(1);

  const colorHex = color.useOriginal ? null : color.hex;

  // ---- Capability probe ----
  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === "undefined" || !navigator.xr) {
      setSupport("unsupported");
      return;
    }
    navigator.xr
      .isSessionSupported("immersive-ar")
      .then((ok) => !cancelled && setSupport(ok ? "supported" : "unsupported"))
      .catch(() => !cancelled && setSupport("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Live edits to the placed object ----
  useEffect(() => {
    if (modelRef.current) applyColor(modelRef.current.object, colorHex);
  }, [colorHex, phase]);

  useEffect(() => {
    const model = modelRef.current;
    const shadow = shadowRef.current;
    if (!model) return;
    const effective = unitScaleRef.current * size.scale;
    model.object.scale.setScalar(effective);
    if (shadow) {
      const footprint = Math.max(model.sizeM.width, model.sizeM.depth) * effective * 2.6;
      shadow.scale.set(Math.max(footprint, 0.15), Math.max(footprint, 0.15), 1);
    }
  }, [size.scale, phase]);

  const endSession = useCallback(() => {
    sessionRef.current?.end().catch(() => {
      /* already ending */
    });
  }, []);

  // ---- Session start ----
  const startAr = useCallback(async () => {
    const overlay = overlayRef.current;
    if (!overlay || !navigator.xr || phase !== "idle") return;

    setError(null);
    setPhase("starting");

    // Rendering happens in the XR compositor; this canvas only owns the context.
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;";
    document.body.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 40);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const defaultEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = defaultEnvironment;

    // When the device reports real lighting, use it — it is the single biggest
    // factor in whether the print looks like it is actually in the room.
    const estimatedLight = new XREstimatedLight(renderer);
    estimatedLight.addEventListener("estimationstart", () => {
      scene.add(estimatedLight);
      if (estimatedLight.environment) scene.environment = estimatedLight.environment;
    });
    estimatedLight.addEventListener("estimationend", () => {
      scene.remove(estimatedLight);
      scene.environment = defaultEnvironment;
    });

    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0006;
    sun.shadow.camera.near = 0.01;
    sun.shadow.camera.far = 12;
    sun.shadow.camera.left = -1.5;
    sun.shadow.camera.right = 1.5;
    sun.shadow.camera.top = 1.5;
    sun.shadow.camera.bottom = -1.5;
    scene.add(sun);
    scene.add(sun.target);

    const reticle = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.075, 0.095, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x6c8cff, transparent: true, opacity: 0.95 }),
    );
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.012, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
    );
    reticle.add(ring, dot);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    groupRef.current = group;
    placedRef.current = false;

    const shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ opacity: 0.32 }),
    );
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.0015; // avoid z-fighting with the detected plane
    shadowCatcher.receiveShadow = true;
    group.add(shadowCatcher);
    shadowRef.current = shadowCatcher;

    let hitTestSource: XRHitTestSource | undefined;
    let session: XRSession | undefined;

    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      try {
        hitTestSource?.cancel();
      } catch {
        /* source already released with the session */
      }
      overlay.removeEventListener("touchstart", onTouchStart);
      overlay.removeEventListener("touchmove", onTouchMove);
      overlay.removeEventListener("touchend", onTouchEnd);

      modelRef.current?.dispose();
      modelRef.current = null;
      groupRef.current = null;
      shadowRef.current = null;
      sessionRef.current = null;
      placedRef.current = false;

      shadowCatcher.geometry.dispose();
      (shadowCatcher.material as THREE.Material).dispose();
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      dot.geometry.dispose();
      (dot.material as THREE.Material).dispose();
      defaultEnvironment.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
      overlay.style.display = "none";

      setPhase("idle");
      setPanel(null);
    };

    // ---- Gestures, driven from the DOM overlay ----
    const cameraPosition = new THREE.Vector3();
    const cameraQuaternion = new THREE.Quaternion();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    /** Metres of world movement per pixel of finger travel at the object's depth. */
    const metresPerPixel = () => {
      const xrCamera = renderer.xr.getCamera();
      const view = xrCamera.cameras[0] ?? xrCamera;
      xrCamera.getWorldPosition(cameraPosition);
      const distance = Math.max(0.25, cameraPosition.distanceTo(group.position));
      const tanHalfFov = 1 / view.projectionMatrix.elements[5];
      return (2 * distance * tanHalfFov) / window.innerHeight;
    };

    const moveBy = (dx: number, dy: number) => {
      const scale = metresPerPixel();
      const xrCamera = renderer.xr.getCamera();
      xrCamera.getWorldQuaternion(cameraQuaternion);

      forward.set(0, 0, -1).applyQuaternion(cameraQuaternion);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) return; // camera pointing straight down
      forward.normalize();
      right.crossVectors(forward, UP).normalize();

      // Dragging down pulls the object toward the viewer, which is the opposite
      // of the camera's forward axis.
      group.position.addScaledVector(right, dx * scale);
      group.position.addScaledVector(forward, -dy * scale);
    };

    const placeAtReticle = () => {
      if (!reticle.visible) return;
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scaleOut = new THREE.Vector3();
      reticle.matrix.decompose(position, rotation, scaleOut);

      group.position.copy(position);

      // Face the viewer on placement; the hit-test orientation is ignored so a
      // print never lands tilted.
      renderer.xr.getCamera().getWorldPosition(cameraPosition);
      group.rotation.y = Math.atan2(
        cameraPosition.x - position.x,
        cameraPosition.z - position.z,
      );

      group.visible = true;
      reticle.visible = false;
      placedRef.current = true;
      setPhase("placed");
    };

    let gesture: "none" | "move" | "twist" = "none";
    let lastX = 0;
    let lastY = 0;
    let lastAngle = 0;
    let dragged = false;

    const twistAngle = (touches: TouchList) =>
      Math.atan2(
        touches[1].clientY - touches[0].clientY,
        touches[1].clientX - touches[0].clientX,
      );

    function onTouchStart(event: TouchEvent) {
      // Let the overlay buttons handle their own taps.
      if ((event.target as HTMLElement).closest("button")) return;

      if (event.touches.length === 1) {
        gesture = "move";
        lastX = event.touches[0].clientX;
        lastY = event.touches[0].clientY;
        dragged = false;
      } else if (event.touches.length === 2) {
        gesture = "twist";
        lastAngle = twistAngle(event.touches);
        dragged = true;
      }
    }

    function onTouchMove(event: TouchEvent) {
      if (gesture === "none" || !placedRef.current) return;
      event.preventDefault();

      if (gesture === "move" && event.touches.length === 1) {
        const dx = event.touches[0].clientX - lastX;
        const dy = event.touches[0].clientY - lastY;
        lastX = event.touches[0].clientX;
        lastY = event.touches[0].clientY;
        if (Math.abs(dx) + Math.abs(dy) > 1.5) dragged = true;
        moveBy(dx, dy);
      } else if (gesture === "twist" && event.touches.length === 2) {
        const angle = twistAngle(event.touches);
        // Screen-space clockwise reads as clockwise from above, which is a
        // negative rotation about +Y.
        group.rotation.y -= angle - lastAngle;
        lastAngle = angle;
      }
    }

    function onTouchEnd(event: TouchEvent) {
      if (gesture === "move" && !dragged && !placedRef.current) placeAtReticle();
      if (event.touches.length === 0) gesture = "none";
      else if (event.touches.length === 1) {
        gesture = "move";
        lastX = event.touches[0].clientX;
        lastY = event.touches[0].clientY;
      }
    }

    try {
      const model = await loadModel(listing.modelUrl);
      modelRef.current = model;
      unitScaleRef.current = unitScaleFor(listing, model.sizeCm.height);

      applyColor(model.object, color.useOriginal ? null : color.hex);
      const effective = unitScaleRef.current * size.scale;
      model.object.scale.setScalar(effective);
      group.add(model.object);

      const footprint = Math.max(model.sizeM.width, model.sizeM.depth) * effective * 2.6;
      shadowCatcher.scale.set(Math.max(footprint, 0.15), Math.max(footprint, 0.15), 1);

      // The overlay root has to be displayed at request time — a display:none
      // element is not a valid dom-overlay root. React sets this too, on the
      // next render, but the session is requested before that lands.
      overlay.style.display = "flex";

      session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay", "light-estimation"],
        domOverlay: { root: overlay },
      });
      sessionRef.current = session;

      renderer.xr.setReferenceSpaceType("local");
      await renderer.xr.setSession(session);

      const viewerSpace = await session.requestReferenceSpace("viewer");
      hitTestSource = await session.requestHitTestSource?.({ space: viewerSpace });

      session.addEventListener("end", cleanup, { once: true });

      overlay.addEventListener("touchstart", onTouchStart, { passive: true });
      overlay.addEventListener("touchmove", onTouchMove, { passive: false });
      overlay.addEventListener("touchend", onTouchEnd, { passive: true });

      setPhase("scanning");

      renderer.setAnimationLoop((_time, frame) => {
        if (frame && hitTestSource && !placedRef.current) {
          const referenceSpace = renderer.xr.getReferenceSpace();
          const hits = referenceSpace ? frame.getHitTestResults(hitTestSource) : [];
          const pose = hits.length > 0 ? hits[0].getPose(referenceSpace!) : null;
          if (pose) {
            reticle.visible = true;
            reticle.matrix.fromArray(pose.transform.matrix);
          } else {
            reticle.visible = false;
          }
        }

        // Keep the shadow-casting sun anchored over the object.
        sun.position.set(group.position.x + 0.8, group.position.y + 2.4, group.position.z + 0.8);
        sun.target.position.copy(group.position);
        sun.target.updateMatrixWorld();

        renderer.render(scene, camera);
      });
    } catch (caught) {
      console.error(caught);
      const message =
        caught instanceof Error && caught.name === "NotAllowedError"
          ? "Camera permission is needed to place the print in your room."
          : caught instanceof Error && /load|fetch|network/i.test(caught.message)
            ? "The 3D model could not be downloaded."
            : "AR could not start on this device.";
      setError(message);
      session?.end().catch(() => {});
      cleanup();
    }
  }, [listing, color, size, phase]);

  // End any live session if the component unmounts (navigation, etc).
  useEffect(() => () => void sessionRef.current?.end().catch(() => {}), []);

  const inSession = phase === "scanning" || phase === "placed";
  // "starting" counts as visible so the overlay is already laid out by the time
  // requestSession runs.
  const overlayVisible = phase !== "idle";
  const dims = scaledDimensions(listing, size.scale);
  const price = formatPrice(priceFor(listing, color, size), listing.currency);

  return (
    <>
      {/* Launch surface, shown in the page */}
      {support === "supported" && (
        <button
          type="button"
          className="btn-ar w-full py-3 text-base"
          onClick={startAr}
          disabled={phase === "starting"}
        >
          {phase === "starting" ? "Starting AR…" : "View in your room"}
        </button>
      )}

      {support === "checking" && (
        <div className="btn-ghost w-full py-3 opacity-60">Checking AR support…</div>
      )}

      {support === "unsupported" && <QuickLookFallback listing={listing} />}

      {error && <p className="mt-2 text-sm text-bad">{error}</p>}

      {/*
        The overlay must already be in the document when the session is
        requested, so it stays mounted and simply renders nothing until AR is
        running.
      */}
      <div
        ref={overlayRef}
        className="ar-overlay"
        style={{ display: overlayVisible ? "flex" : "none" }}
      >
        {inSession && (
          <>
            {/* Top bar */}
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="ar-pointer rounded-xl bg-black/55 px-3 py-2 backdrop-blur-sm">
                <p className="text-sm font-semibold text-white">{listing.title}</p>
                <p className="text-xs text-white/70">
                  {size.label} · {color.name} · {price}
                </p>
                {formatDimensions(dims) && (
                  <p className="mt-0.5 text-[11px] text-white/60">{formatDimensions(dims)}</p>
                )}
              </div>

              <button
                type="button"
                className="rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm"
                onClick={endSession}
              >
                Exit
              </button>
            </div>

            {/* Centre hint while looking for a surface */}
            {phase === "scanning" && (
              <div className="pointer-events-none flex justify-center px-6">
                <p className="rounded-xl bg-black/60 px-4 py-2 text-center text-sm text-white backdrop-blur-sm">
                  Move your phone slowly to scan the floor, then tap to place.
                </p>
              </div>
            )}

            {/* Bottom controls */}
            <div className="p-4">
              {panel === "colors" && (
                <div className="ar-pointer mb-3 flex flex-wrap gap-2 rounded-2xl bg-black/60 p-3 backdrop-blur-sm">
                  {listing.colors.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onColorChange(option)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-white ${
                        option.id === color.id ? "border-white" : "border-white/25"
                      }`}
                    >
                      <span
                        className="h-4 w-4 rounded-full border border-white/40"
                        style={{
                          background: option.useOriginal
                            ? "linear-gradient(135deg,#e8ecf3,#8a93a6)"
                            : option.hex,
                        }}
                      />
                      {option.name}
                    </button>
                  ))}
                </div>
              )}

              {panel === "sizes" && (
                <div className="ar-pointer mb-3 flex flex-wrap gap-2 rounded-2xl bg-black/60 p-3 backdrop-blur-sm">
                  {listing.sizes.map((option) => {
                    const optionDims = scaledDimensions(listing, option.scale);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onSizeChange(option)}
                        className={`rounded-full border px-3 py-1.5 text-xs text-white ${
                          option.id === size.id ? "border-white" : "border-white/25"
                        }`}
                      >
                        {option.label}
                        {optionDims.height != null && (
                          <span className="ml-1 text-white/60">{optionDims.height}cm</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  className="rounded-full bg-black/60 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm"
                  onClick={() => setPanel(panel === "colors" ? null : "colors")}
                >
                  Colour
                </button>
                <button
                  type="button"
                  className="rounded-full bg-black/60 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm"
                  onClick={() => setPanel(panel === "sizes" ? null : "sizes")}
                >
                  Size
                </button>
                {phase === "placed" && (
                  <button
                    type="button"
                    className="rounded-full bg-black/60 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm"
                    onClick={() => {
                      placedRef.current = false;
                      if (groupRef.current) groupRef.current.visible = false;
                      setPhase("scanning");
                      setPanel(null);
                    }}
                  >
                    Move to a new spot
                  </button>
                )}
              </div>

              {phase === "placed" && (
                <p className="pointer-events-none mt-2 text-center text-[11px] text-white/60">
                  Drag with one finger to slide it · twist with two to turn it
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/**
 * iOS Safari has no WebXR, so AR there means handing a .usdz to Quick Look.
 * That file is fixed at export time: Quick Look cannot re-tint it, so it only
 * appears when the seller supplied one, and the caveat is stated plainly.
 */
function QuickLookFallback({ listing }: { listing: ListingDTO }) {
  const isIOS =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

  if (isIOS && listing.usdzUrl) {
    return (
      <div>
        <a rel="ar" href={listing.usdzUrl} className="btn-ar w-full py-3 text-base">
          {/* Quick Look requires an <img> child to take over the anchor. */}
          <img src={listing.posterUrl ?? "/ar-badge.svg"} alt="" className="h-0 w-0" />
          View in your room
        </a>
        <p className="mt-2 text-xs text-muted">
          Opens in iOS Quick Look. The colour and size you pick here are not carried
          into Quick Look — it shows the seller&apos;s exported USDZ as-is.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-edge bg-panel-2 p-3 text-xs text-muted">
      <p className="mb-1 font-semibold text-text">AR is not available on this device</p>
      {isIOS ? (
        <p>
          iOS needs a USDZ file for AR and this seller has not uploaded one. You can still
          rotate and inspect the print above.
        </p>
      ) : (
        <p>
          Open this page on an Android phone in Chrome to place the print in your room.
          On desktop you can still orbit the model above.
        </p>
      )}
    </div>
  );
}
