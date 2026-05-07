import { forwardRef } from "react";
import {
  SHARE_CARD_SIZE,
  GRASS_COLORS,
  type MonthData,
} from "../../lib/grass";

/**
 * Phase 16 CON-2: 미리보기 표시 픽셀. SVG는 viewBox=1080을 유지하고
 * width/height만 260으로 축소하여 비율을 보존.
 */
export const SHARE_PREVIEW_DISPLAY_PX = 260;

type ShareCardProps = {
  data: MonthData | null;
  message: string;
  /**
   * 미지정: off-screen 1080×1080 (PNG 변환용 원본, BR-3/AC-16).
   * 지정: visible 미리보기 (Phase 16 FR-4).
   */
  previewSize?: number;
};

/**
 * 공유 카드 SVG 본체 (Phase 8 + Phase 16 재설계).
 *
 * Phase 16 변경 (FR-1, FR-2):
 * - <g id="character" /> 삭제
 * - <g id="stats"> 삭제 (월 통계 미표시)
 * - message prop 추가: 비어있지 않으면 하단 중앙에 사용자 메시지 렌더
 *
 * <foreignObject> 미사용 (AC-G30) — <text>만 사용.
 */
export const ShareCard = forwardRef<SVGSVGElement, ShareCardProps>(function ShareCard(
  { data, message, previewSize },
  ref
) {
  const isPreview = typeof previewSize === "number";
  const renderSize = isPreview ? previewSize : SHARE_CARD_SIZE;

  const wrapperClass = isPreview
    ? ""
    : "pointer-events-none absolute top-0";
  const wrapperStyle: React.CSSProperties = isPreview
    ? { width: previewSize, height: previewSize }
    : { left: "-99999px" };

  return (
    <div
      className={wrapperClass}
      style={wrapperStyle}
      {...(isPreview ? {} : { "aria-hidden": true })}
    >
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={renderSize}
        height={renderSize}
        viewBox={`0 0 ${SHARE_CARD_SIZE} ${SHARE_CARD_SIZE}`}
      >
        {/* 배경 — cream */}
        <rect width="100%" height="100%" fill="#fff8e0" />

        {/* 워터마크 */}
        <g id="watermark">
          <text
            x={SHARE_CARD_SIZE / 2}
            y="100"
            textAnchor="middle"
            fontSize="48"
            fontWeight="bold"
            fill="#445478"
          >
            MOHASHIM
          </text>
        </g>

        {/* 잔디 그리드 — 7×N, 셀 100×100, gap 10 */}
        <g id="grass-grid" transform="translate(140, 220)">
          {(data?.cells ?? []).map((cell, idx) => {
            if (cell.date === null) return null;
            const col = idx % 7;
            const row = Math.floor(idx / 7);
            return (
              <rect
                key={idx}
                x={col * 110}
                y={row * 110}
                width="100"
                height="100"
                rx="8"
                fill={GRASS_COLORS[cell.level]}
              />
            );
          })}
        </g>

        {/* Phase 16 FR-2: 사용자 메시지 (비어있지 않을 때만 렌더) */}
        {message && (
          <text
            x={540}
            y={950}
            textAnchor="middle"
            fontSize="72"
            fontWeight="bold"
            fill="#2b2520"
          >
            {message}
          </text>
        )}
      </svg>
    </div>
  );
});
