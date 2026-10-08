import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LayoutOption, Obj } from "@/lib/layout/types";
import { getStyle } from "@/lib/styles";

// 배치 좌표로 3D 장면을 만든다. 같은 배치 데이터에서 두 가지 모습을 낸다.
//   model: 벽을 낮게 자른 입체 배치도(구조 이해용)
//   photo: 천장·창·조명을 갖춘 눈높이 장면(분위기 전달용)
// 좌표: 배치 x → three x, 배치 높이 z → three y, 배치 y(입구→안쪽) → three z = D - y

export type SceneMode = "model" | "photo";

const CEILING = 2.7;

/** 스타일별 바닥·벽 재질 */
const FINISH: Record<string, { floor: "plank" | "stone"; floorTint: string; wall: string; ceiling: string; carpet: string; sky: string }> = {
  natural: { floor: "plank", floorTint: "#d8c3a1", wall: "#f3f0ea", ceiling: "#f7f6f3", carpet: "#9aa59c", sky: "#cfe3ee" },
  chic: { floor: "stone", floorTint: "#a9abaf", wall: "#e4e3e1", ceiling: "#f2f2f0", carpet: "#5a5f66", sky: "#d6e0e8" },
  lovely: { floor: "plank", floorTint: "#ecdcc6", wall: "#fbf3ec", ceiling: "#fbf8f4", carpet: "#d8b8c2", sky: "#e2edf2" },
};

// ── 절차적 텍스처(밝기만 담고, 색은 재질 색으로 곱한다)
function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** 마루: 폭 1/8, 길이가 다른 판재와 결 */
const plankTexture = () =>
  canvasTexture(1024, (g, s) => {
    seed = 11;
    const rows = 8;
    const h = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * s * 0.5;
      while (x < s) {
        const len = s * (0.45 + rand() * 0.4);
        const l = 205 + Math.round(rand() * 40);
        g.fillStyle = `rgb(${l},${l},${l})`;
        g.fillRect(x, r * h, len, h);
        g.strokeStyle = "rgba(0,0,0,0.05)";
        for (let k = 0; k < 9; k++) {
          const y = r * h + rand() * h;
          g.lineWidth = 0.6 + rand() * 1.4;
          g.beginPath();
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (rand() - 0.5) * 6, x + len * 0.6, y + (rand() - 0.5) * 6, x + len, y + (rand() - 0.5) * 4);
          g.stroke();
        }
        g.fillStyle = "rgba(0,0,0,0.16)";
        g.fillRect(x, r * h, 2, h);
        x += len;
      }
      g.fillStyle = "rgba(0,0,0,0.14)";
      g.fillRect(0, r * h, s, 1.5);
    }
  });

/** 돌·콘크리트 느낌의 큰 타일 */
const stoneTexture = () =>
  canvasTexture(1024, (g, s) => {
    seed = 23;
    g.fillStyle = "rgb(228,228,228)";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const l = 200 + Math.round(rand() * 50);
      g.fillStyle = `rgba(${l},${l},${l},0.35)`;
      g.fillRect(rand() * s, rand() * s, 1 + rand() * 3, 1 + rand() * 3);
    }
    g.fillStyle = "rgba(0,0,0,0.12)";
    for (let i = 0; i <= 2; i++) {
      g.fillRect((s / 2) * i - 1, 0, 2, s);
      g.fillRect(0, (s / 2) * i - 1, s, 2);
    }
  });

/** 가구 상판 나뭇결 */
const grainTexture = () =>
  canvasTexture(512, (g, s) => {
    seed = 5;
    g.fillStyle = "rgb(236,236,236)";
    g.fillRect(0, 0, s, s);
    for (let k = 0; k < 70; k++) {
      const y = rand() * s;
      const l = 190 + Math.round(rand() * 40);
      g.strokeStyle = `rgba(${l - 60},${l - 60},${l - 60},0.18)`;
      g.lineWidth = 0.5 + rand() * 2;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + (rand() - 0.5) * 14, s * 0.7, y + (rand() - 0.5) * 14, s, y + (rand() - 0.5) * 8);
      g.stroke();
    }
  });

/** 직물(의자·카펫) */
const fabricTexture = () =>
  canvasTexture(256, (g, s) => {
    seed = 3;
    g.fillStyle = "rgb(235,235,235)";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 6000; i++) {
      const l = 205 + Math.round(rand() * 50);
      g.fillStyle = `rgba(${l},${l},${l},0.5)`;
      g.fillRect(rand() * s, rand() * s, 1, 1);
    }
  });

