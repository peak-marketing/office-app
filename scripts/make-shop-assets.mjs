// 쇼핑 예시 상품의 사진(jpg)과 3D 모델(glb)을 만든다. 개발용 도구이며 결과는 seed-assets/에 넣어 저장소에 보관한다.
// 실제 상품 사진이 아니라 간단한 3D 개념 모형을 렌더링한 이미지다(시연 데이터에 ‘예시 상품’으로 표시).
//   node scripts/make-shop-assets.mjs        (Google Chrome 필요)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const outDir = path.join(root, "seed-assets");
const THREE_DIR = path.join(root, "node_modules/three");

// 상품 모형: kind별 만들기 함수가 page 안에 있다. 크기 단위 m
export const SHOP_MODELS = [
  { code: "p01", kind: "sofa", w: 2.1, d: 0.9, h: 0.82, color: "#d8cbb8", glb: true },
  { code: "p02", kind: "desk", w: 1.2, d: 0.6, h: 0.74, color: "#b88a5a", glb: true },
  { code: "p03", kind: "chair", w: 0.64, d: 0.64, h: 1.1, color: "#3a3f46", glb: false },
  { code: "p04", kind: "shelf", w: 0.8, d: 0.3, h: 1.8, color: "#e9e4dc", glb: true },
  { code: "p05", kind: "bed", w: 1.6, d: 2.1, h: 0.9, color: "#cfc2b0", glb: false },
  { code: "p06", kind: "lamp", w: 0.4, d: 0.4, h: 1.6, color: "#f2efe8", glb: false },
  { code: "p07", kind: "rug", w: 2.0, d: 1.4, h: 0.012, color: "#a9b3a0", glb: false },
  { code: "p08", kind: "plant", w: 0.45, d: 0.45, h: 1.1, color: "#5c7f4f", glb: false },
  { code: "p09", kind: "cabinet", w: 1.2, d: 0.42, h: 0.75, color: "#f5f3ef", glb: false },
  { code: "p10", kind: "modular", w: 1.6, d: 0.35, h: 1.2, color: "#2f3338", glb: true },
];

