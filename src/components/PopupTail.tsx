export interface PopupTailProps {
  position: "top" | "bottom";
  tailX?: number;
  color?: string;
}

/**
 * 팝업과 트레이 아이콘을 시각적으로 연결하는 20×10 SVG 꼬리 (설계 §8, FR-E2).
 *
 * - position="top": 팝업이 트레이 아래쪽에 위치할 때 (기본). 꼬리가 위쪽으로 향함.
 * - position="bottom": 팝업이 트레이 위쪽에 위치할 때. 꼬리가 아래쪽으로 향함 (scaleY(-1)).
 * - tailX: 꼬리의 가로 위치 (left 픽셀값). 기본 270.
 * - color: 꼬리 채움 색상. 기본 #fdf8e8 (팝업 배경과 동일).
 *
 * pointerEvents: none — 꼬리는 클릭 영역에서 제외.
 */
export function PopupTail({
  position,
  tailX = 270,
  color = "#fdf8e8",
}: PopupTailProps) {
  const isBottom = position === "bottom";
  return (
    <svg
      width={20}
      height={10}
      viewBox="0 0 20 10"
      style={{
        position: "absolute",
        left: tailX,
        ...(isBottom
          ? { bottom: 0, transform: "scaleY(-1)" }
          : { top: 0 }),
        pointerEvents: "none",
      }}
      aria-hidden
    >
      <path d="M0 10 L10 0 L20 10 Z" fill={color} />
    </svg>
  );
}
