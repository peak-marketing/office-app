import { Field, StateForm } from "@/components/forms";
import { Empty } from "@/components/ui";
import { addVendorCase, deleteVendorCase, saveVendorProfile } from "@/lib/actions";
import { ROOM_LABEL, getVendorCases, vendorFields, type Vendor } from "@/lib/data";
import { STYLES } from "@/lib/styles";

/** 업체 소개와 시공 사례 편집. 업체 본인 화면과 운영자의 대신 관리 화면이 함께 쓴다. adminVendorId가 있으면 운영자가 고친다. */
export default function VendorProfileEditor({ vendor, adminVendorId = null }: { vendor: Vendor; adminVendorId?: number | null }) {
  const cases = getVendorCases(vendor.id);
  return (
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card h-fit">
          <h2 className="h-section">업체 소개</h2>
          <StateForm action={saveVendorProfile.bind(null, adminVendorId)} submit="저장" className="space-y-3">
            <Field label="업체명">
              <input className="input" name="company" defaultValue={vendor.company} required />
            </Field>
            <Field label="소개">
              <textarea className="input" name="intro" rows={4} defaultValue={vendor.intro} />
            </Field>
            <Field label="시공 가능 지역">
              <input className="input" name="regions" defaultValue={vendor.regions} placeholder="예: 서울 전역, 경기 남부" />
            </Field>
            <fieldset data-testid="vendor-fields">
              <input type="hidden" name="fieldsShown" value="1" />
              <legend className="label">시공 분야</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {(
                  [
                    ["office", "사무실"],
                    ["home", "주거(원룸·오피스텔·빌라·아파트)"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input type="checkbox" name="fields" value={k} defaultChecked={vendorFields(vendor).includes(k)} className="size-4 accent-brand" data-testid={`field-${k}`} /> {label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">운영자가 요청을 배정할 때 참고해요. 주거를 고르면 집 요청에서 먼저 보여요.</p>
            </fieldset>
            <Field label="전문 분야">
              <input className="input" name="specialties" defaultValue={vendor.specialties} placeholder="예: 사무실, 유리 칸막이" />
            </Field>
            <Field label="경력 (년)">
              <input className="input w-32" name="years" type="number" min="0" defaultValue={vendor.years} />
            </Field>
          </StateForm>
        </section>

        <section className="space-y-4">
          <div className="card">
            <h2 className="h-section">시공 사례 추가</h2>
            <StateForm action={addVendorCase.bind(null, adminVendorId)} submit="사례 추가" resetOnOk className="grid gap-3 sm:grid-cols-2">
              <Field label="제목" className="sm:col-span-2">
                <input className="input" name="title" placeholder="예: IT 스타트업 32평 사무실" required />
              </Field>
              <Field label="면적 (평)">
                <input className="input" name="areaPyeong" type="number" step="0.1" min="0" />
              </Field>
              <Field label="공사 기간">
                <input className="input" name="duration" placeholder="예: 3주" />
              </Field>
              <Field label="스타일" hint="고객이 스타일로 사례를 찾습니다.">
                <select className="input" name="style" defaultValue="">
                  <option value="">기타·정하지 않음</option>
                  {STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="시공 지역 (시·구)">
                <input className="input" name="region" placeholder="예: 서울 성동구" />
              </Field>
              <Field label="직원 좌석 수">
                <input className="input" name="staff" type="number" min="1" />
              </Field>
              <fieldset>
                <legend className="label">포함된 방</legend>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
                  {Object.entries(ROOM_LABEL).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1.5">
                      <input type="checkbox" name="rooms" value={key} className="size-4 accent-brand" /> {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="설명" className="sm:col-span-2">
                <textarea className="input" name="summary" rows={2} />
              </Field>
              <Field label="사진" className="sm:col-span-2" hint="JPG, PNG, WEBP · 한 장에 10MB 이하 · 8장까지. 처음 고른 사진이 대표 사진이 됩니다. 고객은 사진부터 보고 업체를 고릅니다.">
                <input className="input" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple />
              </Field>
            </StateForm>
          </div>
          {cases.length === 0 ? (
            <Empty>등록한 시공 사례가 없습니다.</Empty>
          ) : (
            <ul className="space-y-3">
              {cases.map((c) => (
                <li key={c.id} className="card flex gap-4">
                  {c.photos[0] && (
                    // eslint-disable-next-line @next/next/no-img-element -- 업로드 파일
                    <img src={`/files/${c.photos[0]}`} alt="" className="size-20 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">{c.title}</h3>
                    <p className="text-xs text-muted">
                      {[c.area_pyeong != null && `${c.area_pyeong}평`, c.duration, STYLES.find((s) => s.id === c.style)?.name, c.region].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-sm text-muted">{c.summary}</p>
                    <p className="mt-1 text-xs text-muted">사진 {c.photos.length}장</p>
                  </div>
                  <form action={deleteVendorCase.bind(null, c.id)}>
                    <button className="btn btn-sm btn-danger">삭제</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
  );
}