/** 창밖: 하늘과 먼 건물 실루엣 */
const skyTexture = (sky: string) =>
  canvasTexture(1024, (g, s) => {
    seed = 19;
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, "#f8fbfd");
    grad.addColorStop(0.55, sky);
    grad.addColorStop(1, "#eef2f2");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    let x = 0;
    while (x < s) {
      const w = 40 + rand() * 120;
      const h = s * (0.12 + rand() * 0.3);
      const l = 214 + Math.round(rand() * 22);
      g.fillStyle = `rgb(${l - 6},${l},${l + 6})`;
      g.fillRect(x, s * 0.62 - h, w, h + s);
      g.fillStyle = "rgba(255,255,255,0.35)";
      for (let wy = s * 0.62 - h + 10; wy < s * 0.62; wy += 18) for (let wx = x + 6; wx < x + w - 8; wx += 14) g.fillRect(wx, wy, 6, 8);
      x += w + rand() * 12;
    }
    g.fillStyle = "rgb(214,220,214)";
    g.fillRect(0, s * 0.62, s, s);
  });

export interface Shot {
  label: string;
  pos: [number, number];
  h: number;
  target: [number, number];
  th: number;
}

export interface RoomScene {
  scene: THREE.Scene;
  setStyle(id: string): void;
  setWalls(full: boolean): void;
  setLabels(show: boolean): void;
  dispose(): void;
  labels: THREE.Group;
}

const isChairPart = (n: string) => /좌판|등받이/.test(n);
const isTop = (o: Obj) => o.h <= 0.06 && /책상|테이블/.test(o.name) && !/다리/.test(o.name);

