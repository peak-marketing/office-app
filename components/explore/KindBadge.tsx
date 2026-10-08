import Icon from "../Icon";

/** 3D 제안 예시와 실제 시공 사례를 한눈에 나눈다. */
export function KindBadge({ example, size = "sm" }: { example: boolean | number; size?: "sm" | "md" }) {
  return example ? (
    <span className={`kind-badge kind-example ${size === "md" ? "kind-md" : ""}`}>
      <Icon name="cube" className="size-3.5" />
      3D 제안 예시<span className="sr-only"> · 실제 시공 사진 아님</span>
    </span>
  ) : (
    <span className={`kind-badge kind-real ${size === "md" ? "kind-md" : ""}`}>
      <Icon name="camera" className="size-3.5" />
      실제 시공 사례
    </span>
  );
}

