import { forwardRef, useMemo, type CSSProperties } from "react";
import {
  SHARE_CARD_SIZE,
  GRASS_COLORS,
  type DayCell,
  type MonthData,
} from "../../lib/grass";

const SHARE_FONT_FAMILY =
  "KyoboHandwriting2019, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

export const SHARE_PREVIEW_DISPLAY_PX = 260;

// === Layout constants ===
const CELL = 68;
const STEP = 76; // CELL + gap(8)
const GRID_COLS = 7;
const GRID_WIDTH = (GRID_COLS - 1) * STEP + CELL; // 6*76+68 = 524
const GRID_X = Math.round((SHARE_CARD_SIZE - GRID_WIDTH) / 2); // 278

const CHAR_SIZE = 180;
const CHAR_X = Math.round((SHARE_CARD_SIZE - CHAR_SIZE) / 2); // 450
const CHAR_Y = 48;
const CHAR_SCALE = CHAR_SIZE / 200;

const TITLE_Y = 264;
const MONTH_Y = 300;
const GRID_TOP = 336;

const STATS_TOP = 815;
const STATS_GAP = 56;
const MESSAGE_Y = 970;
const WATERMARK_Y = 1040;

// Stat badge geometry (smaller, more elegant)
const BADGE_WIDTH = 600;
const BADGE_HEIGHT = 46;
const BADGE_X = Math.round((SHARE_CARD_SIZE - BADGE_WIDTH) / 2); // 240

// === Potato (calm) palette ===
const P_SKIN = "#fdeed1";
const P_SKIN_LIGHT = "#fff7e3";
const P_SKIN_SHADE = "#f0d9a8";
const P_OUTLINE = "#5a3d1f";
const P_CHEEK = "#f9c4b0";
const P_SPROUT = "#81C784";
const HAND_DRAWN_BODY =
  "M 50 100 C 49 88, 53 75, 62 64 C 70 53, 84 45, 100 44 C 117 43, 132 51, 142 64 " +
  "C 151 76, 153 90, 153 105 C 154 122, 149 138, 138 152 C 127 165, 113 173, 100 173 " +
  "C 87 173, 72 167, 61 154 C 51 141, 49 124, 50 100 Z";

type ShareCardProps = {
  data: MonthData | null;
  message: string;
  previewSize?: number;
  fontDataUrl?: string | null;
  itemDataUrls?: {
    face?: string | null;
    head?: string | null;
    back?: string | null;
  } | null;
};

type MonthHighlights = {
  bestFocus: { date: string; score: number } | null;
  mostTodos: { date: string; count: number } | null;
};

function computeMonthHighlights(data: MonthData | null): MonthHighlights {
  if (!data) return { bestFocus: null, mostTodos: null };
  let best: { date: string; score: number } | null = null;
  let most: { date: string; count: number } | null = null;
  for (const cell of data.cells as DayCell[]) {
    if (cell.date === null || cell.isFuture) continue;
    if (cell.sessions > 0) {
      if (!best || cell.avg > best.score) best = { date: cell.date, score: cell.avg };
    }
    if (cell.todos > 0) {
      if (!most || cell.todos > most.count) most = { date: cell.date, count: cell.todos };
    }
  }
  return { bestFocus: best, mostTodos: most };
}

function formatShortKoreanDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  if (!m || !d) return "";
  return `${m}월 ${d}일`;
}

