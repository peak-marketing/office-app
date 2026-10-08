import sharp from "sharp";
import { parseRecognition, type PlanRecognition } from "./geometry";
import type { Pt } from "../space/geometry";

// The model identifies features. Their final coordinates must be supported by the source raster.
// This module never reads fixture names, expected coordinates, or physical room dimensions.
type Axis = "x" | "y";
interface Segment { axis: Axis; normal: number; lo: number; hi: number }
interface Band { lo: number; hi: number; support: number }
interface Line extends Segment { band: Band; outer: boolean }
interface Gap { line: number; lo: number; hi: number }

class Raster {
  readonly ink: Uint8Array;
  constructor(readonly width: number, readonly height: number, rgb: Buffer) {
    this.ink = new Uint8Array(width * height);
    for (let i = 0; i < this.ink.length; i++) {
      const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
      // Separate dark structural ink from coloured window symbols; thin monochrome symbols
      // are separated later by contiguous ink thickness, not by colour alone.
      this.ink[i] = (r * 299 + g * 587 + b * 114) < 110000 && Math.max(r, g, b) - Math.min(r, g, b) < 55 ? 1 : 0;
    }
  }
  at(axis: Axis, normal: number, along: number) {
    const x = axis === "x" ? along : normal, y = axis === "x" ? normal : along;
    return x >= 0 && y >= 0 && x < this.width && y < this.height ? this.ink[y * this.width + x] : 0;
  }
  band(s: Segment, radius: number): Band {
    const nMax = s.axis === "x" ? this.height : this.width;
    const aMax = s.axis === "x" ? this.width : this.height;
    const start = Math.max(0, Math.ceil(s.lo)), end = Math.min(aMax, Math.floor(s.hi));
    if (end - start < 12) throw new Error("짧은 벽의 위치를 원본 선에서 확인하지 못했어요.");
    const bands: Band[] = [];
    let first = -1, total = 0, count = 0;
    for (let n = Math.max(0, Math.floor(s.normal - radius)); n <= Math.min(nMax, Math.ceil(s.normal + radius)); n++) {
      let dark = 0;
      if (n < nMax) for (let a = start; a < end; a++) dark += this.at(s.axis, n, a);
      const support = dark / (end - start);
      if (support >= 0.32) { if (first < 0) first = n; total += support; count++; }
      else if (first >= 0) {
        if (n - first >= 3) bands.push({ lo: first, hi: n, support: total / count });
        first = -1; total = 0; count = 0;
      }
    }
    if (first >= 0 && count >= 3) bands.push({ lo: first, hi: first + count, support: total / count });
    const distance = (b: Band) => Math.max(b.lo - s.normal, s.normal - b.hi, 0);
    bands.sort((a,b) => distance(a) - distance(b) || b.support - a.support);
    if (!bands[0]) throw new Error("인식한 벽을 원본의 선과 맞추지 못했어요. 선명한 도면으로 다시 확인해 주세요.");
    if (bands[1] && Math.abs(distance(bands[0]) - distance(bands[1])) < 2) throw new Error("가까운 벽이 여러 개라 위치를 확정하지 못했어요. 도면을 확대해 확인해 주세요.");
    return bands[0];
  }
  solid(l: Line, along: number) {
    let max = 0, run = 0;
    for (let n = l.band.lo; n < l.band.hi; n++) {
      run = this.at(l.axis, n, along) ? run + 1 : 0;
      max = Math.max(max, run);
    }
    // A wall is a contiguous thick stroke. Window rails, door leaves and swing arcs are thin.
    return max >= Math.max(3, (l.band.hi - l.band.lo) * 0.65);
  }
  intervals(l: Line, solid: boolean, margin = 0) {
    const limit = l.axis === "x" ? this.width : this.height;
    const start = Math.max(0, Math.floor(l.lo - margin)), end = Math.min(limit, Math.ceil(l.hi + margin));
    const bits: boolean[] = [];
    for (let a = start; a < end; a++) bits.push(this.solid(l, a));
    // Close isolated one-pixel scan/antialiasing noise, preserving actual opening gaps.
    for (let i = 1; i + 1 < bits.length; i++) if (bits[i - 1] && bits[i + 1]) bits[i] = true;
    const ranges: {lo:number;hi:number}[] = [];
    let first = -1;
    for (let i = 0; i <= bits.length; i++) {
      if (i < bits.length && bits[i] === solid) { if (first < 0) first = i; }
      else if (first >= 0) { ranges.push({lo:start+first,hi:start+i});first=-1; }
    }
    return ranges;
  }
}

