import type { Box, Pt } from "./geometry";
import type { HouseModel, RoomKind } from "./house";

// 방 찾기. 집 윤곽 안을 50mm 격자로 나누고, 내부 벽이 지나는 칸을 막은 뒤 이어진 칸끼리 묶는다(4방향 채우기).
// 문·통로는 방을 잇는 자리일 뿐 벽을 끊지 않는다. 그래서 방은 벽으로만 나뉘고, 벽 끝이 닿지 않으면 두 방이 하나로 이어진다.
// 같은 입력이면 늘 같은 결과(칸 순서대로 번호를 매긴다)가 나와 서버와 화면이 같은 방을 본다.

export const GRID = 0.05;
/** 이보다 작거나(면적) 좁은(가장 넓은 곳의 폭) 영역은 방이 아니라 벽 사이 틈으로 본다. */
export const SLIVER_AREA = 0.25;
export const SLIVER_WIDTH = 0.3;
/** 이보다 작은 방은 확인을 권한다. */
export const SMALL_ROOM_AREA = 1;

const OUTSIDE = -2;
const WALL = -1;
const FREE = -3;

export interface HouseRaster {
  nx: number;
  ny: number;
  /** 칸마다: -2 집 밖, -1 벽, 0 이상 영역 번호 */
  cells: Int32Array;
}

export interface HouseRegion {
  /** 찾은 순서(아래 줄부터, 왼쪽부터) */
  idx: number;
  /** 이름 라벨 id, 없으면 r{번호} */
  key: string;
  labelId: string | null;
  /** 붙인 이름. 없으면 빈 값 */
  name: string;
  kind: RoomKind | null;
  /** 화면 표시 이름(이름 없는 방 N, 벽 사이 틈) */
  display: string;
  /** 면적(㎡). 칸 수 × 격자 면적이며 벽 두께를 뺀 안쪽 추정값이다. */
  area: number;
  /** 이름을 적을 자리(벽에서 가장 먼 칸) */
  anchor: Pt;
  box: Box;
  /** 바닥을 그릴 사각형들(칸을 줄·열로 합친 것) */
  rects: Box[];
  sliver: boolean;
}

export interface RoomDetection {
  regions: HouseRegion[];
  raster: HouseRaster;
  /** 다른 이름과 같은 방에 들어가 쓰이지 않는 이름 */
  dupLabels: { id: string; name: string; with: string }[];
  /** 어느 방에도 들지 않는 이름(벽 위·집 밖) */
  lostLabels: { id: string; name: string }[];
}

export function regionAt(raster: HouseRaster, x: number, y: number) {
  const i = Math.floor(x / GRID), j = Math.floor(y / GRID);
  if (i < 0 || j < 0 || i >= raster.nx || j >= raster.ny) return OUTSIDE;
  return raster.cells[j * raster.nx + i];
}

/** 점에서 가장 가까운 영역(반경 cells 칸 안). 벽 위에 찍힌 이름이나 가구 중심을 근처 방으로 보낼 때 쓴다. */
export function nearestRegion(raster: HouseRaster, x: number, y: number, radius = 6) {
  const i0 = Math.floor(x / GRID), j0 = Math.floor(y / GRID);
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= raster.nx || j >= raster.ny ? OUTSIDE : raster.cells[j * raster.nx + i]);
  const c = at(i0, j0);
  if (c >= 0) return c;
  for (let r = 1; r <= radius; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const v = at(i0 + di, j0 + dj);
        if (v >= 0) return v;
      }
  return c;
}

