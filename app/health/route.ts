import { get } from "@/lib/db";

// 배포 환경의 상태 확인용. DB를 한 번 읽어 본다.
export function GET() {
  const ok = get<{ n: number }>(`SELECT count(*) AS n FROM users`) != null;
  return Response.json({ ok }, { status: ok ? 200 : 500 });
}