const PAGE = `<!doctype html><html><head><style>html,body{margin:0;background:#fff}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head>
<body><canvas id="c" width="900" height="900"></canvas>
<script type="module">
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(900, 900, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const mat = (c, r = 0.75, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const box = (g, w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
const cyl = (g, rt, rb, h, x, y, z, m, seg = 24) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
const metal = mat("#2b2d31", 0.35, 0.6);
const B = {
  sofa(g, w, d, h, c) {
    const f = mat(c, 0.95); const leg = mat("#6b4a2f", 0.6);
    box(g, w, 0.18, d, 0, 0.17, 0, f);
    for (let i = 0; i < 3; i++) box(g, (w - 0.36) / 3 - 0.02, 0.16, d - 0.22, -((w - 0.36) / 3) + i * ((w - 0.36) / 3), 0.34, 0.08, f);
    box(g, w - 0.3, h - 0.26, 0.2, 0, (h + 0.26) / 2, -d / 2 + 0.1, f);
    box(g, 0.18, 0.5, d, -w / 2 + 0.09, 0.33, 0, f); box(g, 0.18, 0.5, d, w / 2 - 0.09, 0.33, 0, f);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.025, 0.02, 0.08, sx * (w / 2 - 0.08), 0.04, sz * (d / 2 - 0.08), leg);
  },
  desk(g, w, d, h, c) {
    const top = mat(c, 0.55); box(g, w, 0.03, d, 0, h - 0.015, 0, top);
    for (const sx of [-1, 1]) { box(g, 0.04, h - 0.03, 0.04, sx * (w / 2 - 0.05), (h - 0.03) / 2, d / 2 - 0.05, metal); box(g, 0.04, h - 0.03, 0.04, sx * (w / 2 - 0.05), (h - 0.03) / 2, -d / 2 + 0.05, metal); box(g, 0.04, 0.04, d - 0.1, sx * (w / 2 - 0.05), 0.12, 0, metal); }
    box(g, w * 0.32, 0.1, d * 0.85, w / 2 - w * 0.2, h - 0.09, 0, top);
  },
  chair(g, w, d, h, c) {
    const f = mat(c, 0.9);
    box(g, 0.5, 0.08, 0.48, 0, 0.47, 0.02, f); box(g, 0.48, 0.58, 0.06, 0, 0.82, -0.22, f);
    cyl(g, 0.025, 0.025, 0.36, 0, 0.27, 0, metal);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leg = box(g, 0.3, 0.03, 0.04, Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15, metal); leg.rotation.y = -a; cyl(g, 0.025, 0.025, 0.05, Math.cos(a) * 0.29, 0.025, Math.sin(a) * 0.29, metal); }
    for (const sx of [-1, 1]) { box(g, 0.05, 0.03, 0.3, sx * 0.29, 0.66, 0.02, metal); box(g, 0.03, 0.18, 0.03, sx * 0.29, 0.57, 0.02, metal); }
  },
  shelf(g, w, d, h, c) {
    const m = mat(c, 0.6); box(g, 0.025, h, d, -w / 2 + 0.0125, h / 2, 0, m); box(g, 0.025, h, d, w / 2 - 0.0125, h / 2, 0, m); box(g, w, h, 0.01, 0, h / 2, -d / 2 + 0.005, m);
    for (let i = 0; i <= 5; i++) box(g, w - 0.05, 0.022, d, 0, 0.02 + i * ((h - 0.04) / 5), 0, m);
    const books = ["#7a8c99", "#c9a66b", "#9b5c4f", "#4f6b5c", "#d9d2c5"];
    for (let s = 1; s < 4; s++) for (let i = 0; i < 6; i++) box(g, 0.035, 0.22 + (i % 3) * 0.03, d * 0.75, -w / 2 + 0.08 + i * 0.045, 0.02 + s * ((h - 0.04) / 5) + 0.13, 0.01, mat(books[(i + s) % 5], 0.8));
  },
  bed(g, w, d, h, c) {
    const fr = mat(c, 0.8); const sheet = mat("#f4f1ea", 0.95);
    box(g, w, 0.28, d, 0, 0.16, 0, fr); box(g, w - 0.06, 0.22, d - 0.08, 0, 0.41, 0.02, sheet);
    box(g, w, h, 0.08, 0, h / 2, -d / 2 + 0.04, fr);
    for (const sx of [-1, 1]) box(g, w / 2 - 0.15, 0.12, 0.38, sx * (w / 4), 0.58, -d / 2 + 0.32, mat("#ffffff", 0.95));
    box(g, w - 0.04, 0.06, d * 0.55, 0, 0.53, d * 0.2, mat("#b9c4c9", 0.95));
  },
  lamp(g, w, d, h, c) {
    cyl(g, 0.16, 0.18, 0.03, 0, 0.015, 0, metal, 32); cyl(g, 0.012, 0.012, h - 0.35, 0, (h - 0.35) / 2 + 0.03, 0, metal);
    const shade = cyl(g, 0.12, w / 2, 0.32, 0, h - 0.16, 0, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, emissive: "#fff3d6", emissiveIntensity: 0.35, side: THREE.DoubleSide }), 40);
    shade.geometry = new THREE.CylinderGeometry(0.12, w / 2, 0.32, 40, 1, true);
  },
  rug(g, w, d, h, c) {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 360; const x = cv.getContext("2d");
    x.fillStyle = c; x.fillRect(0, 0, 512, 360); x.strokeStyle = "#ece6da"; x.lineWidth = 14; x.strokeRect(24, 24, 464, 312);
    x.fillStyle = "#8a947f"; for (let i = 0; i < 9; i++) x.fillRect(70 + i * 42, 90, 14, 180);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const o = box(g, w, h, d, 0, h / 2, 0, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })); o.castShadow = false;
  },
  plant(g, w, d, h, c) {
    cyl(g, 0.17, 0.13, 0.32, 0, 0.16, 0, mat("#d9cfc2", 0.7), 32);
    const leaf = mat(c, 0.8);
    for (let i = 0; i < 14; i++) { const a = i * 2.4; const r = 0.06 + (i % 4) * 0.035; const s = new THREE.Mesh(new THREE.SphereGeometry(0.11 + (i % 3) * 0.02, 12, 10), leaf); s.scale.set(1, 0.45, 0.6); s.position.set(Math.cos(a) * r, 0.45 + (i / 14) * (h - 0.6), Math.sin(a) * r); s.rotation.set(a, a * 0.5, 0.6); s.castShadow = true; g.add(s); }
    cyl(g, 0.012, 0.015, h - 0.4, 0, 0.32 + (h - 0.4) / 2, 0, mat("#6b5a40"));
  },
  cabinet(g, w, d, h, c) {
    const m = mat(c, 0.5); box(g, w, h - 0.08, d, 0, (h - 0.08) / 2 + 0.08, 0, m);
    for (let i = 0; i < 3; i++) { box(g, w / 3 - 0.012, h - 0.12, 0.004, -w / 3 + i * (w / 3), (h - 0.08) / 2 + 0.08, d / 2 + 0.002, mat(c, 0.45)); box(g, 0.012, 0.12, 0.02, -w / 3 + i * (w / 3) + w / 6 - 0.04, h * 0.62, d / 2 + 0.012, mat("#b89463", 0.3, 0.6)); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.012, 0.012, 0.08, sx * (w / 2 - 0.05), 0.04, sz * (d / 2 - 0.05), mat("#b89463", 0.3, 0.6));
  },
  modular(g, w, d, h, c) {
    const m = mat(c, 0.4, 0.5); const wood = mat("#c7a27a", 0.6);
    for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2 + 0.01, d / 2 - 0.01]) box(g, 0.02, h, 0.02, x, h / 2, z, m);
    for (let i = 0; i < 4; i++) box(g, w, 0.025, d, 0, 0.05 + i * ((h - 0.08) / 3), 0, wood);
    box(g, 0.3, 0.2, 0.25, -w / 4, 0.05 + (h - 0.08) / 3 + 0.11, 0, mat("#e8e2d8", 0.8)); cyl(g, 0.06, 0.05, 0.2, w / 4, 0.05 + 2 * (h - 0.08) / 3 + 0.11, 0, mat("#9fb0a3", 0.6));
  },
};
window.build = (spec, angle) => {
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#f6f5f2");
  scene.add(new THREE.HemisphereLight("#ffffff", "#d9d4cc", 1.6));
  const sun = new THREE.DirectionalLight("#ffffff", 2.4); sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const s = 4; Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s }); scene.add(sun);
  const fill = new THREE.DirectionalLight("#ffffff", 0.6); fill.position.set(-4, 3, 2); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.18 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const g = new THREE.Group(); g.name = spec.code; B[spec.kind](g, spec.w, spec.d, spec.h, spec.color); scene.add(g);
  const size = Math.max(spec.w, spec.d, spec.h);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const dist = size * 2.5 + 0.6; const a = angle;
  cam.position.set(Math.sin(a) * dist, Math.max(spec.h * 0.9, size * 0.75) + (spec.kind === "rug" ? 1.4 : 0.2), Math.cos(a) * dist);
  cam.lookAt(0, spec.kind === "rug" ? 0 : spec.h * 0.42, 0);
  renderer.render(scene, cam);
  window.lastGroup = g;
  return true;
};
window.exportGlb = () => new Promise((res, rej) => new GLTFExporter().parse(window.lastGroup, (buf) => {
  const bytes = new Uint8Array(buf); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); res(btoa(s));
}, rej, { binary: true }));
window.ready = true;
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") return res.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
  if (url.startsWith("/three/")) {
    const file = path.join(THREE_DIR, url.slice("/three/".length));
    if (!file.startsWith(THREE_DIR) || !fs.existsSync(file)) return res.writeHead(404).end();
    return res.writeHead(200, { "Content-Type": "text/javascript" }).end(fs.readFileSync(file));
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.ready === true);
fs.mkdirSync(outDir, { recursive: true });
for (const spec of SHOP_MODELS) {
  for (const [i, angle] of [0.62, -0.95].entries()) {
    await page.evaluate(([s, a]) => window.build(s, a), [spec, angle]);
    await page.locator("#c").screenshot({ path: path.join(outDir, `${spec.code}-${i + 1}.jpg`), type: "jpeg", quality: 86 });
  }
  if (spec.glb) {
    await page.evaluate(([s]) => window.build(s, 0.62), [spec]);
    const b64 = await page.evaluate(() => window.exportGlb());
    fs.writeFileSync(path.join(outDir, `${spec.code}.glb`), Buffer.from(b64, "base64"));
  }
  console.log("made", spec.code);
}
await browser.close();
server.close();