export function detectRooms(h: Pick<HouseModel, "outline" | "walls" | "labels">): RoomDetection {
  const { outline } = h;
  const W = Math.max(...outline.map((p) => p[0]));
  const D = Math.max(...outline.map((p) => p[1]));
  const nx = Math.max(1, Math.min(2000, Math.ceil(W / GRID - 1e-6)));
  const ny = Math.max(1, Math.min(2000, Math.ceil(D / GRID - 1e-6)));
  const cells = new Int32Array(nx * ny).fill(OUTSIDE);

  // 1. 집 안 칸: 줄마다 세로 변과 만나는 점 사이(칸 중심 기준, 꼭짓점은 반열린 구간으로 센다)
  const vertical = outline
    .map((a, k) => [a, outline[(k + 1) % outline.length]] as const)
    .filter(([a, b]) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) > 1e-9)
    .map(([a, b]) => ({ x: a[0], y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) }));
  for (let j = 0; j < ny; j++) {
    const yc = (j + 0.5) * GRID;
    const xs = vertical.filter((e) => e.y0 <= yc && yc < e.y1).map((e) => e.x).sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.floor(xs[k] / GRID - 0.5) + 1);
      const i1 = Math.min(nx - 1, Math.ceil(xs[k + 1] / GRID - 0.5) - 1);
      for (let i = i0; i <= i1; i++) cells[j * nx + i] = FREE;
    }
  }

  // 2. 벽 칸: 중심선에서 두께 절반(최소 한 칸) 안, 끝은 두께 절반만큼 늘려 모서리·T자 이음을 닫는다.
  for (const w of h.walls) {
    if (![w.a[0], w.a[1], w.b[0], w.b[1]].every(Number.isFinite)) continue;
    const half = Math.max((Number.isFinite(w.t) ? w.t : 0.1) / 2, GRID * 0.51);
    const x0 = Math.min(w.a[0], w.b[0]) - half, x1 = Math.max(w.a[0], w.b[0]) + half;
    const y0 = Math.min(w.a[1], w.b[1]) - half, y1 = Math.max(w.a[1], w.b[1]) + half;
    const i0 = Math.max(0, Math.ceil(x0 / GRID - 0.5 - 1e-9)), i1 = Math.min(nx - 1, Math.floor(x1 / GRID - 0.5 + 1e-9));
    const j0 = Math.max(0, Math.ceil(y0 / GRID - 0.5 - 1e-9)), j1 = Math.min(ny - 1, Math.floor(y1 / GRID - 0.5 + 1e-9));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (cells[j * nx + i] !== OUTSIDE) cells[j * nx + i] = WALL;
  }

  // 3. 이어진 칸 묶기(4방향). 아래 줄 왼쪽부터 번호를 매긴다.
  const queue = new Int32Array(nx * ny);
  const stats: { n: number; i0: number; i1: number; j0: number; j1: number }[] = [];
  for (let start = 0; start < nx * ny; start++) {
    if (cells[start] !== FREE) continue;
    const id = stats.length;
    const s = { n: 0, i0: nx, i1: -1, j0: ny, j1: -1 };
    let head = 0, tail = 0;
    queue[tail++] = start;
    cells[start] = id;
    while (head < tail) {
      const c = queue[head++];
      const i = c % nx, j = (c - i) / nx;
      s.n++;
      if (i < s.i0) s.i0 = i;
      if (i > s.i1) s.i1 = i;
      if (j < s.j0) s.j0 = j;
      if (j > s.j1) s.j1 = j;
      const visit = (k: number) => {
        if (cells[k] !== FREE) return;
        cells[k] = id;
        queue[tail++] = k;
      };
      if (i > 0) visit(c - 1);
      if (i < nx - 1) visit(c + 1);
      if (j > 0) visit(c - nx);
      if (j < ny - 1) visit(c + nx);
    }
    stats.push(s);
  }

  // 4. 이름 자리: 벽·집 밖에서 가장 먼 칸(3-4 거리 변환, 같으면 먼저 나온 칸)
  const INF = 1 << 29;
  const dist = new Int32Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) dist[k] = cells[k] >= 0 ? INF : 0;
  const get = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : dist[j * nx + i]);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], get(i - 1, j) + 3, get(i, j - 1) + 3, get(i - 1, j - 1) + 4, get(i + 1, j - 1) + 4);
    }
  for (let j = ny - 1; j >= 0; j--)
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], get(i + 1, j) + 3, get(i, j + 1) + 3, get(i + 1, j + 1) + 4, get(i - 1, j + 1) + 4);
    }
  const best = stats.map(() => ({ k: -1, d: -1 }));
  for (let k = 0; k < nx * ny; k++) {
    const id = cells[k];
    if (id >= 0 && dist[k] > best[id].d) best[id] = { k, d: dist[k] };
  }

  // 5. 바닥 사각형: 줄마다 같은 영역이 이어진 구간을 찾고, 위 줄과 구간이 같으면 합친다.
  const rects: { id: number; i0: number; i1: number; j0: number; j1: number }[] = [];
  let open = new Map<string, (typeof rects)[number]>();
  for (let j = 0; j < ny; j++) {
    const next = new Map<string, (typeof rects)[number]>();
    let i = 0;
    while (i < nx) {
      const id = cells[j * nx + i];
      if (id < 0) {
        i++;
        continue;
      }
      let e = i;
      while (e + 1 < nx && cells[j * nx + e + 1] === id) e++;
      const key = `${id}:${i}:${e}`;
      const prev = open.get(key);
      if (prev) {
        prev.j1 = j;
        next.set(key, prev);
      } else {
        const r = { id, i0: i, i1: e, j0: j, j1: j };
        rects.push(r);
        next.set(key, r);
      }
      i = e + 1;
    }
    open = next;
  }
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const toBox = (r: { i0: number; i1: number; j0: number; j1: number }): Box => ({ x: r4(r.i0 * GRID), y: r4(r.j0 * GRID), w: r4((r.i1 - r.i0 + 1) * GRID), d: r4((r.j1 - r.j0 + 1) * GRID) });

  // 6. 이름 붙이기: 라벨이 든 영역(벽 위면 가장 가까운 영역). 한 영역에 이름이 둘 이상이면 먼저 붙인 이름을 쓴다.
  const raster: HouseRaster = { nx, ny, cells };
  const named = new Map<number, { id: string; name: string; kind: RoomKind }>();
  const dupLabels: RoomDetection["dupLabels"] = [];
  const lostLabels: RoomDetection["lostLabels"] = [];
  for (const l of h.labels) {
    const id = Number.isFinite(l.x) && Number.isFinite(l.y) ? nearestRegion(raster, l.x, l.y) : OUTSIDE;
    if (id < 0) lostLabels.push({ id: l.id, name: l.name });
    else if (named.has(id)) dupLabels.push({ id: l.id, name: l.name, with: named.get(id)!.name });
    else named.set(id, { id: l.id, name: l.name, kind: l.kind });
  }

  let unnamed = 0;
  const regions: HouseRegion[] = stats.map((s, idx) => {
    const area = Math.round(s.n * GRID * GRID * 1000) / 1000;
    // 거리 변환 값은 한 칸에 3이다. 가장 넓은 곳의 폭이 SLIVER_WIDTH 이하면 틈으로 본다.
    const sliver = area < SLIVER_AREA || best[idx].d <= Math.round((SLIVER_WIDTH / GRID / 2) * 3);
    const label = named.get(idx);
    const k = best[idx].k;
    const ai = k % nx, aj = (k - ai) / nx;
    return {
      idx,
      key: label?.id ?? `r${idx + 1}`,
      labelId: label?.id ?? null,
      name: label?.name ?? "",
      kind: label?.kind ?? null,
      display: label?.name ?? (sliver ? "벽 사이 틈" : `이름 없는 방 ${++unnamed}`),
      area,
      anchor: [r4((ai + 0.5) * GRID), r4((aj + 0.5) * GRID)],
      box: { x: r4(s.i0 * GRID), y: r4(s.j0 * GRID), w: r4((s.i1 - s.i0 + 1) * GRID), d: r4((s.j1 - s.j0 + 1) * GRID) },
      rects: rects.filter((r) => r.id === idx).map(toBox),
      sliver,
    };
  });
  return { regions, raster, dupLabels, lostLabels };
}