export function buildRoomScene(option: LayoutOption, styleId: string, mode: SceneMode): RoomScene {
  const { W, D } = option;
  const photo = mode === "photo";
  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const tex = {
    plank: track(plankTexture()),
    stone: track(stoneTexture()),
    grain: track(grainTexture()),
    fabric: track(fabricTexture()),
  };

  const model = new THREE.Group();
  scene.add(model);
  const outer: THREE.Mesh[] = [];
  const toned: { mesh: THREE.Mesh; base: string; role: string }[] = [];

  const mat = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => track(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }));
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, o?: { base: string; role: string }) => {
    track(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
    if (o) toned.push({ mesh, ...o });
    return mesh;
  };
  /** 배치 좌표의 상자 중심 */
  const center = (o: Pick<Obj, "x" | "y" | "z" | "w" | "d" | "h">) => [o.x + o.w / 2, o.z + o.h / 2, D - o.y - o.d / 2] as const;

  const windows = option.marks.windows;
  for (const o of option.objects) {
    const [cx, cy, cz] = center(o);
    if (o.kind === "window") {
      if (photo) continue; // 눈높이 장면에서는 실제 개구부와 유리로 다시 만든다.
      add(new THREE.BoxGeometry(o.w, o.h, o.d), mat(o.color, { transparent: true, opacity: 0.8 }), cx, cy, cz, { base: o.color, role: "plain" });
      continue;
    }
    if (o.kind === "outer") {
      if (photo && o.name === "후면 벽" && windows.length) continue; // 아래에서 창을 뚫어 다시 세운다.
      const m = add(new THREE.BoxGeometry(o.w, o.h, o.d), mat(o.color), cx, cy, cz, { base: o.color, role: "wall" });
      m.userData.o = o;
      outer.push(m);
      continue;
    }
    if (o.kind === "floor") {
      if (o.name === "바닥") {
        const floor = add(new THREE.BoxGeometry(o.w, o.h, o.d), mat(o.color, { roughness: 0.55 }), cx, cy, cz, { base: o.color, role: "floor" });
        floor.castShadow = false;
      } else {
        const carpet = /회의실/.test(o.name);
        add(new THREE.BoxGeometry(o.w, o.h, o.d), mat(o.color, { roughness: carpet ? 0.95 : 0.6 }), cx, cy, cz, { base: o.color, role: carpet ? "carpet" : "roomfloor" }).castShadow = false;
      }
      continue;
    }
    if (o.kind === "glass") {
      const glass = add(
        new THREE.BoxGeometry(o.w, o.h, o.d),
        track(new THREE.MeshStandardMaterial({ color: "#dfeef0", transparent: true, opacity: photo ? 0.07 : 0.24, roughness: 0.05, metalness: 0, depthWrite: false })),
        cx,
        cy,
        cz,
      );
      glass.castShadow = false;
      continue;
    }
    // 가구: 모양을 조금 다듬는다.
    let geo: THREE.BufferGeometry;
    if (isChairPart(o.name)) geo = new RoundedBoxGeometry(o.w, o.h, o.d, 3, Math.min(0.045, o.h / 2.2, o.w / 4));
    else if (isTop(o)) geo = new RoundedBoxGeometry(o.w, o.h, o.d, 2, Math.min(0.012, o.h / 2.5));
    else if (/소파|벤치|스툴/.test(o.name)) geo = new RoundedBoxGeometry(o.w, o.h, o.d, 3, Math.min(0.06, o.h / 3));
    else if (o.name === "화분") geo = new THREE.CylinderGeometry(o.w / 2, o.w / 2.6, o.h, 20);
    else if (/베이스/.test(o.name)) geo = new THREE.CylinderGeometry(o.w / 2, o.w / 2, o.h, 20);
    else if (/기둥/.test(o.name) && o.name.includes("의자")) geo = new THREE.CylinderGeometry(o.w / 2, o.w / 2, o.h, 12);
    else if (o.name === "식재") {
      // 잎 덩어리
      const g = new THREE.Group();
      const leaf = mat("#61785a", { roughness: 0.9, flatShading: true });
      for (const [dx, dy, dz, r] of [
        [0, 0.15, 0, 0.5],
        [0.18, 0.35, 0.1, 0.38],
        [-0.15, 0.42, -0.12, 0.36],
        [0.05, 0.62, -0.05, 0.3],
        [-0.12, 0.25, 0.16, 0.32],
      ]) {
        const s = new THREE.Mesh(track(new THREE.IcosahedronGeometry((o.w / 2) * r * 1.6, 1)), leaf);
        s.position.set(dx * o.w, (dy - 0.5) * o.h, dz * o.w);
        s.castShadow = true;
        g.add(s);
      }
      g.position.set(cx, cy, cz);
      model.add(g);
      toned.push({ mesh: g.children[0] as THREE.Mesh, base: o.color, role: "plant" });
      continue;
    } else geo = new THREE.BoxGeometry(o.w, o.h, o.d);

    const wood = o.color === "#c7a477" || o.color === "#b9a385";
    const fabric = isChairPart(o.name) || /소파|벤치|스툴/.test(o.name);
    const dark = /모니터|화면|키보드|커피/.test(o.name);
    const m = mat(o.color, {
      roughness: dark ? 0.35 : wood ? 0.55 : fabric ? 0.92 : 0.7,
      map: wood ? tex.grain : fabric ? tex.fabric : null,
      transparent: o.opacity < 1,
      opacity: o.opacity,
      depthWrite: o.opacity >= 1,
    });
    const mesh = add(geo, m, cx, cy, cz, { base: o.color, role: o.kind === "partition" && o.color === "#eeeae2" ? "wall" : "plain" });
    if (o.kind === "partition") mesh.userData.partition = true;
  }

  // ── 눈높이 장면: 창이 뚫린 안쪽 벽, 천장, 조명, 창밖
  const lights = new THREE.Group();
  scene.add(lights);
  if (photo) {
    const rearZ = -0.075; // 안쪽 벽 중심(three z)
    const T = 0.15;
    const sill = 0.85;
    const head = 2.35;
    const wallM = mat("#eeeae2");
    const wallPiece = (x1: number, x2: number, y1: number, y2: number) => {
      if (x2 - x1 < 0.01 || y2 - y1 < 0.01) return;
      const m = add(new THREE.BoxGeometry(x2 - x1, y2 - y1, T), wallM, (x1 + x2) / 2, (y1 + y2) / 2, rearZ, { base: "#eeeae2", role: "wall" });
      m.userData.photoWall = true;
    };
    const spans = [...windows].sort((a, b) => a.x1 - b.x1);
    let from = -T;
    for (const s of spans) {
      wallPiece(from, s.x1, 0, CEILING);
      wallPiece(s.x1, s.x2, 0, sill);
      wallPiece(s.x1, s.x2, head, CEILING);
      // 창틀과 유리
      const frame = mat("#3b3f44", { roughness: 0.4, metalness: 0.3 });
      for (const [x, w] of [
        [s.x1, 0.05],
        [s.x2 - 0.05, 0.05],
      ])
        add(new THREE.BoxGeometry(w, head - sill, 0.06), frame, x + w / 2, (sill + head) / 2, rearZ);
      add(new THREE.BoxGeometry(s.x2 - s.x1, 0.05, 0.06), frame, (s.x1 + s.x2) / 2, sill + 0.025, rearZ);
      add(new THREE.BoxGeometry(s.x2 - s.x1, 0.05, 0.06), frame, (s.x1 + s.x2) / 2, head - 0.025, rearZ);
      const mullions = Math.max(1, Math.round((s.x2 - s.x1) / 1.4));
      for (let k = 1; k < mullions; k++) add(new THREE.BoxGeometry(0.035, head - sill, 0.05), frame, s.x1 + ((s.x2 - s.x1) / mullions) * k, (sill + head) / 2, rearZ);
      const pane = add(
        new THREE.PlaneGeometry(s.x2 - s.x1, head - sill),
        track(new THREE.MeshStandardMaterial({ color: "#e8f2f6", transparent: true, opacity: 0.1, roughness: 0.02, depthWrite: false })),
        (s.x1 + s.x2) / 2,
        (sill + head) / 2,
        rearZ,
      );
      pane.castShadow = false;
      // 창턱
      add(new THREE.BoxGeometry(s.x2 - s.x1 + 0.1, 0.03, 0.22), mat("#f4f3ef", { roughness: 0.5 }), (s.x1 + s.x2) / 2, sill, 0.04);
      from = s.x2;
    }
    wallPiece(from, W + T, 0, CEILING);

    // 창밖 풍경
    const skyTex = track(skyTexture(FINISH[getStyle(styleId).id]?.sky ?? "#cfe3ee"));
    const backdrop = new THREE.Mesh(track(new THREE.PlaneGeometry(W * 4, 14)), track(new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false })));
    backdrop.position.set(W / 2, 3, -9);
    scene.add(backdrop);

    // 천장과 걸레받이
    const ceiling = add(new THREE.BoxGeometry(W + 0.3, 0.05, D + 0.3), mat("#f7f6f3", { roughness: 0.9, emissive: "#ffffff", emissiveIntensity: 0.32 }), W / 2, CEILING + 0.025, D / 2, { base: "#f7f6f3", role: "ceiling" });
    ceiling.receiveShadow = true;
    // 천장 선형 조명(빛나는 판)과 실제 면광원
    RectAreaLightUniformsLib.init();
    const glow = track(new THREE.MeshBasicMaterial({ color: "#fffaf0", toneMapped: false }));
    const nx = Math.max(1, Math.round(W / 3));
    const nz = Math.max(1, Math.round(D / 2.6));
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) {
        const x = (W / nx) * (i + 0.5);
        const z = (D / nz) * (k + 0.5);
        const strip = new THREE.Mesh(track(new THREE.BoxGeometry(1.4, 0.02, 0.08)), glow);
        strip.position.set(x, CEILING - 0.012, z);
        scene.add(strip);
      }
    const cols = 2;
    const rows = 2;
    for (let i = 0; i < cols; i++)
      for (let k = 0; k < rows; k++) {
        const area = new THREE.RectAreaLight("#fff3e2", 2.2, W / cols - 0.6, D / rows - 0.6);
        area.position.set((W / cols) * (i + 0.5), CEILING - 0.05, (D / rows) * (k + 0.5));
        area.lookAt(area.position.x, 0, area.position.z);
        lights.add(area);
      }
    // 회의·협업 테이블 위 펜던트 조명
    for (const o of option.objects.filter((x) => x.name === "회의 테이블" || x.name === "협업 테이블")) {
      const [cx, , cz] = center(o);
      const along = o.w >= o.d;
      const n = Math.max(1, Math.round(Math.max(o.w, o.d) / 1.2));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        const px = along ? cx + t * o.w : cx;
        const pz = along ? cz : cz + t * o.d;
        const shade = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.2, 0.18, 24, 1, true)), mat("#2c2f33", { roughness: 0.45, side: THREE.DoubleSide }));
        shade.position.set(px, 1.75, pz);
        scene.add(shade);
        const cord = new THREE.Mesh(track(new THREE.CylinderGeometry(0.006, 0.006, CEILING - 1.84, 6)), mat("#2c2f33"));
        cord.position.set(px, (CEILING + 1.84) / 2, pz);
        scene.add(cord);
        const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.055, 16, 12)), glow);
        bulb.position.set(px, 1.69, pz);
        scene.add(bulb);
        const pl = new THREE.PointLight("#ffe2b8", 1.6, 3.2, 2);
        pl.position.set(px, 1.6, pz);
        lights.add(pl);
      }
    }
    // 소품: 업무 공간 모서리의 큰 화분과 벽 액자(분위기용, 가구 목록에는 넣지 않는다)
    const style = getStyle(styleId);
    const occupied = option.objects.filter((o) => o.kind !== "floor" && o.kind !== "window" && o.kind !== "outer" && o.plan);
    const clear = (x: number, y: number, r: number) => !occupied.some((o) => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.d);
    const work = option.rooms.find((r) => r.key === "work");
    let plants = 0;
    if (work)
      for (const [fx, fy] of [
        [0, 1],
        [1, 1],
        [0, 0.5],
        [1, 0.5],
        [0.5, 1],
      ]) {
        if (plants >= 3) break;
        const x = Math.min(Math.max(work.x + work.w * fx, 0.45), W - 0.45);
        const y = Math.min(Math.max(work.y + work.d * fy, 0.45), D - 0.45);
        if (!clear(x, y, 0.42)) continue;
        plants++;
        const pot = new THREE.Mesh(track(new THREE.CylinderGeometry(0.22, 0.17, 0.5, 24)), mat(style.id === "chic" ? "#3a3d42" : "#e9e4dc", { roughness: 0.6 }));
        pot.position.set(x, 0.25, D - y);
        pot.castShadow = true;
        scene.add(pot);
        const leaf = mat("#4f6b45", { roughness: 0.85, flatShading: true });
        for (const [dx, dy, dz, r] of [
          [0, 0.85, 0, 0.32],
          [0.14, 1.12, 0.06, 0.26],
          [-0.12, 1.25, -0.08, 0.24],
          [0.03, 1.45, 0.02, 0.2],
          [-0.1, 0.98, 0.12, 0.24],
        ]) {
          const f = new THREE.Mesh(track(new THREE.IcosahedronGeometry(r, 1)), leaf);
          f.position.set(x + dx, dy, D - y + dz);
          f.castShadow = true;
          scene.add(f);
        }
      }
    // 업무 공간을 향한 불투명 벽에 액자 두세 점
    const wc = work ? [work.x + work.w / 2, work.y + work.d / 2] : [W / 2, D / 2];
    const palette = style.palette.map(([, c]) => c);
    const artTex = (k: number) =>
      track(
        canvasTexture(256, (g, n) => {
          seed = 31 + k;
          g.fillStyle = "#f5f2ec";
          g.fillRect(0, 0, n, n);
          for (let i = 0; i < 5; i++) {
            g.fillStyle = palette[(i + k) % palette.length];
            g.globalAlpha = 0.85;
            g.beginPath();
            g.arc(rand() * n, rand() * n, 30 + rand() * 70, 0, Math.PI * 2);
            g.fill();
          }
          g.globalAlpha = 1;
        }),
      );
    const solidWalls = option.objects.filter((o) => o.kind === "partition" && o.h > 2 && o.color === "#eeeae2" && Math.max(o.w, o.d) > 1.6);
    let arts = 0;
    for (const o of solidWalls) {
      if (arts >= 3) break;
      const horizontal = o.w >= o.d;
      const faceLow = horizontal ? wc[1] < o.y : wc[0] < o.x;
      const ax = horizontal ? o.x + o.w / 2 : faceLow ? o.x - 0.02 : o.x + o.w + 0.02;
      const ay = horizontal ? (faceLow ? o.y - 0.02 : o.y + o.d + 0.02) : o.y + o.d / 2;
      if (!clear(ax, ay, 0.3)) continue;
      const art = new THREE.Mesh(track(new THREE.BoxGeometry(horizontal ? 0.8 : 0.03, 0.6, horizontal ? 0.03 : 0.8)), track(new THREE.MeshStandardMaterial({ map: artTex(arts), roughness: 0.8 })));
      art.position.set(ax, 1.55, D - ay);
      scene.add(art);
      arts++;
    }

    // 햇빛: 창 밖 높은 곳에서 비스듬히
    const sun = new THREE.DirectionalLight("#fff1dc", 3.4);
    sun.position.set(W * 0.25, 7.5, -6.5);
    sun.target.position.set(W * 0.55, 0, D * 0.55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const ext = Math.max(W, D) * 1.2;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.5, far: 30 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    lights.add(sun, sun.target);
    lights.add(new THREE.HemisphereLight("#ffffff", "#d9d2c4", 0.2));
  } else {
    const size = Math.max(W, D * 1.15);
    lights.add(new THREE.HemisphereLight(0xffffff, 0xc1b6a4, 2.0));
    const sun = new THREE.DirectionalLight(0xfff7e8, 2.6);
    sun.position.set(-3, size * 1.6, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -size * 1.6, right: size * 1.6, top: size * 1.6, bottom: -size * 1.6 });
    sun.shadow.normalBias = 0.035;
    lights.add(sun);
    const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(400, 400)), mat("#eceee9", { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.18;
    ground.receiveShadow = true;
    scene.add(ground);
    toned.push({ mesh: ground, base: "#eceee9", role: "ground" });
  }

  // ── 공간 이름 표시(입체 배치도)
  const labels = new THREE.Group();
  scene.add(labels);
  const size = Math.max(W, D * 1.15);
  const tag = (label: string, x: number, y: number, width: number, color: string) => {
    const c = document.createElement("canvas");
    c.width = 700;
    c.height = 140;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 692, 132, 25);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '600 48px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 350, 72);
    const t = track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: t, depthTest: false, toneMapped: false })));
    sprite.scale.set(width, width * 0.2, 1);
    sprite.position.set(x, 1.3, D - y);
    sprite.renderOrder = 10;
    labels.add(sprite);
  };
  if (!photo) {
    for (const room of option.rooms) tag(room.label, room.x + room.w / 2, room.key === "work" ? room.y + 0.5 : room.y + room.d * 0.75, Math.min(3, Math.max(2, room.w * 0.75)) * (size / 11), "#1f2328");
    for (const z of option.zones ?? []) tag(z.label, z.x, z.y, 1.7 * (size / 11), "#1f7a5c");
  }

  const setWalls = (full: boolean) => {
    for (const m of outer) {
      const o = m.userData.o as Obj;
      const h = full || o.name === "후면 벽" ? o.h : 0.24;
      m.scale.y = h / o.h;
      m.position.y = o.z + h / 2;
    }
  };
  if (!photo) setWalls(false);

  const setStyle = (id: string) => {
    const style = getStyle(id);
    const finish = FINISH[style.id] ?? FINISH.natural;
    for (const { mesh, base, role } of toned) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (role === "floor") {
        m.map = finish.floor === "plank" ? tex.plank : tex.stone;
        m.map.repeat.set(W / 3, D / 3);
        m.color.set(photo ? finish.floorTint : (style.colors[base] ?? base));
        m.needsUpdate = true;
      } else if (role === "carpet") {
        m.map = tex.fabric;
        m.color.set(photo ? finish.carpet : (style.colors[base] ?? base));
        m.needsUpdate = true;
      } else if (role === "wall" && photo) m.color.set(mesh.userData.partition && style.id === "chic" ? "#4a4f57" : finish.wall);
      else if (role === "ceiling") m.color.set(finish.ceiling);
      else if (role === "ground") m.color.set(style.background);
      else m.color.set(style.colors[base] ?? base);
    }
    scene.background = new THREE.Color(photo ? "#f4f4f2" : style.background);
  };
  setStyle(styleId);

  return {
    scene,
    labels,
    setStyle,
    setWalls,
    setLabels: (show) => {
      labels.visible = show;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** 렌더러와 환경광. 눈높이 장면은 노출을 조금 높이고 주변광 차폐(GTAO)를 쓴다. */
export function makeRenderer(canvas: HTMLCanvasElement, mode: SceneMode) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = mode === "photo" ? 0.95 : 1.25;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return { renderer, envMap };
}

/** 눈높이 시점 후보: 출입구, 창가, 회의실 앞. 벽 안에 들어가는 시점은 뺀다. */
export function eyeShots(option: LayoutOption): Shot[] {
  const { W, D } = option;
  const tall = option.objects.filter((o) => (o.kind === "partition" || o.kind === "glass" || o.kind === "outer") && o.h > 1.5);
  // 눈높이 가까이 올라오는 가구(모니터·수납장·칸막이)와도 거리를 둔다.
  const high = option.objects.filter((o) => o.kind === "furniture" && o.z + o.h > 1.0);
  const near = (list: typeof tall, x: number, y: number, m: number) => list.some((o) => x > o.x - m && x < o.x + o.w + m && y > o.y - m && y < o.y + o.d + m);
  const free = (x: number, y: number) => x > 0.35 && x < W - 0.35 && y > 0.35 && y < D - 0.35 && !near(tall, x, y, 0.35) && !near(high, x, y, 1.0);
  const shots: Shot[] = [];
  const entX = (option.marks.entrance.x1 + option.marks.entrance.x2) / 2;
  const entranceRight = entX > W / 2;
  const path = option.visitorPath ?? [];
  // 1. 들어서며 본 모습: 출입구 안쪽에서 반대편 창가 쪽을 본다.
  const start: [number, number] = path[1] ? [path[1][0], Math.max(path[1][1], 0.9)] : [entX, 0.9];
  const workRoom = option.rooms.find((r) => r.key === "work");
  const workC: [number, number] = workRoom ? [workRoom.x + workRoom.w / 2, workRoom.y + workRoom.d * 0.7] : [W / 2, D * 0.7];
  shots.push({ label: "들어서며 본 모습", pos: start, h: 1.5, target: [(workC[0] + (entranceRight ? W * 0.2 : W * 0.8)) / 2, Math.max(workC[1], D * 0.6)], th: 1.0 });
  // 2. 창가에서 본 모습: 안쪽 벽 가까이에서 출입구 쪽을 본다(창이 등 뒤라 밝다).
  const work = option.rooms.find((r) => r.key === "work");
  const candidates: [number, number][] = [];
  if (work)
    for (const fx of [0.82, 0.18, 0.5, 0.65, 0.35])
      for (const fy of [0.92, 0.8, 0.65, 0.5]) candidates.push([work.x + work.w * (entranceRight ? fx : 1 - fx), work.y + work.d * fy]);
  const back = candidates.find(([x, y]) => free(x, y));
  if (option.purpose === "focus" && path.length >= 3) {
    // 한 방향 좌석은 통로에서 창 쪽으로 비스듬히 봐야 줄이 보인다.
    const aisle = path[2];
    shots.push({ label: "통로에서 본 모습", pos: [aisle[0], Math.max(aisle[1], 1.0)], h: 1.6, target: [entranceRight ? W * 0.15 : W * 0.85, D * 0.92], th: 0.7 });
  } else if (back) shots.push({ label: "창가에서 본 모습", pos: back, h: 1.45, target: [entranceRight ? W * 0.25 : W * 0.75, D * 0.2], th: 0.95 });
  // 3. 회의실(없으면 협업 테이블·라운지) 앞에서
  const meeting = option.rooms.find((r) => r.key === "meeting");
  if (meeting) {
    const door = option.marks.doors.find((d) => (d.vertical ? Math.abs(d.x - meeting.x - meeting.w) < 0.2 || Math.abs(d.x + 0.1 - meeting.x) < 0.2 : Math.abs(d.y - meeting.y - meeting.d) < 0.2 || Math.abs(d.y + 0.1 - meeting.y) < 0.2) && (d.vertical ? d.y >= meeting.y - 0.1 && d.y <= meeting.y + meeting.d : d.x >= meeting.x - 0.1 && d.x <= meeting.x + meeting.w));
    const mc: [number, number] = [meeting.x + meeting.w / 2, meeting.y + meeting.d / 2];
    const tries: [number, number][] = [];
    if (door) {
      const dc: [number, number] = door.vertical ? [door.x + 0.05, door.y + door.w / 2] : [door.x + door.w / 2, door.y + 0.05];
      const vx = dc[0] - mc[0];
      const vy = dc[1] - mc[1];
      const len = Math.hypot(vx, vy) || 1;
      for (const k of [1.6, 2.0, 1.2, 2.4]) tries.push([dc[0] + (vx / len) * k, dc[1] + (vy / len) * k]);
    }
    const p = tries.find(([x, y]) => free(x, y));
    // 첫 시점과 거의 같은 자리면 빼고 다른 각도를 찾는다.
    const far = tries.filter(([x, y]) => free(x, y) && Math.hypot(x - start[0], y - start[1]) > 1.8);
    const q = far[0] ?? p;
    if (q && Math.hypot(q[0] - start[0], q[1] - start[1]) > 1.8) shots.push({ label: "회의실 쪽에서 본 모습", pos: q, h: 1.45, target: mc, th: 0.85 });
  }
  return shots;
}
