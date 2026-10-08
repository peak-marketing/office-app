import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "./auth";
import { getAssignments, getOwnedProject, getQuotes, getVersions } from "./data";

/** 프로젝트 탭 화면(레이아웃과 각 탭)이 함께 쓰는 조회. 한 요청 안에서는 한 번만 실행된다. */
export const loadProject = cache(async (idParam: string) => {
  const user = await requireUser("customer", "admin");
  const project = getOwnedProject(Number(idParam), user);
  if (!project) notFound();
  const versions = getVersions(project.id);
  const current = versions.find((v) => v.id === project.current_version_id) ?? versions[0];
  const requested = versions.find((v) => v.id === project.requested_version_id);
  const quotes = getQuotes(project.id);
  const assignments = getAssignments(project.id);
  const finished = project.status === "contracted" || project.status === "closed";
  return { user, project, versions, current, requested, quotes, assignments, finished };
});
