# -*- coding: utf-8 -*-
import json, re, runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'output'
styles=json.loads((ROOT/'source/styles.json').read_text())
base=runpy.run_path(str(ROOT/'source/assemble.py'))['page']
svg=(OUT/'01_치수평면도.svg').read_text()
plans={s['id']:re.sub(r'#[0-9a-fA-F]{6}',lambda m:s['plan'].get(m[0],m[0]),svg) for s in styles}
style_css='''<style>:root{--style-accent:#536c52}.style-tabs{display:flex;gap:5px;margin-bottom:16px}.style-tabs button{padding:9px 10px;flex:1}.style-tabs button.active{background:var(--style-accent);color:white;border-color:var(--style-accent)}#styleName{font-size:23px;color:var(--style-accent);margin:0 0 10px}#styleDescription{line-height:1.75;margin:0 0 14px}#stylePalette{display:grid;grid-template-columns:1fr 1fr;gap:10px 6px;font-size:10px;color:#667063}#stylePalette i{display:inline-block;width:13px;height:13px;border:1px solid #0001;border-radius:50%;vertical-align:middle;margin-right:5px}aside{padding-top:20px}</style>'''
intro='<div class="style-tabs" role="group" aria-label="인테리어 스타일">'+''.join(f'<button data-theme="{s["id"]}" aria-pressed="false">{s["name"]}</button>' for s in styles)+'</div><h2 id="styleName"></h2><p id="styleDescription"></p><div id="stylePalette"></div><hr>'
base=base.replace('</head>',style_css+'</head>').replace('<aside>','<aside>'+intro)
base=base.replace('30평 사무실 · 공간 배치 A안','30평 사무실 · 3가지 스타일').replace('OFFICE / SPACE STUDY 01','OFFICE / THREE MOODS')
base=base.replace(svg,'<div id="themePlan">'+svg+'</div>')
base=base.replace('<script>window.LAYOUT=', '<script>window.STYLES='+json.dumps(styles,ensure_ascii=False)+';window.THEME_PLANS='+json.dumps(plans,ensure_ascii=False)+';window.DEFAULT_THEME="THEME_DEFAULT";</script><script>window.LAYOUT=')
(OUT/'00_사무실_3D.html').write_text(base.replace('THEME_DEFAULT','natural'))
(OUT/'00_3가지스타일_3D.html').write_text(base.replace('THEME_DEFAULT','natural'))
for s in styles:
    folder=OUT/(s['code']+'_'+s['name']);folder.mkdir(exist_ok=True)
    (folder/'3D.html').write_text(base.replace('THEME_DEFAULT',s['id']))
    (folder/'치수평면도.svg').write_text(plans[s['id']])
    data=json.loads((OUT/'layout-data.json').read_text())
    for ob in data:ob['color']=s['colors'].get(ob['color'],ob['color'])
    (folder/'layout-data.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
print('3 style viewers and plans built')