export const ShareCard = forwardRef<SVGSVGElement, ShareCardProps>(function ShareCard(
  { data, message, previewSize, fontDataUrl, itemDataUrls },
  ref
) {
  const isPreview = typeof previewSize === "number";
  const renderSize = isPreview ? previewSize : SHARE_CARD_SIZE;
  const highlights = useMemo(() => computeMonthHighlights(data), [data]);

  // off-screen 인스턴스는 부모(SharePreviewModal)의 0×0 hidden 컨테이너 안에 배치되므로
  // 자체적인 위치 지정은 불필요.
  const wrapperClass = isPreview ? "" : "pointer-events-none";
  const wrapperStyle: CSSProperties = isPreview
    ? { width: previewSize, height: previewSize }
    : {};

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
        {fontDataUrl && (
          <defs>
            <style>
              {`@font-face {
                font-family: "KyoboHandwriting2019";
                font-style: normal;
                font-weight: 400;
                src: url("${fontDataUrl}") format("woff");
              }`}
            </style>
          </defs>
        )}

        {/* 배경 */}
        <rect width="100%" height="100%" fill="#fffaed" />

        {/* 카드 테두리 */}
        <rect
          x="18"
          y="18"
          width="1044"
          height="1044"
          rx="32"
          fill="none"
          stroke="#e2d8c4"
          strokeWidth="1.8"
        />

        {/* 모서리 장식 점 */}
        <circle cx="58" cy="58" r="4" fill="#c8b89c" opacity="0.6" />
        <circle cx="1022" cy="58" r="4" fill="#c8b89c" opacity="0.6" />
        <circle cx="58" cy="1022" r="4" fill="#c8b89c" opacity="0.6" />
        <circle cx="1022" cy="1022" r="4" fill="#c8b89c" opacity="0.6" />

        {/* 캐릭터 (항상 표시, 더 크게) */}
        <g id="character">
          {itemDataUrls?.back && (
            <image
              href={itemDataUrls.back}
              x={CHAR_X}
              y={CHAR_Y}
              width={CHAR_SIZE}
              height={CHAR_SIZE}
            />
          )}
          <g transform={`translate(${CHAR_X}, ${CHAR_Y}) scale(${CHAR_SCALE})`}>
            <path
              d="M100 38 Q100.5 33 102 28"
              stroke={P_OUTLINE}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M99 31 Q94 28 91 23 Q94 24 96 26 Q98 28 100 30 Z"
              fill={P_SPROUT}
              stroke={P_OUTLINE}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d="M101 30 Q108 25 112 17 Q108 18 104 21 Q100 25 99 29 Z"
              fill={P_SPROUT}
              stroke={P_OUTLINE}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={HAND_DRAWN_BODY}
              fill={P_SKIN}
              stroke={P_OUTLINE}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d="M 56 130 C 56 152, 75 170, 95 172 C 78 168, 62 152, 56 130 Z"
              fill={P_SKIN_SHADE}
              opacity="0.25"
            />
            <ellipse
              cx="74"
              cy="68"
              rx="11"
              ry="14"
              fill={P_SKIN_LIGHT}
              opacity="0.55"
              transform="rotate(-18 74 68)"
            />
            <ellipse cx="86" cy="112" rx="3" ry="3.3" fill={P_OUTLINE} />
            <ellipse cx="114" cy="112" rx="3" ry="3.3" fill={P_OUTLINE} />
            <path
              d="M95 124 Q100 128 105 124"
              stroke={P_OUTLINE}
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <ellipse cx="76" cy="125" rx="5" ry="3" fill={P_CHEEK} opacity="0.55" />
            <ellipse cx="124" cy="125" rx="5" ry="3" fill={P_CHEEK} opacity="0.55" />
          </g>
          {itemDataUrls?.head && (
            <image
              href={itemDataUrls.head}
              x={CHAR_X}
              y={CHAR_Y}
              width={CHAR_SIZE}
              height={CHAR_SIZE}
            />
          )}
          {itemDataUrls?.face && (
            <image
              href={itemDataUrls.face}
              x={CHAR_X}
              y={CHAR_Y}
              width={CHAR_SIZE}
              height={CHAR_SIZE}
            />
          )}
        </g>

        {/* 타이틀 + 월 */}
        <text
          x={SHARE_CARD_SIZE / 2}
          y={TITLE_Y}
          textAnchor="middle"
          fontSize="50"
          fontWeight="bold"
          fontFamily={SHARE_FONT_FAMILY}
          fill="#445478"
        >
          모하심
        </text>
        {data && (
          <text
            x={SHARE_CARD_SIZE / 2}
            y={MONTH_Y}
            textAnchor="middle"
            fontSize="22"
            fontFamily={SHARE_FONT_FAMILY}
            fill="#9aa0b0"
          >
            {`${data.year}년 ${data.month}월`}
          </text>
        )}

        {/* 잔디 그리드 — 68×68 셀, gap 8, rx 13 */}
        <g id="grass-grid" transform={`translate(${GRID_X}, ${GRID_TOP})`}>
          {(data?.cells ?? []).map((cell, idx) => {
            if (cell.date === null) return null;
            const col = idx % GRID_COLS;
            const row = Math.floor(idx / GRID_COLS);
            return (
              <rect
                key={idx}
                x={col * STEP}
                y={row * STEP}
                width={CELL}
                height={CELL}
                rx="13"
                fill={GRASS_COLORS[cell.level]}
              />
            );
          })}
        </g>

        {/* 통계 배지 (더 작고 elegant) */}
        <g id="highlights">
          {highlights.bestFocus ? (
            <g transform={`translate(${BADGE_X}, ${STATS_TOP})`}>
              <rect
                width={BADGE_WIDTH}
                height={BADGE_HEIGHT}
                rx={BADGE_HEIGHT / 2}
                fill="#fbf0d7"
                stroke="#ecdfc3"
                strokeWidth="1.2"
              />
              <text
                x={BADGE_WIDTH / 2}
                y={BADGE_HEIGHT / 2 + 8}
                textAnchor="middle"
                fontSize="22"
                fontFamily={SHARE_FONT_FAMILY}
                fill="#7c5a2c"
              >
                {`🏆 가장 집중한 날 · ${formatShortKoreanDate(
                  highlights.bestFocus.date
                )} (${highlights.bestFocus.score}점)`}
              </text>
            </g>
          ) : (
            <text
              x={SHARE_CARD_SIZE / 2}
              y={STATS_TOP + BADGE_HEIGHT / 2 + 8}
              textAnchor="middle"
              fontSize="22"
              fontFamily={SHARE_FONT_FAMILY}
              fill="#9aa0b0"
            >
              아직 집중 세션 없음
            </text>
          )}
          {highlights.mostTodos && (
            <g transform={`translate(${BADGE_X}, ${STATS_TOP + STATS_GAP})`}>
              <rect
                width={BADGE_WIDTH}
                height={BADGE_HEIGHT}
                rx={BADGE_HEIGHT / 2}
                fill="#e3f1da"
                stroke="#c6dfb6"
                strokeWidth="1.2"
              />
              <text
                x={BADGE_WIDTH / 2}
                y={BADGE_HEIGHT / 2 + 8}
                textAnchor="middle"
                fontSize="22"
                fontFamily={SHARE_FONT_FAMILY}
                fill="#446d34"
              >
                {`✅ 할일 많이 한 날 · ${formatShortKoreanDate(
                  highlights.mostTodos.date
                )} (${highlights.mostTodos.count}개)`}
              </text>
            </g>
          )}
        </g>

        {/* 사용자 메시지 */}
        {message && (
          <text
            x={SHARE_CARD_SIZE / 2}
            y={MESSAGE_Y}
            textAnchor="middle"
            fontSize="42"
            fontWeight="bold"
            fontFamily={SHARE_FONT_FAMILY}
            fill="#2b2520"
          >
            {message}
          </text>
        )}

        {/* 하단 워터마크 */}
        <text
          x={SHARE_CARD_SIZE / 2}
          y={WATERMARK_Y}
          textAnchor="middle"
          fontSize="22"
          fontFamily={SHARE_FONT_FAMILY}
          fill="#b8b0a4"
        >
          모하심으로 기록 중 🌱
        </text>
      </svg>
    </div>
  );
});
