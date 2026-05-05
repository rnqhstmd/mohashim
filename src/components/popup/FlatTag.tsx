import type { WorkTag, Location } from "../../lib/storage";

type FlatTagProps = {
  tag: WorkTag | Location;
};

/**
 * 항목 행 미니 태그 — 컬러 닷 + 라벨. 보더 없음, 행 표시 전용.
 */
export function FlatTag({ tag }: FlatTagProps) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-deep/70">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: tag.color }}
      />
      <span>{tag.label}</span>
    </span>
  );
}
