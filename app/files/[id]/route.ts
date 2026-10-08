import fs from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { canReadFile, type FileRow } from "@/lib/data";
import { UPLOAD_DIR, get } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const file = get<FileRow>(`SELECT * FROM files WHERE id = ?`, Number((await params).id));
  if (!file || !canReadFile(file, await currentUser())) return new Response("Not found", { status: 404 });
  try {
    const body = await fs.readFile(path.join(UPLOAD_DIR, file.stored_name));
    const inline = file.mime.startsWith("image/") || file.mime === "application/pdf";
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
