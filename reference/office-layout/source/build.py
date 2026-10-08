import json, math, html
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'output'
objects=[]
def box(name,x,y,z,w,d,h,color,kind='furniture',opacity=1):
    objects.append(dict(name=name,x=x,y=y,z=z,w=w,d=d,h=h,color=color,kind=kind,opacity=opacity))

# Coordinates in metres: x = west to east, y = entrance to rear, z = height.
box('바닥',0,0,-.16,11,9,.16,'#d9d4c9','floor')
for name,x,w,col in [('대표실',0,3.3,'#c8b593'),('회의실',3.4,4.2,'#b8c1bb'),('탕비실',7.7,3.3,'#ddd5c6')]:
    box(name+' 바닥',x,5.65,.005,w,3.35,.025,col,'floor')
box('후면 벽',-.15,9,0,11.3,.15,2.7,'#eeeae2','outer')
box('좌측 벽',-.15,0,0,.15,9,2.7,'#eeeae2','outer')
box('우측 벽',11,0,0,.15,9,2.7,'#eeeae2','outer')
box('전면 벽 A',0,-.15,0,9,.15,2.7,'#eeeae2','outer')
box('전면 벽 B',10.2,-.15,0,.8,.15,2.7,'#eeeae2','outer')
for x in [3.3,7.6]: box('실간 칸막이',x,5.6,0,.1,3.4,2.7,'#eeeae2','partition')
# Front glazing with 900 mm openings; surface sliding doors shown in plan.
for a,b in [(0,2.1),(3,3.4),(3.4,6.4),(7.3,8),(8.9,11)]:
    box('유리 칸막이',a,5.55,.12,b-a,.1,2.38,'#b0d3d8','glass',.24)
    box('유리 상부 프레임',a,5.55,2.5,b-a,.1,.07,'#344943','partition')
    box('유리 하부 프레임',a,5.55,.02,b-a,.1,.05,'#344943','partition')
    for xx in [a,b-.035]: box('유리 세로 프레임',xx,5.55,0,.035,.1,2.55,'#344943','partition')
for a in [2.1,6.4,8]:
    box('도어 상부 레일',a,5.5,2.5,.9,.16,.08,'#344943','partition')
for a,b in [(.45,2.85),(3.85,7.1),(8.15,10.55)]:
    box('가정 창호',a,8.965,1.05,b-a,.025,1.25,'#abd3df','window')
    box('창 하부',a,8.91,1,b-a,.12,.06,'#ffffff','window')

def desk(name,x,y,w=1.4,d=.7):
    box(name,x,y,.715,w,d,.035,'#c7a477')
    for xx in [x+.06,x+w-.1]:
        for yy in [y+.06,y+d-.1]: box(name+' 다리',xx,yy,.02,.04,.04,.695,'#404d48')
def chair(name,cx,cy,facing='back'):
    box(name+' 좌판',cx-.235,cy-.235,.44,.47,.47,.09,'#455c54')
    by=cy-.27 if facing=='back' else cy+.21
    box(name+' 등받이',cx-.235,by,.5,.47,.06,.39,'#455c54')
    box(name+' 기둥',cx-.035,cy-.035,.1,.07,.07,.34,'#59615f')
    box(name+' 베이스',cx-.22,cy-.22,.07,.44,.44,.04,'#59615f')

for bank,x in enumerate([.9,5.1]):
    for col in range(2):
        xx=x+col*1.4
        for row,yy in enumerate([2,2.7]):
            n=bank*4+col*2+row+1
            desk('직원 책상 '+str(n),xx,yy)
            cy=1.43 if row==0 else 3.97
            chair('직원 의자 '+str(n),xx+.7,cy,'back' if row==0 else 'front')
            my=yy+.5 if row==0 else yy+.11
            box('모니터 '+str(n),xx+.42,my,.88,.56,.05,.34,'#2c3c3b')
            box('모니터 받침 '+str(n),xx+.65,my-.035,.75,.1,.12,.15,'#4c5753')
            box('키보드 '+str(n),xx+.47,yy+(.19 if row==0 else .43),.753,.46,.16,.012,'#5f6862')
    box('데스크 스크린',x,2.675,.75,2.8,.05,.3,'#819385')

desk('대표 책상',.65,7.05,1.8,.8)
chair('대표 의자',1.55,8.3,'front')
for xx in [1,2.05]: chair('대표실 방문 의자',xx,6.5)
box('대표 수납장',.15,5.9,0,.4,1.7,1.1,'#c7a477')
box('대표 모니터',1.24,7.55,.89,.6,.06,.36,'#2c3c3b')
desk('6인 회의 테이블',4.25,6.75,2.4,1.05)
for xx in [4.7,5.45,6.2]:
    chair('회의 의자',xx,6.18)
    chair('회의 의자',xx,8.35,'front')
