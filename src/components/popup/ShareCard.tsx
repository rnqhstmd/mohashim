import { forwardRef, useMemo, type CSSProperties } from "react";
import {
  SHARE_CARD_WIDTH,
  SHARE_CARD_HEIGHT,
  GRASS_COLORS,
  type DayCell,
  type MonthData,
} from "../../lib/grass";

const SHARE_FONT_FAMILY =
  "KyoboHandwriting2019, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

export const SHARE_PREVIEW_DISPLAY_PX = 240;

// === Layout (864 × 1164, 네모 카드) ===

// 헤더: 텍스트만 중앙 정렬
const TITLE_Y = 124;
const MONTH_Y = 176;

// 요일 헤더
const WEEKDAY_Y = 238;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 잔디 그리드
const CELL = 76;
const STEP = 86;
const GRID_COLS = 7;
const GRID_WIDTH = (GRID_COLS - 1) * STEP + CELL; // 592
const GRID_X = Math.round((SHARE_CARD_WIDTH - GRID_WIDTH) / 2); // 136
const GRID_TOP = 262;

// 범례 — 적음 ▢▢▢▢▢ 많음 (잔디맵 우측 하단 끝에 align)
const LEGEND_Y = 778;
const LEGEND_CELL = 18;
const LEGEND_CELL_GAP = 6;
const LEGEND_TEXT_WIDTH = 36; // "적음" / "많음" 추정 폭 (fontSize 18)
const LEGEND_TEXT_GAP = 8;
const LEGEND_WIDTH =
  LEGEND_TEXT_WIDTH +
  LEGEND_TEXT_GAP +
  (LEGEND_CELL * 5 + LEGEND_CELL_GAP * 4) +
  LEGEND_TEXT_GAP +
  LEGEND_TEXT_WIDTH;
const LEGEND_RIGHT_X = GRID_X + GRID_WIDTH;
const LEGEND_LEFT_X = LEGEND_RIGHT_X - LEGEND_WIDTH;

// 업적 좌우 분할 (라벨 + 메인)
const ACH_LABEL_Y = 858;
const ACH_MAIN_Y = 898;
const COL1_X = 232; // 좌측 column center
const COL2_X = 632; // 우측 column center

// 자랑 한마디 (업적 아래, 풀폭)
const MSG_LABEL_Y = 968;
const MSG_MAIN_Y = 1020;

const WATERMARK_Y = 1130;

// 배경 캐릭터 워터마크 — 더 크게 (420 → 580)
const BG_CHAR_SIZE = 580;
const BG_CHAR_X = Math.round((SHARE_CARD_WIDTH - BG_CHAR_SIZE) / 2);
const BG_CHAR_Y = 440;
const BG_CHAR_SCALE = BG_CHAR_SIZE / 200;
const BG_OPACITY = 0.09;

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

/** 인라인 calm-state 감자 (헤더 아이콘 + 배경 워터마크 공용) */
function PotatoSvg({
  x,
  y,
  scale,
}: {
  x: number;
  y: number;
  scale: number;
}) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
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
  );
}

