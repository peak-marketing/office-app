import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { UPLOAD_DIR, run } from "./db";

// 2차 기능(커뮤니티 사진·상품 이미지·3D 모델·판매자 서류)의 파일 저장.
// public: 누구나 볼 수 있는 파일(files.kind = 'case'), private: 올린 사람과 운영자만(files.kind = 'photo').

export type UploadKind = "image" | "model" | "doc";
const EXT: Record<UploadKind, string[]> = {
  image: [".jpg", ".jpeg", ".png", ".webp"],
  model: [".glb"],
  doc: [".jpg", ".jpeg", ".png", ".pdf"],
};
const MAX: Record<UploadKind, number> = { image: 10 << 20, model: 15 << 20, doc: 10 << 20 };
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".glb": "model/gltf-binary",
};
const LABEL: Record<UploadKind, string> = { image: "사진", model: "3D 모델", doc: "서류" };

export const filesOf = (fd: FormData, field: string) => fd.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);

/** 저장 전에 형식·크기·개수를 확인한다. 문제가 없으면 null */
export function checkUploads(files: File[], kind: UploadKind, max = 20) {
  if (files.length > max) return `${LABEL[kind]}은 ${max}개까지 올릴 수 있습니다.`;
  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase();
    if (!EXT[kind].includes(ext)) return `${f.name}: 지원하지 않는 형식입니다 (${EXT[kind].join(", ")}).`;
    if (f.size > MAX[kind]) return `${f.name}: ${LABEL[kind]} 하나는 ${MAX[kind] >> 20}MB 이하여야 합니다.`;
  }
  return null;
}

/** 확인을 거친 파일을 저장하고 files 행 id를 돌려준다. */
export async function saveUploads(files: File[], kind: UploadKind, ownerId: number, category: string, visibility: "public" | "private") {
  const ids: number[] = [];
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase();
    const buf = Buffer.from(await f.arrayBuffer());
    if (kind === "model" && buf.subarray(0, 4).toString("latin1") !== "glTF") throw new Error(`${f.name}: GLB(바이너리 glTF) 파일이 아닙니다.`);
    const stored = randomBytes(16).toString("hex") + ext;
    await fs.writeFile(path.join(UPLOAD_DIR, stored), buf);
    ids.push(
      run(
        `INSERT INTO files (owner_id, project_id, kind, original_name, stored_name, mime, size, category) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
        ownerId,
        visibility === "public" ? "case" : "photo",
        f.name.slice(0, 120),
        stored,
        MIME[ext] ?? "application/octet-stream",
        f.size,
        category,
      ),
    );
  }
  return ids;
}
