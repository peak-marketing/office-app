// 도면 따라 그리기 검사(office-trace)용 테스트 도면을 만든다. 만든 파일은 이 폴더에 커밋해 두므로 평소에는 다시 돌릴 필요가 없다.
//   node tests/e2e/fixtures/make-trace-fixtures.cjs
// trace-L.png  ㄱ자 도면(8,000 × 7,000, 오른쪽 아래 3,000 × 3,000 빠짐) 1200×1000px, 1px = 10mm
// trace-R.png  직사각형 도면(10,000 × 8,000, 왼쪽 벽에 문) 1200×1000px, 1px = 10mm
// trace-L.pdf  trace-L.png를 1200×1000px 한 쪽 PDF로 감싼 것(앱은 2배로 그려 2400×2000으로 띄운다)
// 2026-10-02 작업 기록(mkdrawing.cjs L4622·L4910·L4915·L4926, mkpdf.cjs L4627)의 마지막 상태를 한 파일로 옮겼다.
// test-L-drawing.png(1000×800, 사용성 테스트 도면)는 output/usability-test-20261002/에서 복사해 둔 파일이다(생성 스크립트 없음).
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const html = (kind) => `<!doctype html><html><body style="margin:0;background:#fff">
<canvas id="c" width="1200" height="1000"></canvas>
<script>{
const c = document.getElementById("c").getContext("2d");
c.fillStyle = "#fff"; c.fillRect(0, 0, 1200, 1000);
c.strokeStyle = "#222"; c.lineWidth = 8; c.lineJoin = "miter";
const pts = ${kind === "L" ? "[[100,100],[900,100],[900,500],[600,500],[600,800],[100,800]]" : "[[100,100],[1100,100],[1100,900],[100,900]]"};
c.beginPath(); pts.forEach(([x,y],i)=> i? c.lineTo(x,y): c.moveTo(x,y)); c.closePath(); c.stroke();
c.lineWidth = 1; c.font = "22px sans-serif"; c.fillStyle = "#222";
const dim = (x1,y1,x2,y2,t,ox,oy) => { c.beginPath(); c.moveTo(x1+ox,y1+oy); c.lineTo(x2+ox,y2+oy); c.stroke(); c.fillText(t,(x1+x2)/2+ox-25,(y1+y2)/2+oy-6); };
${
  kind === "L"
    ? `dim(100,100,900,100,"8,000",0,-40); dim(100,100,100,800,"7,000",-80,0); dim(600,800,100,800,"5,000",0,50); dim(900,100,900,500,"4,000",30,0);
c.fillStyle="#fff"; c.fillRect(280,794,100,12); c.fillStyle="#222"; c.fillText("현관 1,000",270,840);`
    : `dim(100,100,1100,100,"10,000",0,-40); dim(100,100,100,900,"8,000",-55,0); c.fillStyle="#fff"; c.fillRect(94,300,12,100); c.fillStyle="#222"; c.fillText("문",40,355);`
}
c.fillText("테스트 도면 (예시) 1:100", 820, 970);
}</script></body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const p = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  for (const kind of ["L", "R"]) {
    await p.setContent(html(kind));
    await p.locator("#c").screenshot({ path: path.join(__dirname, `trace-${kind}.png`) });
  }
  const b64 = fs.readFileSync(path.join(__dirname, "trace-L.png")).toString("base64");
  await p.setContent(`<!doctype html><html><head><style>@page{size:1200px 1000px;margin:0}body{margin:0}</style></head><body><img src="data:image/png;base64,${b64}" style="width:1200px;height:1000px;display:block"></body></html>`);
  await p.pdf({ path: path.join(__dirname, "trace-L.pdf"), width: "1200px", height: "1000px", printBackground: true });
  await browser.close();
  if (errors.length) throw new Error(errors.join(" | "));
  console.log("trace-L.png · trace-R.png · trace-L.pdf 만듦");
})();
