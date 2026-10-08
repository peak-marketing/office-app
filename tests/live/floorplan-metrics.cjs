// Compare only controlled fixture geometry. These thresholds are sample QA, not construction tolerances.
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const segmentDistance=(a,b)=>Math.min(Math.max(distance(a.a,b.a),distance(a.b,b.b)),Math.max(distance(a.a,b.b),distance(a.b,b.a)));
function measureRecognition(plan,truth){
  const pixel=q=>[q[0]*truth.iw,q[1]*truth.ih];
  const actual={outline:plan.outline.map(pixel),walls:plan.walls.map(w=>({a:pixel(w.a),b:pixel(w.b)})),openings:plan.openings.map(o=>({...o,a:pixel(o.a),b:pixel(o.b)}))};
  const maxNearest=(a,b,d)=>a.length&&b.length?Math.max(...a.map(p=>Math.min(...b.map(q=>d(p,q))))):a.length===b.length?0:Infinity;
  const symmetric=(a,b,d)=>Math.max(maxNearest(a,b,d),maxNearest(b,a,d));
  const outlinePx=symmetric(actual.outline,truth.outline,distance);
  const wallsPx=symmetric(actual.walls,truth.walls,segmentDistance);
  const openingsPx=symmetric(actual.openings,truth.openings,(a,b)=>a.kind===b.kind?segmentDistance(a,b):Infinity);
  const millimetersPerPixel=truth.widthMm/(Math.max(...truth.outline.map(q=>q[0]))-Math.min(...truth.outline.map(q=>q[0])));
  const maxErrorMm=Math.max(outlinePx,wallsPx,openingsPx)*millimetersPerPixel;
  const sameCounts=actual.outline.length===truth.outline.length&&actual.walls.length===truth.walls.length&&actual.openings.length===truth.openings.length;
  const sameLabels=plan.labels.length===truth.labels.length&&truth.labels.every(l=>plan.labels.some(p=>p.name===l.name&&p.kind===l.kind));
  return {outlinePx,wallsPx,openingsPx,maxErrorMm,sameCounts,sameLabels,
    printedWidthCorrect:plan.widthMm===truth.widthMm,
    sampleThresholdMm:100,withinSampleThreshold:sameCounts&&sameLabels&&plan.widthMm===truth.widthMm&&maxErrorMm<=100};
}
module.exports={measureRecognition};