box('회의실 화면',3.415,6.85,1.1,.06,1.15,.7,'#263b3c')
box('탕비 하부장',8.6,8.35,0,2.1,.6,.87,'#b9a385')
box('탕비 상판',8.6,8.3,.87,2.1,.65,.04,'#f6f2e8')
box('싱크볼',8.8,8.39,.916,.55,.42,.015,'#879797')
box('수전',9.25,8.77,.93,.035,.035,.25,'#768787')
box('커피 머신',9.85,8.41,.915,.34,.34,.4,'#34433e')
box('냉장고',7.9,8.25,0,.6,.7,1.85,'#dddeda')
box('탕비 상부장',8.6,8.62,1.55,2.1,.33,.6,'#eeeae2')
box('탕비 보조 테이블',9.5,6.22,.72,1.15,.6,.05,'#c7a477')
for xx in [9.78,10.35]: chair('탕비 의자',xx,7.3,'front')
box('공용 수납장',10.5,2,0,.45,2.1,1.1,'#c7a477')
box('복합기',10.5,3.1,1.1,.45,.55,.37,'#eeeae2')
box('입구 벤치',7.1,.35,0,1.45,.52,.44,'#819385')
for x,y in [(.3,.4),(10.5,7.5)]:
    box('화분',x,y,0,.35,.35,.42,'#aa8063')
    box('식재',x-.06,y-.06,.42,.47,.47,.62,'#61785a')

(OUT/'layout-data.json').write_text(json.dumps(objects,ensure_ascii=False,indent=2))

S=73; OX=110; OY=780
def p(x,y): return (OX+x*S,OY-y*S)
parts=[]
def line(x1,y1,x2,y2,stroke='#52665e',width=1,dash=''):
    a,b=p(x1,y1),p(x2,y2)
    parts.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{stroke}" stroke-width="{width}" '+(f'stroke-dasharray="{dash}"' if dash else '')+'/>')