function segment(a: Pt, b: Pt): Segment {
  const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
  if (Math.min(dx,dy) > 3 || Math.max(dx,dy) < 12) throw new Error("인식한 선이 직각 벽으로 확인되지 않았어요. 원본 도면을 확인해 주세요.");
  return dx >= dy ? {axis:"x",normal:(a[1]+b[1])/2,lo:Math.min(a[0],b[0]),hi:Math.max(a[0],b[0])}
    : {axis:"y",normal:(a[0]+b[0])/2,lo:Math.min(a[1],b[1]),hi:Math.max(a[1],b[1])};
}
const endpoints = (l: Segment): [Pt,Pt] => l.axis === "x" ? [[l.lo,l.normal],[l.hi,l.normal]] : [[l.normal,l.lo],[l.normal,l.hi]];
const intersect = (a: Line, b: Line): Pt => {
  if (a.axis === b.axis) throw new Error("외곽 벽의 모서리 연결을 확인하지 못했어요.");
  return a.axis === "x" ? [b.normal,a.normal] : [a.normal,b.normal];
};

/** Refine all features from image evidence; missing/ambiguous evidence is an error, never a guess. */
export async function refineRecognition(image: Buffer, raw: unknown): Promise<PlanRecognition> {
  const plan = parseRecognition(raw);
  const {data,info} = await sharp(image,{limitInputPixels:9_000_000}).flatten({background:"#fff"}).toColourspace("srgb").removeAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height,channels} = info;
  if (width > 3000 || height > 3000 || channels !== 3) throw new Error("분석 이미지 크기나 형식을 확인해 주세요.");
  const raster = new Raster(width,height,data);
  const pixel = ([x,y]:Pt):Pt => [x*width,y*height];
  const fraction = ([x,y]:Pt):Pt => [x/width,y/height];
  const radius = Math.max(16, Math.min(width,height)*0.045);
  const pts = plan.outline.map(pixel);
  if(pts.length>4 && Math.hypot(pts[0][0]-pts.at(-1)![0],pts[0][1]-pts.at(-1)![1])<2)pts.pop();
  const area = pts.reduce((s,a,i)=>{const b=pts[(i+1)%pts.length];return s+a[0]*b[1]-a[1]*b[0];},0);
  const outer:Line[] = pts.map((a,i)=>{
    const b=pts[(i+1)%pts.length],s=segment(a,b),band=raster.band(s,radius);
    const inward = (area > 0 ? 1 : -1) * (s.axis === "x" ? b[0]-a[0] : a[1]-b[1]);
    return {...s,band,outer:true,normal:inward>0?band.hi:band.lo};
  });
  const refinedOutline = outer.map((l,i)=>intersect(outer[(i+outer.length-1)%outer.length],l));
  outer.forEach((l,i)=>{const a=refinedOutline[i],b=refinedOutline[(i+1)%outer.length];l.lo=l.axis==="x"?Math.min(a[0],b[0]):Math.min(a[1],b[1]);l.hi=l.axis==="x"?Math.max(a[0],b[0]):Math.max(a[1],b[1]);});
  const wallParts:Line[] = plan.walls.map(w=>{
    const s=segment(pixel(w.a),pixel(w.b)),band=raster.band(s,radius);
    return {...s,band,outer:false,normal:(band.lo+band.hi)/2};
  });
  // One structural wall may be split at a T/cross junction in the model response.
  // Join only pieces measured on the same raster band that actually meet or overlap.
  const walls:Line[]=[];
  for(const part of wallParts.sort((a,b)=>a.axis.localeCompare(b.axis)||a.normal-b.normal||a.lo-b.lo)){
    const other=walls.find(w=>w.axis===part.axis&&Math.abs(w.normal-part.normal)<.01&&part.lo<=w.hi+2&&part.hi>=w.lo-2);
    if(other){other.lo=Math.min(other.lo,part.lo);other.hi=Math.max(other.hi,part.hi);}
    else walls.push(part);
  }
  const lines = [...outer,...walls];
  for (const l of walls) {
    const ink = raster.intervals(l,true,radius).filter(r=>r.hi-r.lo>=8 && r.hi>l.lo+2 && r.lo<l.hi-2);
    if (!ink.length) throw new Error("내부 벽 끝을 원본의 선에서 찾지 못했어요.");
    for (const end of ["lo","hi"] as const) {
      const terminal = end === "lo" ? Math.min(...ink.map(r=>r.lo)) : Math.max(...ink.map(r=>r.hi));
      const candidates = lines.filter(q=>q!==l && q.axis!==l.axis && l.normal>=q.lo-1 && l.normal<=q.hi+1)
        .filter(q=>Math.abs(q.normal-l[end])<=radius && (terminal>=q.band.lo-2&&terminal<=q.band.hi+2 || Math.abs(q.normal-terminal)<=(l.band.hi-l.band.lo)/2+2))
        .map(q=>q.normal).sort((a,b)=>Math.abs(a-l[end])-Math.abs(b-l[end]));
      // Joining requires actual ink reaching the host. A genuinely free wall stays free.
      l[end] = candidates[0] ?? terminal;
    }
  }
  const gaps:Gap[] = lines.flatMap((l,i)=>raster.intervals(l,false).filter(g=>g.hi-g.lo>=8).map(g=>({...g,line:i})));
  const used = new Set<number>();
  plan.openings = plan.openings.map(o=>{
    const a=pixel(o.a),b=pixel(o.b),s=segment(a,b),mid=(s.lo+s.hi)/2;
    const candidates=gaps.map((g,i)=>{
      const l=lines[g.line],overlap=Math.max(0,Math.min(g.hi,s.hi)-Math.max(g.lo,s.lo));
      const normal=Math.abs(l.normal-s.normal),center=Math.abs((g.lo+g.hi)/2-mid);
      const score=normal*4+center-overlap;
      return {g,i,l,normal,center,overlap,score};
    }).filter(c=>!used.has(c.i)&&c.l.axis===s.axis&&c.normal<=radius&&c.overlap>=Math.min(8,(c.g.hi-c.g.lo)*.25))
      .sort((a,b)=>a.score-b.score);
    const best=candidates[0];
    if(!best)throw new Error("문·창의 틈을 원본의 선에서 확인하지 못했어요. 위치를 확인해 주세요.");
    if(candidates[1]&&Math.abs(best.score-candidates[1].score)<3)throw new Error("문·창의 위치 후보가 여러 개예요. 원본 도면을 확인해 주세요.");
    used.add(best.i);
    const [aa,bb]=endpoints({...best.l,lo:best.g.lo,hi:best.g.hi});
    return {...o,a:fraction(aa),b:fraction(bb)};
  });
  if(gaps.some((g,i)=>!used.has(i)))throw new Error("원본에 문·창으로 보이는 틈이 더 있어요. 누락 없이 읽을 수 있도록 다시 확인해야 해요.");
  plan.outline=refinedOutline.map(fraction);
  plan.walls=walls.map(l=>{const [a,b]=endpoints(l);return {a:fraction(a),b:fraction(b)};});
  return parseRecognition(plan);
}
