# -*- coding: utf-8 -*-
from pathlib import Path
import json,base64,runpy
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'output'
styles=json.loads((ROOT/'source/styles.json').read_text())
original=runpy.run_path(str(ROOT/'source/report.py'))
css=original['css']+'''.covergrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;margin-top:10mm}.card{border:1px solid #d8d9d5;border-radius:3mm;overflow:hidden}.card img{width:100%;display:block}.card .copy{padding:5mm}.card h2{font-size:20px;margin:0 0 3mm}.card p{font-size:12px;min-height:12mm}.chips{display:flex;flex-wrap:wrap;gap:9px 13px;font-size:11px;margin:12px 0 18px}.chips i{display:inline-block;width:13px;height:13px;border-radius:50%;vertical-align:middle;margin-right:5px}.comparison{margin-top:9mm}.comparison td,.comparison th{font-size:12px;padding:9px 10px}.smallnote{font-size:11px;color:#6b736c;margin-top:6mm}.style-note{padding:14px;background:#f0f0ec;border-left:3px solid var(--accent);line-height:1.8;font-size:12px}.specs td{padding:10px 5px;font-size:11px}.specs td:first-child{width:27mm;font-weight:600}.side h2{color:var(--accent)}'''
def img(s):return 'data:image/png;base64,'+base64.b64encode((OUT/(s['code']+'_'+s['name'])/'3D_배치도.png').read_bytes()).decode()
def chips(s):return '<div class="chips">'+''.join(f'<span><i style="background:{c}"></i>{n}</span>' for n,c in s['palette'])+'</div>'
def head(title,right):return f'<header><div><div class="eyebrow">OFFICE / THREE MOODS</div><h1>{title}</h1></div><p>{right}<br>2026.09.29 / 가정 치수 · 실측 전</p></header>'
def foot(n):return f'<div class="foot"><span>11,000 × 9,000 mm / 약 30평 / 업체 상담용 개념안 · 현장 실측 후 확정</span><span>{n}</span></div>'
cards=''.join(f'<div class="card"><img src="{img(s)}"><div class="copy"><h2 style="color:{s["accent"]}">{s["code"]} · {s["name"]}</h2><p>{s["tagline"]}</p>{chips(s)}</div></div>' for s in styles)
rows=''.join('<tr><th>'+styles[0]['specs'][i][0]+'</th>'+''.join('<td>'+s['specs'][i][1]+'</td>' for s in styles)+'</tr>' for i in range(5))
cover='<div class="page">'+head('30평 사무실 · 세 가지 스타일 비교','직원 8석 + 대표실 · 6인 회의실 · 탕비실')+'<div class="covergrid">'+cards+'</div><table class="comparison"><tr><th>마감 부위</th><th>A · 내추럴</th><th>B · 시크</th><th>C · 러블리</th></tr>'+rows+'</table><p class="smallnote">공간 배치·치수·좌석 수는 동일하며 색상과 마감 방향을 비교하는 세 가지 안입니다. 이미지는 색상 중심의 개념 모형으로, 실제 자재의 질감·광택과 조명 효과는 샘플 확인 후 확정합니다.</p>'+foot('00 · STYLE COMPARISON')+'</div>'
pages=[cover]
for s in styles:
    d=OUT/(s['code']+'_'+s['name'])
    plan=original['page1'].replace('SVG',(d/'치수평면도.svg').read_text()).replace('30평 사무실 · 치수 평면도',s['code']+' · '+s['name']+' / 치수 평면도').replace('A안 · 직원 8석 + 대표 1석',s['name']+'안 · 직원 8석 + 대표 1석').replace('A-01 · FLOOR PLAN',s['code']+'-01 · FLOOR PLAN').replace('연녹색 띠: 공용 통로','옅은 색 띠: 공용 통로')
    specs='<table class="specs">'+''.join(f'<tr><td>{k}</td><td>{v}</td></tr>' for k,v in s['specs'])+'</table>'
    render=f'''<div class="page" style="--accent:{s['accent']}">{head(s['code']+' · '+s['name']+' / 3D 배치',s['tagline'])}<div class="body"><div><img class="render" src="{img(s)}"><div class="caption">같은 배치를 동일한 시점에서 표현했습니다. 외곽벽 일부를 낮게 표시하고 도어 패널은 생략했습니다.</div>{chips(s)}<p>{s['description']}</p></div><div class="side"><h2>{s['name']} 마감 제안</h2>{specs}<h3>디자인 방향</h3><div class="style-note">{s['description']}</div><h3>공통 배치 조건</h3><p>전용 99㎡, 천장 높이 2,700 mm 가정.<br>직원 8석 + 별도 대표 1석.<br>회의실 6석 / 탕비실 1곳.<br>기둥 없음, 화장실은 외부 공용부 가정.</p><h3>업체 확인사항</h3><p>출입문·창문·기둥·급배수 위치 실측.<br>전기·통신·냉난방·환기·소방·피난 검토.<br>자재 샘플·유리·차음·도어 유효폭 확인.</p><div class="note">마감 제품과 시공 상세를 지정한 도면이 아닙니다. 실제 색상·질감·시공 치수는 현장 확인과 자재 협의 후 확정하세요.</div></div></div>{foot(s['code']+'-02 · 3D & FINISHES')}</div>'''
    pages.extend([plan,render])
    (d/'업체전달용_인쇄.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><style>'+css+'</style><body>'+plan+render+'</body></html>')
(OUT/'3가지스타일_인쇄.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><title>30평 사무실 3가지 스타일 비교</title><style>'+css+'</style><body>'+''.join(pages)+'</body></html>')
(OUT/'3가지스타일_비교표.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><style>'+css+'</style><body>'+cover+'</body></html>')
