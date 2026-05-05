import { forwardRef } from "react";
import {
  SHARE_CARD_SIZE,
  GRASS_COLORS,
  type MonthData,
} from "../../lib/grass";

type ShareCardProps = { data: MonthData | null };

/**
 * 공유 카드 1080×1080 SVG 스켈레톤 (D-G3, FR-18).
 *
 * - 화면 미렌더 (off-screen, BR-G6): position absolute -99999px.
 * - <foreignObject> 미사용 (AC-G30) — <text>만 사용.
 * - 픽셀 좌표는 placeholder. DEC-16 시안 확정 후 후속 Phase에서 채움.
 */
export const ShareCard = forwardRef<SVGSVGElement, ShareCardProps>(function ShareCard(
  { data },
  ref
) {
  return (
    <div
      className="pointer-events-none absolute top-0"
      style={{ left: "-99999px" }}
      aria-hidden="true"
    >
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={SHARE_CARD_SIZE}
        height={SHARE_CARD_SIZE}
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

        {/* 통계 */}
        <g id="stats">
          <text
            x={SHARE_CARD_SIZE / 2}
            y="900"
            textAnchor="middle"
            fontSize="36"
            fill="#2b2520"
          >
            {data ? `${data.totalSessions}회 · 평균 ${data.avgScore}점` : ""}
          </text>
          <text
            x={SHARE_CARD_SIZE / 2}
            y="960"
            textAnchor="middle"
            fontSize="24"
            fill="#445478"
          >
            {data ? `${data.year}년 ${data.month}월` : ""}
          </text>
        </g>

        {/* 캐릭터 placeholder — 후속 Phase에서 모하 SVG 임베드 */}
        <g id="character" />
      </svg>
    </div>
  );
});
