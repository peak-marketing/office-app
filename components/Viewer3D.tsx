"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LayoutOption } from "@/lib/layout/types";
import { getStyle } from "@/lib/styles";

interface Handle {
  setStyle(id: string): void;
  setWalls(full: boolean): void;
  setLabels(show: boolean): void;
  view(kind: "iso" | "top"): void;
  dispose(): void;
}

function build(canvas: HTMLCanvasElement, option: LayoutOption, styleId: string): Handle {
  const { W, D } = option;
  // 방 한 칸(집)은 작아서 벽이 화면을 가리기 쉽다. 시점 거리를 넉넉히 잡는다(사무실은 그대로).
  const size = Math.max(W, D * 1.15, option.roomOnly ? 7 : 0);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#eceee9");
  // 인쇄·이미지 저장을 위해 드로잉 버퍼를 유지한다.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = size * 0.6;
  controls.maxDistance = size * 4;
  const target = new THREE.Vector3(W / 2, 0, D / 2);
  const view = (kind: "iso" | "top") => {
    if (kind === "iso") camera.position.set(W / 2 + 0.82 * size, 1.35 * size, D / 2 + 1.31 * size);
    else camera.position.set(W / 2, 2.1 * size, D / 2 + 0.001);
    controls.target.copy(target);
    controls.update();
  };
  view("iso");

  scene.add(new THREE.HemisphereLight(0xffffff, 0xc1b6a4, 2.2));
  const sun = new THREE.DirectionalLight(0xfff7e8, 3);
  sun.position.set(-3, size * 1.6, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -size * 1.6, right: size * 1.6, top: size * 1.6, bottom: -size * 1.6 });
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  const model = new THREE.Group();
  scene.add(model);
  const outer: THREE.Mesh[] = [];
  for (const o of option.objects) {
    const mat = new THREE.MeshStandardMaterial({
      color: o.color,
      roughness: 0.76,
      transparent: o.opacity < 1,
      opacity: o.opacity,
      depthWrite: o.opacity >= 1,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mat);
    // 배치 좌표(y = 입구→후면)를 three.js 좌표(z)로 뒤집는다.
    mesh.position.set(o.x + o.w / 2, o.z + o.h / 2, D - o.y - o.d / 2);
    mesh.castShadow = o.kind !== "glass";
    mesh.receiveShadow = true;
    mesh.userData = o;
    model.add(mesh);
    if (o.kind === "outer") outer.push(mesh);
  }
  // 실제 상품의 3D 모델(GLB): 상자를 먼저 그려 두고, 모델을 불러오면 상품 규격 크기에 맞춰 바꿔 놓는다.
  let disposed = false;
  const models = new THREE.Group();
  scene.add(models);
  const withModel = (model.children as THREE.Mesh[]).filter((m) => (m.userData as { model?: string }).model);
  if (withModel.length)
    import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      for (const mesh of withModel) {
        const o = mesh.userData as { model: string; rot?: number; w: number; d: number; h: number };
        loader.load(
          o.model,
          (gltf) => {
            if (disposed) return;
            const obj = gltf.scene;
            const box = new THREE.Box3().setFromObject(obj);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            obj.position.set(-center.x, -center.y, -center.z);
            const rot = o.rot ?? 0;
            // 바닥면(w·d)은 돌린 뒤 크기이므로, 돌리기 전 가로·깊이로 되돌려 맞춘다.
            const lw = rot % 180 ? o.d : o.w;
            const ld = rot % 180 ? o.w : o.d;
            const inner = new THREE.Group();
            inner.add(obj);
            inner.scale.set(lw / Math.max(size.x, 1e-3), o.h / Math.max(size.y, 1e-3), ld / Math.max(size.z, 1e-3));
            const wrap = new THREE.Group();
            wrap.add(inner);
            wrap.rotation.y = (rot * Math.PI) / 180;
            wrap.position.copy(mesh.position);
            obj.traverse((c) => {
              const m = c as THREE.Mesh;
              if (m.isMesh) {
                m.castShadow = true;
                m.receiveShadow = true;
              }
            });
            wrap.userData.productModel = o.model;
            models.add(wrap);
            mesh.visible = false;
          },
          undefined,
          () => {
            // 모델을 못 불러오면 같은 크기의 상자로 둔다.
          },
        );
      }
    });
  // 내부가 보이도록 후면 벽을 뺀 외벽은 낮게 잘라 보여 준다.
  const setWalls = (full: boolean) => {
    for (const m of outer) {
      const o = m.userData;
      // 출입문 위 벽처럼 떠 있는 벽은 낮춰 보일 때 숨긴다.
      m.visible = full || o.z < 0.01;
      const h = full || o.name === "후면 벽" ? o.h : 0.24;
      m.scale.y = h / o.h;
      m.position.y = o.z + h / 2;
    }
  };
  setWalls(false);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#eceee9", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.18;
  ground.receiveShadow = true;
  scene.add(ground);

  const tags = new THREE.Group();
  scene.add(tags);
  const textures: THREE.Texture[] = [];
  const tag = (label: string, x: number, y: number, width: number, color: string) => {
    const c = document.createElement("canvas");
    c.width = 700;
    c.height = 140;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(250,250,245,.94)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 692, 132, 25);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '600 48px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 350, 72);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false }));
    sprite.scale.set(width, width * 0.2, 1);
    sprite.position.set(x, 1.3, D - y);
    sprite.renderOrder = 10;
    tags.add(sprite);
  };
  for (const room of option.rooms) {
    const width = Math.min(3, Math.max(2, room.w * 0.75)) * (size / 11);
    tag(room.label, room.x + room.w / 2, room.key === "work" ? room.y + 0.5 : room.y + room.d * 0.75, width, "#2d493d");
  }
  for (const z of option.zones ?? []) tag(z.label, z.x, z.y, 1.7 * (size / 11), "#b4643c");

  const setStyle = (id: string) => {
    const style = getStyle(id);
    for (const child of model.children) {
      const mesh = child as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
      const base = mesh.userData.color as string;
      mesh.material.color.set(style.colors[base] ?? base);
      mesh.material.roughness = style.id === "chic" ? 0.58 : 0.76;
      mesh.material.metalness = style.id === "lovely" && base === "#344943" ? 0.35 : 0;
    }
    (scene.background as THREE.Color).set(style.background);
    ground.material.color.set(style.background);
  };
  setStyle(styleId);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // 예시 이미지를 만들 때 스크립트로 시점을 정할 수 있게 캔버스에 걸어 둔다.
  (canvas as HTMLCanvasElement & { __viewer?: unknown }).__viewer = { camera, controls, option, models };

  let raf = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    controls.update();
    renderer.render(scene, camera);
  };
  frame();

  return {
    setStyle,
    setWalls,
    setLabels: (show) => {
      tags.visible = show;
    },
    view,
    dispose() {
      disposed = true;
      models.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          for (const mt of [m.material].flat()) mt.dispose();
        }
      });
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      for (const child of model.children) {
        const mesh = child as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      for (const t of textures) t.dispose();
      renderer.dispose();
    },
  };
}

