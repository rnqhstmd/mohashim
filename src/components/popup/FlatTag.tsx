import type { WorkTag, Location } from "../../lib/storage";

type FlatTagProps = {
  tag: WorkTag | Location;
};

/**
 * 항목 행 미니 태그 — 컬러 닷 + 라벨 (Phase 21 사용자 피드백 반영: emoji 아이콘 + 색상
 * 모두 노출). Mohashim Design.html(popup.jsx line 85-109 MetaChip)의 vocab 정렬:
 * 미세 컬러 tint 배경 + 컬러 보더 + emoji + 라벨.
 */
export function FlatTag({ tag }: FlatTagProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold leading-tight"
      style={{
        background: `${tag.color}1f`,
        borderColor: `${tag.color}66`,
        color: tag.color,
      }}
    >
      <span aria-hidden className="text-[11px] leading-none">
        {tag.emoji}
      </span>
      <span style={{ filter: "brightness(0.65)" }}>{tag.label}</span>
    </span>
  );
}
