import Link from "next/link";

/** These are the implemented intake types, not a claim of support for every building use. */
export default function IntakeSpaceKind({ kind }: { kind: "home" | "office" }) {
  const options = [
    { kind: "home", href: "/homes/new", label: "집", desc: "아파트·빌라·원룸·오피스텔" },
    { kind: "office", href: "/projects/new", label: "사무실", desc: "업무 공간·사무실 인테리어" },
  ];
  return <nav className="mb-5" aria-label="신청할 공간 종류" data-testid="intake-space-kind">
    <p className="mb-2 text-sm font-semibold">어떤 공간인가요?</p>
    <div className="grid gap-2 sm:grid-cols-2">{options.map((o) => <Link key={o.kind} href={o.href} aria-current={kind === o.kind ? "page" : undefined} data-testid={`intake-kind-${o.kind}`} className={`rounded-xl border p-3 text-sm ${kind === o.kind ? "border-brand bg-brand-soft" : "border-line bg-white"}`}><b>{o.label}</b><span className="mt-1 block text-xs text-muted">{o.desc}</span></Link>)}</div>
  </nav>;
}