def rect(x,y,w,d,fill,stroke='none',sw=1):
    a,b=p(x,y+d)
    parts.append(f'<rect x="{a}" y="{b}" width="{w*S}" height="{d*S}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
def label(x,y,t,size=14,color='#233d34',anchor='middle'):
    a,b=p(x,y)
    parts.append(f'<text x="{a}" y="{b}" text-anchor="{anchor}" font-size="{size}" fill="{color}">{html.escape(t)}</text>')
def dim(x1,y1,x2,y2,t):
    line(x1,y1,x2,y2,width=.8)
    for xx,yy in [(x1,y1),(x2,y2)]: line(xx-.055,yy-.055,xx+.055,yy+.055,width=1)
    label((x1+x2)/2,(y1+y2)/2+.1,t,12)

rect(0,0,11,9,'#f8f6f0','#233d34',2)
for name,x,w,col in [('대표실',0,3.3,'#f0e7d9'),('회의실',3.4,4.2,'#e7eee8'),('탕비실',7.7,3.3,'#f2eee5')]: rect(x,5.65,w,3.35,col)
rect(0,4.35,11,1.2,'#eef2ed')
label(4.8,4.78,'공용 통로 · 계획 여유 1,200',14)
line(.3,4.55,9.45,4.55,stroke='#8aa28f',dash='7 5')
line(9.45,.3,9.45,4.55,stroke='#8aa28f',dash='7 5')
for ob in objects:
    k=ob['kind']; n=ob['name']
    if k in ['floor','outer','window'] or any(s in n for s in ['다리','기둥','베이스','모니터 받침','식재','수전','상부장','프레임','도어 상부 레일']): continue
    if '등받이' in n: col='#455c54'
    elif k=='glass': col='#aac6ca'
    else: col=ob['color']
    rect(ob['x'],ob['y'],ob['w'],ob['d'],col,'#76877c',.5)
for x in [3.3,7.6]: rect(x,5.6,.1,3.4,'#4c5c53')
for a in [2.1,6.4,8]:
    line(a,5.7,a+.9,5.7,stroke='#6b9194',dash='4 3')
    label(a+.45,5.38,'900',10)
for a,b in [(.45,2.85),(3.85,7.1),(8.15,10.55)]:
    line(a,9,b,9,stroke='#6babbc',width=5)
    label((a+b)/2,8.82,'창호 위치 가정',10,color='#547d87')
line(9,0,10.2,0,stroke='#faf8f3',width=6)
line(9,-.07,10.2,-.07,stroke='#6b9194',dash='5 3')
label(9.6,-.38,'출입구 1,200',13)
label(1.65,5.77,'01  대표실',14)
label(5.5,5.77,'02  회의실 · 6인',14)
label(9.35,5.77,'03  탕비실',14)
label(1.65,8.58,'3,300 × 3,350',11)
label(5.5,8.58,'4,200 × 3,350',11)
label(9.35,7.72,'3,300 × 3,350',11)
label(4.45,.43,'04  직원 업무 공간 · 8석',17)
label(4.45,.12,'책상 1,400 × 700 / 4인 대면 배치 × 2',11)
label(10.15,2.3,'수납',11)
label(7.82,1.07,'입구 벤치',11)
for x in [.9,2.3,5.1,6.5]:
    for y in [2.35,3.06]: label(x+.16,y,str(1+[.9,2.3,5.1,6.5].index(x)*2+(y>3)),10,anchor='start')
dim(0,9.8,11,9.8,'11,000')
for x in [0,11]: line(x,9.05,x,9.93,width=.7)
for a,b,t in [(0,3.3,'3,300'),(3.3,3.4,'100'),(3.4,7.6,'4,200'),(7.6,7.7,'100'),(7.7,11,'3,300')]:
    if t!='100': dim(a,9.37,b,9.37,t)
dim(-.8,0,-.8,9,'9,000')
for y in [0,9]: line(-.95,y,-.1,y,width=.7)
dim(11.6,0,11.6,5.55,'5,550')
dim(11.6,5.65,11.6,9,'3,350')
label(5.5,-.72,'치수 단위 mm · 실내 외곽 유효치수 가정 · 칸막이 두께 100',12)
svg='<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="865" viewBox="0 0 1050 865"><rect width="1050" height="865" fill="#ffffff"/><g font-family="Apple SD Gothic Neo, Malgun Gothic, sans-serif">'+''.join(parts)+'</g></svg>'
(OUT/'01_치수평면도.svg').write_text(svg)

notes='''# 30평 사무실 배치 검토안 — A안

작성일: 2026-09-29

이 자료는 가정 치수로 만든 공간 배치·견적 상담용 개념안입니다. 현장 실측이나 건물 설비·법규 검토를 거친 시공 확정 도면이 아닙니다.

## 설계 가정
- 전용면적 약 30평: 실내 외곽 유효치수 11,000 × 9,000 mm = 99㎡ ≈ 29.95평. 신설 칸막이 면적 포함.
- 천장 높이 2,700 mm. 외곽벽 모델 두께 150 mm는 99㎡ 바깥에 표현.
- 기둥·코어 없음. 화장실은 공용부에 있다고 가정.
- 도면 아래쪽 오른편에 1,200 mm 출입구, 위쪽 벽에 창호 세 곳 가정. 실제 방위 미지정.
- 후면 3개실: 대표실 순치수 3,300 × 3,350, 회의실 4,200 × 3,350, 탕비실 3,300 × 3,350 mm.
- 실간 칸막이 두께 100 mm, 전면 칸막이 깊이 100 mm. 가정 순면적: 대표실 11.06㎡, 회의실 14.07㎡, 탕비실 11.06㎡. 나머지는 업무·통로·입구·칸막이.
- 직원 8명과 별도 대표 1명을 가정. 직원 책상 1,400 × 700 mm 8개, 대표 책상 1,800 × 800 mm 1개.
- 회의 테이블 2,400 × 1,050 mm / 6석. 탕비실 하부장 2,100 × 600 mm, 냉장고 폭 600 mm.
- 각 실 출입 개구부 900 mm, 상부 레일형 슬라이딩 도어 개념. 도어 패널은 3D에서 생략하고 평면에 점선으로 표시. 제품 프레임 반영 후 유효폭 확인 필요.
- 공용 가로 통로는 가구 모델 기준 약 1,200 mm 계획. 실제 의자 사용 범위, 마감, 문틀을 반영해 실측 설계 시 재검토.
- 화이트·내추럴 오크·세이지 그린을 기본 마감 방향으로 제안. 화면의 색상은 재료 지정이 아님.

## 시공업체 전달사항
1. 외곽 실측치, 기둥, 기존 출입문·창문·화장실·전기분전반·급배수 위치 확인 후 배치 조정.
2. 탕비실 급배수 가능 위치와 배관 경로 확인. 현재 위치는 배관 접속 가능 여부가 검증되지 않은 가정.
3. 대표실·회의실 차음, 유리 사양, 도어 방식과 유효 통로폭 협의. 탕비실 전면 유리는 하부 불투명 마감 선택 가능.
4. 전기·통신·조명·냉난방·환기·소방·피난 및 건물 관리 기준은 업체가 별도 검토하여 상세도에 반영.
5. 이 파일로 수량과 공사비를 확정하거나 현장 먹매김하지 말고, 실측 후 승인된 시공 도면 사용.

## 파일 안내
- 00_사무실_3D.html: 인터넷 연결 없이 브라우저에서 실행. 드래그로 회전, 휠로 확대. 평면 전환과 외벽 표시 선택 가능.
- 01_치수평면도.svg: 확대해도 선명한 평면도.
- 02_사무실_3D.png: 공유용 3D 배치 이미지.
- 03_업체전달용_배치검토안.pdf: A3 가로 2쪽. 평면과 3D·가정사항. 평면 축척은 지정하지 않았으며 숫자 치수 우선.
- 04_사무실_모델.glb: 미터 단위 3D 모델. 구조·설비가 없는 배치 모델이며 대표실·회의실 전면은 유리 개념 표현.
- layout-data.json: 동일 평면·3D에 사용한 가구와 벽체 좌표. x=왼쪽→오른쪽, y=입구→후면, z=높이, 단위 m.

3D 기본 화면은 내부가 보이도록 외곽벽을 낮게 잘라 표현합니다. 실제 높이 가정은 2,700 mm이며, 화면의 '외벽 전체'로 전환할 수 있습니다. 실 이름 표시는 모델 가구가 아닌 화면 안내입니다.
'''
(OUT/'전달메모.md').write_text(notes)
