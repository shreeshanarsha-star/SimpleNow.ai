"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// Gauri's face — a procedurally-built 3D robotic/wireframe head rendered in
// Three.js. Ported verbatim (geometry/animation logic unchanged) from
// askshree-app (v1)'s components/GauriFace3D.js.
//
// Eyes: an actual eyelid silhouette (upper lid arch + lower lid curve
// meeting at two corners) with an eye-socket fill, iris, and pupil inside.
// Mouth: a closed lip silhouette plus a dark mouth-cavity fill that grows
// behind it as the mouth opens, reshaped every frame toward a named
// "viseme" target shape (closed / narrow / wide / round), driven by real
// word-boundary timing from SpeechSynthesisUtterance on the parent page,
// with a fallback cycle if the browser/voice never fires that event.
// Color: reads the page's live `--amber-rgb` CSS variable at mount, so the
// face matches whatever accent color the scoped Gauri theme sets.

const FALLBACK_ACCENT: [number, number, number] = [232, 163, 61];

function readAccentRGB(el: HTMLElement): [number, number, number] {
  try {
    const cs = getComputedStyle(el);
    const raw = cs.getPropertyValue("--amber-rgb").trim();
    if (raw) {
      const parts = raw.split(",").map((s) => parseInt(s.trim(), 10));
      if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
        return [parts[0], parts[1], parts[2]];
      }
    }
  } catch {
    // getComputedStyle unavailable or var missing -- fall through
  }
  return FALLBACK_ACCENT;
}

function rgbToThreeColor([r, g, b]: [number, number, number]) {
  return new THREE.Color(r / 255, g / 255, b / 255);
}

function buildEyeLidPoints(segments: number, innerSide: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(-0.36, 0.36, t);
    const innerAmt = innerSide < 0 ? 1 - t : t;
    const arch = Math.sin(t * Math.PI) * (0.15 + innerAmt * 0.075);
    pts.push(new THREE.Vector3(x, arch, 0));
  }
  for (let i = segments; i >= 0; i--) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(-0.36, 0.36, t);
    const innerAmt = innerSide < 0 ? 1 - t : t;
    const dip = Math.sin(t * Math.PI) * (0.09 + innerAmt * 0.045);
    pts.push(new THREE.Vector3(x, -dip, 0));
  }
  return pts;
}

function buildMouthShape(openAmt: number, widenAmt: number, segments: number) {
  const half = 0.5 + widenAmt;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(-half, half, t);
    const bow = Math.exp(-Math.pow((t - 0.5) * 7, 2)) * 0.03;
    const y = Math.sin(t * Math.PI) * 0.02 - bow;
    pts.push(new THREE.Vector3(x, y, 0));
  }
  for (let i = segments; i >= 0; i--) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(-half, half, t);
    const y = -Math.sin(t * Math.PI) * (openAmt + 0.012);
    pts.push(new THREE.Vector3(x, y, 0));
  }
  return pts;
}

const OPEN_LEVELS: Record<string, number> = { closed: 0.012, narrow: 0.095, wide: 0.165, round: 0.115 };

