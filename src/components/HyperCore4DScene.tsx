import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface HyperCore4DSceneProps {
  compact?: boolean;
}

// 4D Tesseract (Hypercube) 16 vertices: (±1, ±1, ±1, ±1)
const VERTS_4D: Array<[number, number, number, number]> = [];
for (let i = 0; i < 16; i++) {
  VERTS_4D.push([
    i & 1 ? 1 : -1,
    i & 2 ? 1 : -1,
    i & 4 ? 1 : -1,
    i & 8 ? 1 : -1,
  ]);
}

// 32 Edges connecting vertices that differ in exactly 1 coordinate
const EDGES_4D: Array<[number, number]> = [];
for (let i = 0; i < 16; i++) {
  for (let j = i + 1; j < 16; j++) {
    const diff = i ^ j;
    if (diff === 1 || diff === 2 || diff === 4 || diff === 8) {
      EDGES_4D.push([i, j]);
    }
  }
}

// Pre-allocated math objects outside loop for zero GC
const _dummy = new THREE.Object3D();
const _vStart = new THREE.Vector3();
const _vEnd = new THREE.Vector3();
const _vMid = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

export const HyperCore4DScene: React.FC<HyperCore4DSceneProps> = ({ compact = false }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [dimensionSpeed, setDimensionSpeed] = useState(1.0);
  const [explodedGap, setExplodedGap] = useState(0.15);
  const [finishPreset, setFinishPreset] = useState<'emerald' | 'titanium' | 'obsidian'>('emerald');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const speedRef = useRef(dimensionSpeed);
  const explodedRef = useRef(explodedGap);
  const finishRef = useRef(finishPreset);

  speedRef.current = dimensionSpeed;
  explodedRef.current = explodedGap;
  finishRef.current = finishPreset;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 800;
    const height = container.clientHeight || (compact ? 280 : 400);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070c18);
    scene.fog = new THREE.FogExp2(0x070c18, 0.065);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.set(0, 1.8, 7.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Environment Map for PBR metallic reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // 3-Point Warm/Cool Studio Rig
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x090d16, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
    keyLight.position.set(5, 7, 5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x10b981, 1.8);
    rimLight.position.set(-6, 3, -5);
    scene.add(rimLight);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 4.5;
    controls.maxDistance = 12;

    // Procedural Ground Grid & Contact Shadow Plane
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = 256;
    gridCanvas.height = 256;
    const gCtx = gridCanvas.getContext('2d')!;
    gCtx.fillStyle = '#070c18';
    gCtx.fillRect(0, 0, 256, 256);
    gCtx.strokeStyle = 'rgba(16, 185, 129, 0.16)';
    gCtx.lineWidth = 2;
    gCtx.strokeRect(0, 0, 256, 256);
    const gridTex = new THREE.CanvasTexture(gridCanvas);
    gridTex.colorSpace = THREE.SRGBColorSpace;
    gridTex.wrapS = THREE.RepeatWrapping;
    gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(22, 22);
    gridTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const floorGeo = new THREE.PlaneGeometry(36, 36);
    const floorMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      roughness: 0.85,
      metalness: 0.2,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -2.35;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Composite Multi-Part Hero Assembly (THREE.Group)
    const heroGroup = new THREE.Group();
    scene.add(heroGroup);

    // Part 1: Inner Faceted Quantum Nucleus
    const coreGeo = new THREE.IcosahedronGeometry(0.62, 1);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x10b981,
      emissive: 0x064e3b,
      emissiveIntensity: 0.55,
      roughness: 0.18,
      metalness: 0.85,
      clearcoat: 1.0,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    heroGroup.add(coreMesh);

    // Part 2 & 3: Dual Gimbal Gyroscopic Rings (varied roughness/metalness)
    const ringOuterGeo = new THREE.TorusGeometry(2.15, 0.045, 20, 96);
    const ringOuterMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.22,
    });
    const ringOuter = new THREE.Mesh(ringOuterGeo, ringOuterMat);
    heroGroup.add(ringOuter);

    const ringInnerGeo = new THREE.TorusGeometry(1.78, 0.035, 16, 80);
    const ringInnerMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      metalness: 0.65,
      roughness: 0.48,
    });
    const ringInner = new THREE.Mesh(ringInnerGeo, ringInnerMat);
    heroGroup.add(ringInner);

    // Part 4: 4D Hypercube 16 Vertex Nodes (InstancedMesh)
    const nodeGeo = new THREE.SphereGeometry(0.085, 16, 16);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.88,
      roughness: 0.16,
    });
    const nodesInstanced = new THREE.InstancedMesh(nodeGeo, nodeMat, 16);
    nodesInstanced.frustumCulled = false;
    heroGroup.add(nodesInstanced);

    // Part 5: 4D Hypercube 32 Strut Edges (InstancedMesh)
    const strutGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 10);
    const strutMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x065f46,
      emissiveIntensity: 0.4,
      metalness: 0.78,
      roughness: 0.28,
    });
    const strutsInstanced = new THREE.InstancedMesh(strutGeo, strutMat, 32);
    strutsInstanced.frustumCulled = false;
    heroGroup.add(strutsInstanced);

    // Part 6: Orbital Satellite Telemetry Nodes (InstancedMesh, 36 nodes)
    const satCount = 36;
    const satGeo = new THREE.OctahedronGeometry(0.05, 0);
    const satMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.7,
      roughness: 0.35,
    });
    const satInstanced = new THREE.InstancedMesh(satGeo, satMat, satCount);
    satInstanced.frustumCulled = false;
    heroGroup.add(satInstanced);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const projected3D: Array<[number, number, number]> = Array.from({ length: 16 }, () => [0, 0, 0]);
    const clock = new THREE.Clock();
    let angle4D = 0;
    let smoothedGap = explodedRef.current;
    let frameId = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (sync && state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function applyFinishPalette(preset: 'emerald' | 'titanium' | 'obsidian') {
      if (preset === 'emerald') {
        coreMat.color.setHex(0x10b981);
        strutMat.color.setHex(0x10b981);
        ringInnerMat.color.setHex(0x34d399);
      } else if (preset === 'titanium') {
        coreMat.color.setHex(0x38bdf8);
        strutMat.color.setHex(0x7dd3fc);
        ringInnerMat.color.setHex(0xe2e8f0);
      } else {
        coreMat.color.setHex(0xf59e0b);
        strutMat.color.setHex(0xfbbf24);
        ringInnerMat.color.setHex(0x94a3b8);
      }
    }

    let lastFinish = finishRef.current;

    function tick() {
      const dt = Math.min(clock.getDelta(), 0.1);
      angle4D += dt * 0.72 * speedRef.current;
      smoothedGap = THREE.MathUtils.damp(smoothedGap, explodedRef.current, 6, dt);

      if (lastFinish !== finishRef.current) {
        lastFinish = finishRef.current;
        applyFinishPalette(lastFinish);
      }

      const cosXW = Math.cos(angle4D);
      const sinXW = Math.sin(angle4D);
      const cosZW = Math.cos(angle4D * 0.68);
      const sinZW = Math.sin(angle4D * 0.68);

      const scaleBase = 1.05 + smoothedGap * 0.85;

      // Project 16 4D hypercube vertices into 3D space via stereographic W-projection
      for (let i = 0; i < 16; i++) {
        const [vx, vy, vz, vw] = VERTS_4D[i];
        // Rotate in XW plane
        const x1 = vx * cosXW - vw * sinXW;
        const w1 = vx * sinXW + vw * cosXW;
        // Rotate in ZW plane
        const z2 = vz * cosZW - w1 * sinZW;
        const w2 = vz * sinZW + w1 * cosZW;

        const wDist = 3.1 - w2 * 0.85;
        const proj = scaleBase / wDist;

        const px = x1 * proj * 1.65;
        const py = vy * proj * 1.65;
        const pz = z2 * proj * 1.65;

        projected3D[i][0] = px;
        projected3D[i][1] = py;
        projected3D[i][2] = pz;

        _dummy.position.set(px, py, pz);
        _dummy.rotation.set(0, 0, 0);
        const nodeScale = 0.85 + (w2 + 1.4) * 0.25;
        _dummy.scale.setScalar(nodeScale);
        _dummy.updateMatrix();
        nodesInstanced.setMatrixAt(i, _dummy.matrix);
      }
      nodesInstanced.instanceMatrix.needsUpdate = true;

      // Update 32 Hypercube Struts
      for (let e = 0; e < 32; e++) {
        const [a, b] = EDGES_4D[e];
        _vStart.set(projected3D[a][0], projected3D[a][1], projected3D[a][2]);
        _vEnd.set(projected3D[b][0], projected3D[b][1], projected3D[b][2]);
        _vMid.addVectors(_vStart, _vEnd).multiplyScalar(0.5);
        _vDir.subVectors(_vEnd, _vStart);
        const len = _vDir.length();
        _vDir.normalize();
        _quat.setFromUnitVectors(_upAxis, _vDir);

        _dummy.position.copy(_vMid);
        _dummy.quaternion.copy(_quat);
        _dummy.scale.set(1, len, 1);
        _dummy.updateMatrix();
        strutsInstanced.setMatrixAt(e, _dummy.matrix);
      }
      strutsInstanced.instanceMatrix.needsUpdate = true;

      // Update Orbital Satellites
      for (let s = 0; s < satCount; s++) {
        const theta = (s / satCount) * Math.PI * 2 + angle4D * 0.45;
        const radius = 2.65 + Math.sin(angle4D + s) * 0.18 + smoothedGap * 0.7;
        const yOff = Math.cos(theta * 2 + angle4D) * 0.55;
        _dummy.position.set(Math.cos(theta) * radius, yOff, Math.sin(theta) * radius);
        _dummy.rotation.set(angle4D, theta, 0);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        satInstanced.setMatrixAt(s, _dummy.matrix);
      }
      satInstanced.instanceMatrix.needsUpdate = true;

      // Animate Core & Gyro Rings
      coreMesh.rotation.y = angle4D * 0.6;
      coreMesh.rotation.x = angle4D * 0.35;
      ringOuter.rotation.x = Math.PI * 0.32 + Math.sin(angle4D * 0.5) * 0.4;
      ringOuter.rotation.y = angle4D * 0.28;
      ringInner.rotation.y = -angle4D * 0.52;
      ringInner.rotation.z = Math.PI * 0.25 + Math.cos(angle4D * 0.4) * 0.35;
      ringOuter.scale.setScalar(1 + smoothedGap * 0.28);
      ringInner.scale.setScalar(1 + smoothedGap * 0.16);

      if (controls.enableDamping) controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || (compact ? 280 : 400);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      ringOuterGeo.dispose();
      ringOuterMat.dispose();
      ringInnerGeo.dispose();
      ringInnerMat.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      strutGeo.dispose();
      strutMat.dispose();
      satGeo.dispose();
      satMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      gridTex.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [compact]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#070C18] ${
        compact ? 'h-72' : 'h-[410px]'
      }`}
    >
      {/* Isolated WebGL Canvas Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-Left Minimal Spec Header (100% Unobstructed Center) */}
      <div className="pointer-events-none absolute top-4 left-5 z-10 space-y-0.5">
        <div className="text-xs font-medium tracking-wider text-emerald-400">
          RISXAV HAXKK !! · 4D TESSERACT HYPERCORE
        </div>
        <div className="text-lg font-semibold text-slate-100 font-display">
          RHXVM PRO OSINT Spatial Matrix
        </div>
        <div className="text-xs text-slate-400">
          Drag to orbit 3D viewport · Real-time XW/ZW 4th-dimension projection
        </div>
      </div>

      <div
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-[min(780px,94%)] transition-transform duration-200 ${
          dockCollapsed ? 'translate-y-[calc(100%-28px)]' : 'translate-y-0'
        }`}
      >
        <div className="flex justify-center mb-1">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium text-slate-300 bg-[#0F172A] hover:bg-slate-800 border border-slate-700/90 rounded-md cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Show 4D Controls
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Hide Controls
              </>
            )}
          </button>
        </div>

        <div className="bg-[#0F172A] border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-slate-400 whitespace-nowrap">4D W-Rotation</span>
            <input
              type="range"
              min="0"
              max="2.5"
              step="0.1"
              value={dimensionSpeed}
              onChange={(e) => setDimensionSpeed(parseFloat(e.target.value))}
              className="w-24 accent-emerald-500 cursor-pointer"
            />
            <span className="font-mono text-slate-200 tabular-nums w-8">{dimensionSpeed.toFixed(1)}x</span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-slate-400 whitespace-nowrap">3D Expansion</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={explodedGap}
              onChange={(e) => setExplodedGap(parseFloat(e.target.value))}
              className="w-24 accent-emerald-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {(['emerald', 'titanium', 'obsidian'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setFinishPreset(preset)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                  finishPreset === preset
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
