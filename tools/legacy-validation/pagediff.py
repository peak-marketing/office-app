#!/usr/bin/env python3
# 반영 전후 화면 글자 비교. 사용: python3 pagediff.py before.json after.json > diff.txt
import json, sys, difflib, re
a = json.load(open(sys.argv[1], encoding="utf-8")); b = json.load(open(sys.argv[2], encoding="utf-8"))
same, changed = [], []
sent = lambda t: [s.strip() for s in re.split(r"(?<=[.!?요다])\s+|\s{2,}| · ", t) if s.strip()]
for k in a["pages"]:
    if k not in b["pages"]: changed.append((k, ["(반영 후 없음)"], [])); continue
    x, y = a["pages"][k], b["pages"][k]
    if x["status"] != y["status"]: changed.append((k, [f"상태 {x['status']} → {y['status']}"], [])); continue
    if x["text"] == y["text"]: same.append(k); continue
    sx, sy = sent(x["text"]), sent(y["text"]); rem, add = [], []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, sx, sy).get_opcodes():
        if op in ("replace", "delete"): rem += sx[i1:i2]
        if op in ("replace", "insert"): add += sy[j1:j2]
    changed.append((k, rem, add))
fa, fb = a.get("files", {}), b.get("files", {})
fsame = sum(1 for k in fa if k in fb and fa[k] == fb[k] and fb[k]["status"] == 200 and fb[k]["size"] == fb[k]["expected"])
print(f"화면 {len(a['pages'])}개 · 같음 {len(same)} · 달라짐 {len(changed)} · 오류(전 {len(a['errors'])} / 후 {len(b['errors'])}) · 기존 파일 {len(fa)}개 중 전후 같고 정상 {fsame}")
for k, rem, add in changed:
    print(f"\n## {k}")
    for s in rem[:12]: print(f"  - {s[:160]}")
    for s in add[:12]: print(f"  + {s[:160]}")
print("\n같은 화면:", ", ".join(same))