export default function GauriFace3D({ mode, viseme }: { mode: string; viseme: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef({ mode: "idle", viseme: "closed" });

  useEffect(() => {
    liveRef.current.mode = mode;
  }, [mode]);

  useEffect(() => {
    liveRef.current.viseme = viseme || "closed";
  }, [viseme]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const accentRGB = readAccentRGB(mount);
    const ACCENT = rgbToThreeColor(accentRGB);
    const DARK = new THREE.Color(0x05070a);

    let width = mount.clientWidth || 336;
    let height = mount.clientHeight || 420;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
    camera.position.set(0, 0, 9.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    function sculptHead(geo: THREE.BufferGeometry) {
      const pos = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        let fx = 1;
        let fz = 1;
        if (v.y < -0.25) {
          const t = THREE.MathUtils.clamp((-0.25 - v.y) / 2.15, 0, 1);
          const te = Math.min(t, 0.72);
          const ease = te * te;
          fx = 1 - ease * 0.3;
          fz = 1 - ease * 0.1;
        } else if (v.y > 1.25) {
          const t = THREE.MathUtils.clamp((v.y - 1.25) / 1.55, 0, 1);
          fx = 1 - t * 0.15;
        }
        const cheekFalloff = Math.max(0, 1 - Math.abs((v.y - 0.05) / 0.32));
        fx *= 1 + cheekFalloff * 0.05;

        v.x *= fx;
        v.z *= fz;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
    const headGeo = new THREE.SphereGeometry(2.55, 28, 22);
    headGeo.scale(0.85, 1.12, 0.9);
    sculptHead(headGeo);
    const headWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(headGeo),
      new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.16 })
    );
    group.add(headWire);

    const headShell = new THREE.Mesh(
      headGeo,
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.035, side: THREE.DoubleSide })
    );
    group.add(headShell);

    function buildBrowPoints(sign: number) {
      const segs = 12;
      const upper: THREE.Vector3[] = [];
      const lower: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const x = sign * THREE.MathUtils.lerp(0.42, 1.12, t);
        const arch = Math.sin(t * Math.PI) * 0.035;
        const slope = -t * 0.05;
        const baseY = 0.74 + arch + slope;
        const thickness = THREE.MathUtils.lerp(0.1, 0.045, t);
        upper.push(new THREE.Vector3(x, baseY + thickness / 2, 0));
        lower.push(new THREE.Vector3(x, baseY - thickness / 2, 0));
      }
      return upper.concat(lower.reverse());
    }
    function makeBrow(sign: number) {
      const pts = buildBrowPoints(sign);
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      mesh.position.z = 2.07;
      return mesh;
    }
    group.add(makeBrow(-1), makeBrow(1));

    function makeNose() {
      const noseGroup = new THREE.Group();
      const bridgeMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.3 });
      const bridgeL = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.055, 0.5, 2.16),
        new THREE.Vector3(-0.095, -0.35, 2.34),
      ]);
      const bridgeR = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.055, 0.5, 2.16),
        new THREE.Vector3(0.095, -0.35, 2.34),
      ]);
      noseGroup.add(new THREE.Line(bridgeL, bridgeMat), new THREE.Line(bridgeR, bridgeMat));

      const baseSegs = 10;
      const basePts: THREE.Vector3[] = [];
      for (let i = 0; i <= baseSegs; i++) {
        const t = i / baseSegs;
        const x = THREE.MathUtils.lerp(-0.17, 0.17, t);
        const y = -0.35 - Math.sin(t * Math.PI) * 0.09;
        basePts.push(new THREE.Vector3(x, y, 2.32));
      }
      const baseGeo = new THREE.BufferGeometry().setFromPoints(basePts);
      noseGroup.add(new THREE.Line(baseGeo, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.42 })));

      const nostrilMat = new THREE.MeshBasicMaterial({ color: DARK, transparent: true, opacity: 0.6 });
      const nostrilL = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), nostrilMat);
      nostrilL.position.set(-0.1, -0.4, 2.3);
      const nostrilR = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), nostrilMat);
      nostrilR.position.set(0.1, -0.4, 2.3);
      noseGroup.add(nostrilL, nostrilR);

      const philtrumPts = [new THREE.Vector3(0, -0.44, 2.27), new THREE.Vector3(0, -0.7, 2.23)];
      const philtrumGeo = new THREE.BufferGeometry().setFromPoints(philtrumPts);
      noseGroup.add(new THREE.Line(philtrumGeo, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.22 })));

      return noseGroup;
    }
    group.add(makeNose());

    function makeCheekLine(sign: number) {
      const segs = 8;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const x = sign * THREE.MathUtils.lerp(1.05, 0.72, t);
        const y = THREE.MathUtils.lerp(0.02, -1.05, t);
        const z = THREE.MathUtils.lerp(1.82, 1.55, t);
        pts.push(new THREE.Vector3(x, y, z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.12 }));
    }
    group.add(makeCheekLine(-1), makeCheekLine(1));

    function makeEar(sign: number) {
      const segs = 12;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const bulge = Math.sin(t * Math.PI) * 0.24;
        const y = THREE.MathUtils.lerp(0.18, -0.5, t);
        pts.push(new THREE.Vector3(sign * (2.05 + bulge), y, 0.1));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.3 }));
    }
    group.add(makeEar(-1), makeEar(1));

    function makeJawLine() {
      const segs = 22;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const x = THREE.MathUtils.lerp(-0.92, 0.92, t);
        const dip = Math.sin(t * Math.PI);
        const y = -1.7 - dip * 0.4;
        const z = 1.55 + dip * 0.35;
        pts.push(new THREE.Vector3(x, y, z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.2 }));
    }
    group.add(makeJawLine());

    function makeEye(x: number, innerSide: number) {
      const eyeGroup = new THREE.Group();

      const lidPts = buildEyeLidPoints(18, innerSide);
      const lidGeo = new THREE.BufferGeometry().setFromPoints(lidPts);
      const lid = new THREE.LineLoop(lidGeo, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.85 }));
      eyeGroup.add(lid);

      const socketShape = new THREE.Shape(lidPts.map((p) => new THREE.Vector2(p.x, p.y)));
      const socket = new THREE.Mesh(
        new THREE.ShapeGeometry(socketShape),
        new THREE.MeshBasicMaterial({ color: DARK, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      socket.position.z = -0.01;
      eyeGroup.add(socket);

      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 24),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.05 })
      );
      glow.position.z = -0.02;
      eyeGroup.add(glow);

      const iris = new THREE.Mesh(
        new THREE.CircleGeometry(0.115, 26),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 })
      );
      iris.position.z = 0.01;
      eyeGroup.add(iris);

      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), new THREE.MeshBasicMaterial({ color: DARK }));
      pupil.position.z = 0.02;
      eyeGroup.add(pupil);

      const catchlight = new THREE.Mesh(
        new THREE.CircleGeometry(0.02, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
      );
      catchlight.position.set(0.045, 0.05, 0.03);
      eyeGroup.add(catchlight);

      eyeGroup.position.set(x, 0.32, 2.18);
      return eyeGroup;
    }
    const eyeL = makeEye(-0.74, 1);
    const eyeR = makeEye(0.74, -1);
    group.add(eyeL, eyeR);

    const MOUTH_SEGS = 16;
    const mouthShapes: Record<string, THREE.Vector3[]> = {
      closed: buildMouthShape(OPEN_LEVELS.closed, 0, MOUTH_SEGS),
      narrow: buildMouthShape(OPEN_LEVELS.narrow, 0.02, MOUTH_SEGS),
      wide: buildMouthShape(OPEN_LEVELS.wide, 0.09, MOUTH_SEGS),
      round: buildMouthShape(OPEN_LEVELS.round, -0.1, MOUTH_SEGS),
    };
    const mouthGeo = new THREE.BufferGeometry().setFromPoints(mouthShapes.closed);
    const mouthLine = new THREE.LineLoop(mouthGeo, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.85 }));
    mouthLine.position.set(0, -0.92, 2.21);
    group.add(mouthLine);
    const currentMouth = mouthShapes.closed.map((p) => p.clone());

    const seamPts = buildMouthShape(0, 0, MOUTH_SEGS).slice(0, MOUTH_SEGS + 1);
    const seamGeo = new THREE.BufferGeometry().setFromPoints(seamPts);
    const seamLine = new THREE.Line(seamGeo, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.5 }));
    seamLine.position.set(0, -0.92, 2.215);
    group.add(seamLine);

    const cavity = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ color: DARK, transparent: true, opacity: 0.8 })
    );
    cavity.position.set(0, -0.92, 2.195);
    cavity.scale.set(0.46, 0.05, 1);
    group.add(cavity);
    let currentOpen = OPEN_LEVELS.closed;

    const PARTICLE_COUNT = 90;
    const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(THREE.MathUtils.lerp(-1, 1, Math.random()));
      const r = 2.85 + Math.random() * 0.55;
      particlePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 0.9;
      particlePositions[i * 3 + 1] = r * Math.cos(phi) * 1.05;
      particlePositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) * 0.85;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({ color: ACCENT, size: 0.028, transparent: true, opacity: 0.35 })
    );
    group.add(particles);

    let frameId: number;
    const blink = { phase: "idle", start: 0, next: performance.now() + 1400, doubleQueued: false };
    let mouthTarget = "closed";

    function scheduleNextBlink(now: number) {
      blink.next = now + 2400 + Math.random() * 4000;
      blink.doubleQueued = Math.random() < 0.16;
    }

    function animate(now: number) {
      frameId = requestAnimationFrame(animate);
      const t = now * 0.001;

      group.rotation.y = Math.sin(t * 0.32) * 0.045;
      group.rotation.x = Math.sin(t * 0.47) * 0.018;
      group.position.y = Math.sin(t * 0.85) * 0.02;
      particles.rotation.y = t * 0.06;

      if (blink.phase === "idle" && now >= blink.next) {
        blink.phase = "closing";
        blink.start = now;
      }
      let eyeScale = 1;
      if (blink.phase === "closing") {
        const p = Math.min(1, (now - blink.start) / 105);
        eyeScale = 1 - p * p;
        if (p >= 1) {
          blink.phase = "hold";
          blink.start = now;
        }
      } else if (blink.phase === "hold") {
        eyeScale = 0;
        if (now - blink.start > 45) {
          blink.phase = "opening";
          blink.start = now;
        }
      } else if (blink.phase === "opening") {
        const p = Math.min(1, (now - blink.start) / 170);
        eyeScale = 1 - (1 - p) * (1 - p);
        if (p >= 1) {
          if (blink.doubleQueued) {
            blink.doubleQueued = false;
            blink.phase = "idle";
            blink.next = now + 130;
          } else {
            blink.phase = "idle";
            scheduleNextBlink(now);
          }
        }
      }
      eyeL.scale.y = Math.max(0.04, eyeScale);
      eyeR.scale.y = Math.max(0.04, eyeScale);

      const speaking = liveRef.current.mode === "speaking";
      const desired = speaking ? liveRef.current.viseme || "narrow" : "closed";
      mouthTarget = desired;
      const targetPts = mouthShapes[mouthTarget] || mouthShapes.closed;
      const posAttr = mouthGeo.attributes.position;
      for (let i = 0; i < currentMouth.length; i++) {
        currentMouth[i].lerp(targetPts[i], 0.22);
        posAttr.setXYZ(i, currentMouth[i].x, currentMouth[i].y, currentMouth[i].z);
      }
      posAttr.needsUpdate = true;

      currentOpen += (OPEN_LEVELS[mouthTarget] - currentOpen) * 0.22;
      cavity.scale.set(0.42, Math.max(0.045, currentOpen * 5.6), 1);
      cavity.position.y = -0.92 - currentOpen * 0.55;

      const listening = liveRef.current.mode === "listening";
      const pulse = listening ? Math.sin(t * 3.2) * 0.5 + 0.5 : speaking ? Math.sin(t * 9) * 0.5 + 0.5 : 0;
      (headShell.material as THREE.MeshBasicMaterial).opacity = 0.035 + pulse * (listening ? 0.05 : 0.025);
      (headWire.material as THREE.LineBasicMaterial).opacity = 0.16 + pulse * 0.08;

      renderer.render(scene, camera);
    }
    frameId = requestAnimationFrame(animate);

    function onResize() {
      if (!mount) return;
      width = mount.clientWidth || width;
      height = mount.clientHeight || height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      renderer.dispose();
      headGeo.dispose();
      particleGeo.dispose();
      mouthGeo.dispose();
      seamGeo.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="gav-face3d-mount" />;
}