export default function Viewer3D({
  option,
  styleId,
  controls = true,
  className = "",
}: {
  option: LayoutOption;
  styleId: string;
  controls?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handle = useRef<Handle | null>(null);
  const styleRef = useRef(styleId);

  useEffect(() => {
    styleRef.current = styleId;
    handle.current?.setStyle(styleId);
  }, [styleId]);

  useEffect(() => {
    const h = build(canvasRef.current!, option, styleRef.current);
    handle.current = h;
    return () => {
      handle.current = null;
      h.dispose();
    };
  }, [option]);

  const save = () => {
    const a = document.createElement("a");
    a.download = `배치_${option.title.replaceAll(" ", "")}_${getStyle(styleId).name}_3D.png`;
    a.href = canvasRef.current!.toDataURL("image/png");
    a.click();
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full outline-none" data-viewer="3d" />
      {controls && (
        <>
          <div className="no-print absolute left-3 top-3 flex flex-wrap gap-1.5">
            <button type="button" className="btn btn-sm" onClick={() => handle.current?.view("iso")}>
              기본 시점
            </button>
            <button type="button" className="btn btn-sm" onClick={() => handle.current?.view("top")}>
              위에서 보기
            </button>
            <button type="button" className="btn btn-sm" onClick={save}>
              이미지 저장
            </button>
          </div>
          <div className="no-print absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-md bg-surface/90 px-3 py-1.5 text-xs text-muted">
            <span>드래그 회전 · 휠 확대 · 우클릭 이동</span>
            <label className="flex items-center gap-1">
              <input type="checkbox" className="accent-brand" onChange={(e) => handle.current?.setWalls(e.target.checked)} /> 외벽 전체
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" className="accent-brand" defaultChecked onChange={(e) => handle.current?.setLabels(e.target.checked)} /> 공간 이름
            </label>
          </div>
        </>
      )}
    </div>
  );
}
