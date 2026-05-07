import type { CSSProperties } from "react";
import type { WorkTag, Location } from "../../lib/storage";

type MetaChipProps = {
  tag: WorkTag | Location;
  active?: boolean;
  size?: "sm" | "md";
  onClick?: () => void;
};

/**
 * picker용 태그 칩 — 이모지 + 라벨. active 시 컬러 채움 + 흰 글자,
 * 비활성 시 흰 배경 + tag.color 보더/글자.
 */
export function MetaChip({
  tag,
  active = false,
  size = "md",
  onClick,
}: MetaChipProps) {
  const padding = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  const style: CSSProperties = active
    ? { background: tag.color, color: "#fdf8ef" }
    : {
        borderColor: tag.color,
        color: tag.color,
        borderWidth: 1,
        background: "rgba(253,248,239,0.85)",
      };
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold transition-transform hover:-translate-y-px ${padding}`}
    >
      <span>{tag.emoji}</span>
      <span>{tag.label}</span>
    </button>
  );
}