export const ShareCard = forwardRef<SVGSVGElement, ShareCardProps>(function ShareCard(
  { data, message, previewSize, fontDataUrl, itemDataUrls },
  ref
) {
  const isPreview = typeof previewSize === "number";
  const aspectScale = SHARE_CARD_HEIGHT / SHARE_CARD_WIDTH;
  const renderWidth = isPreview ? previewSize : SHARE_CARD_WIDTH;
  const renderHeight = isPreview ? previewSize * aspectScale : SHARE_CARD_HEIGHT;
  const highlights = useMemo(() => computeMonthHighlights(data), [data]);

  const wrapperClass = isPreview ? "" : "pointer-events-none";
  const wrapperStyle: CSSProperties = isPreview
    ? { width: renderWidth, height: renderHeight }
    : {};

  const focusBlock = highlights.bestFocus
    ? {
        label: "🏆 가장 집중한 날",
        main: `${formatShortKoreanDate(highlights.bestFocus.date)}, 평균 ${highlights.bestFocus.score}점`,
        color: "#445478",
      }
    : {
        label: "🏆 가장 집중한 날",
        main: "기록 없음",
        color: "#9aa0b0",
      };

  const todosBlock = highlights.mostTodos
    ? {
        label: "✅ 할일 많이 한 날",
        main: `${formatShortKoreanDate(highlights.mostTodos.date)}, ${highlights.mostTodos.count}개 완료`,
        color: "#5fa97a",
      }
    : {
        label: "✅ 할일 많이 한 날",
        main: "기록 없음",
        color: "#9aa0b0",
      };

  return (
    <div
      className={wrapperClass}
      style={wrapperStyle}
      {...(isPreview ? {} : { "aria-hidden": true })}
    >
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={renderWidth}
        height={renderHeight}
        viewBox={`0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}`}
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

        {/* 카드 본체 cream 배경 (네모) */}
        <rect
          width={SHARE_CARD_WIDTH}
          height={SHARE_CARD_HEIGHT}
          fill="#fffaed"
        />

        {/* 배경 캐릭터 워터마크 */}
        <g id="bg-character" opacity={BG_OPACITY}>
          {itemDataUrls?.back && (
            <image
              href={itemDataUrls.back}
              x={BG_CHAR_X}
              y={BG_CHAR_Y}
              width={BG_CHAR_SIZE}
              height={BG_CHAR_SIZE}
            />
          )}
          <PotatoSvg x={BG_CHAR_X} y={BG_CHAR_Y} scale={BG_CHAR_SCALE} />
          {itemDataUrls?.head && (
            <image
              href={itemDataUrls.head}
              x={BG_CHAR_X}
              y={BG_CHAR_Y}
              width={BG_CHAR_SIZE}
              height={BG_CHAR_SIZE}
            />
          )}
          {itemDataUrls?.face && (
            <image
              href={itemDataUrls.face}
              x={BG_CHAR_X}
              y={BG_CHAR_Y}
              width={BG_CHAR_SIZE}
              height={BG_CHAR_SIZE}
            />
          )}
        </g>

        {/* 헤더 — "모하심 잔디 자랑하기" 중앙 정렬 */}
        <text
          x={SHARE_CARD_WIDTH / 2}
          y={TITLE_Y}
          textAnchor="middle"
          fontSize="54"
          fontWeight="bold"
          fontFamily={SHARE_FONT_FAMILY}
          fill="#445478"
        >
          모하심 잔디 자랑하기
        </text>
        {data && (
          <text
            x={SHARE_CARD_WIDTH / 2}
            y={MONTH_Y}
            textAnchor="middle"
            fontSize="32"
            fontFamily={SHARE_FONT_FAMILY}
            fill="#8a93a6"
          >
            {`${data.year}년 ${data.month}월`}
          </text>
        )}

        {/* 요일 헤더 — 일~토 */}
        <g id="weekdays">
          {WEEKDAYS.map((wd, i) => {
            const cx = GRID_X + i * STEP + CELL / 2;
            const color = i === 0 ? "#c46455" : i === 6 ? "#5a8dd8" : "#8a93a6";
            return (
              <text
                key={wd}
                x={cx}
                y={WEEKDAY_Y}
                textAnchor="middle"
                fontSize="22"
                fontFamily={SHARE_FONT_FAMILY}
                fill={color}
              >
                {wd}
              </text>
            );
          })}
        </g>

        {/* 잔디 그리드 */}
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
                rx="14"
                fill={GRASS_COLORS[cell.level]}
              />
            );
          })}
        </g>

        {/* 적음 → 많음 범례 (잔디맵 우측 하단 정렬) */}
        <g id="legend">
          <text
            x={LEGEND_LEFT_X}
            y={LEGEND_Y + LEGEND_CELL - 4}
            fontSize="18"
            fontFamily={SHARE_FONT_FAMILY}
            fill="#9aa0b0"
          >
            적음
          </text>
          {GRASS_COLORS.map((color, i) => (
            <rect
              key={i}
              x={LEGEND_LEFT_X + LEGEND_TEXT_WIDTH + LEGEND_TEXT_GAP + i * (LEGEND_CELL + LEGEND_CELL_GAP)}
              y={LEGEND_Y}
              width={LEGEND_CELL}
              height={LEGEND_CELL}
              rx="4"
              fill={color}
            />
          ))}
          <text
            x={LEGEND_LEFT_X + LEGEND_TEXT_WIDTH + LEGEND_TEXT_GAP + (LEGEND_CELL * 5 + LEGEND_CELL_GAP * 4) + LEGEND_TEXT_GAP}
            y={LEGEND_Y + LEGEND_CELL - 4}
            fontSize="18"
            fontFamily={SHARE_FONT_FAMILY}
            fill="#9aa0b0"
          >
            많음
          </text>
        </g>

        {/* 업적 — 좌우 분할 (라벨 + 메인) */}
        <g id="achievements">
          {/* 좌측: 집중 */}
          <text
            x={COL1_X}
            y={ACH_LABEL_Y}
            textAnchor="middle"
            fontSize="22"
            fontFamily={SHARE_FONT_FAMILY}
            fill="#9aa0b0"
          >
            {focusBlock.label}
          </text>
          <text
            x={COL1_X}
            y={ACH_MAIN_Y}
            textAnchor="middle"
            fontSize="30"
            fontWeight="bold"
            fontFamily={SHARE_FONT_FAMILY}
            fill={focusBlock.color}
          >
            {focusBlock.main}
          </text>

          {/* 우측: 할일 */}
          <text
            x={COL2_X}
            y={ACH_LABEL_Y}
            textAnchor="middle"
            fontSize="22"
            fontFamily={SHARE_FONT_FAMILY}
            fill="#9aa0b0"
          >
            {todosBlock.label}
          </text>
          <text
            x={COL2_X}
            y={ACH_MAIN_Y}
            textAnchor="middle"
            fontSize="30"
            fontWeight="bold"
            fontFamily={SHARE_FONT_FAMILY}
            fill={todosBlock.color}
          >
            {todosBlock.main}
          </text>

          {/* 좌우 사이 구분 점 */}
          <circle cx={SHARE_CARD_WIDTH / 2} cy={ACH_MAIN_Y - 12} r="3" fill="#d8d0bf" />
        </g>

        {/* 자랑 한마디 — 그 아래 풀폭 */}
        {message && (
          <g id="user-message">
            <text
              x={SHARE_CARD_WIDTH / 2}
              y={MSG_LABEL_Y}
              textAnchor="middle"
              fontSize="22"
              fontFamily={SHARE_FONT_FAMILY}
              fill="#9aa0b0"
            >
              💬 내 자랑 한마디
            </text>
            <text
              x={SHARE_CARD_WIDTH / 2}
              y={MSG_MAIN_Y}
              textAnchor="middle"
              fontSize="56"
              fontWeight="bold"
              fontFamily={SHARE_FONT_FAMILY}
              fill="#2b2520"
            >
              {message}
            </text>
          </g>
        )}

        {/* 워터마크 */}
        <text
          x={SHARE_CARD_WIDTH / 2}
          y={WATERMARK_Y}
          textAnchor="middle"
          fontSize="22"
          fontFamily={SHARE_FONT_FAMILY}
          fill="#b8b0a4"
        >
          모하심으로 기록 중 🌱
        </text>

        {/* 카드 외곽선 (네모) */}
        <rect
          x="0.9"
          y="0.9"
          width={SHARE_CARD_WIDTH - 1.8}
          height={SHARE_CARD_HEIGHT - 1.8}
          fill="none"
          stroke="#e2d8c4"
          strokeWidth="1.8"
        />
      </svg>
    </div>
  );
});
