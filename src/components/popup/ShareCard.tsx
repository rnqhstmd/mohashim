import { forwardRef, useMemo, type CSSProperties } from "react";
import {
  SHARE_CARD_SIZE,
  GRASS_COLORS,
  type DayCell,
  type MonthData,
} from "../../lib/grass";

// Phase 21 사용자 피드백: 잔디 자랑 PNG의 폰트가 앱 본문(KyoboHandwriting2019)과
// 다른 회귀 — canvas는 SVG-as-image 렌더 시 외부 CSS @font-face에 접근하지 못해
// 시스템 폴백으로 합성됨. 해소: SVG <defs><style>에 @font-face data-URL을 인라인
// 임베드하고 <text>에 명시적 font-family를 지정. composeShareCard가 직렬화 직전에
// data URL을 주입한다 (`fontDataUrl` prop). 미설정 시 fontFamily만 적용되고 시스템
// 폴백(Apple SD Gothic Neo 등)으로 렌더 — 본 prop은 항상 함께 사용한다.
const SHARE_FONT_FAMILY =
  "KyoboHandwriting2019, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

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
  /**
   * Phase 21: KyoboHandwriting2019 woff base64 data URL.
   * 지정 시 SVG 내부에 @font-face를 임베드하여 canvas 렌더링에서도 손글씨 폰트
   * 적용. 미지정/실패 시 fontFamily 폴백 체인으로 자연 렌더.
   */
  fontDataUrl?: string | null;
};

type MonthHighlights = {
  bestFocus: { date: string; score: number } | null;
  mostTodos: { date: string; count: number } | null;
};

/**
 * 그 달 cells에서 (1) 평균 점수가 가장 높은 날, (2) todo를 가장 많이 완료한 날을
 * 계산한다. 동률이면 더 이른 날짜가 우선. sessions=0인 날은 점수 계산에서 제외하여
 * 점수 0의 노출을 방지. todo는 cells.todos 그대로 사용.
 */
function computeMonthHighlights(data: MonthData | null): MonthHighlights {
  if (!data) return { bestFocus: null, mostTodos: null };
  let best: { date: string; score: number } | null = null;
  let most: { date: string; count: number } | null = null;
  for (const cell of data.cells as DayCell[]) {
    if (cell.date === null || cell.isFuture) continue;
    if (cell.sessions > 0) {
      if (!best || cell.avg > best.score) {
        best = { date: cell.date, score: cell.avg };
      }
    }
    if (cell.todos > 0) {
      if (!most || cell.todos > most.count) {
        most = { date: cell.date, count: cell.todos };
      }
    }
  }
  return { bestFocus: best, mostTodos: most };
}

/** 'YYYY-MM-DD' → 'M월 D일' 한글 표기. 파싱 실패 시 빈 문자열. */
function formatShortKoreanDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  if (!m || !d) return "";
  return `${m}월 ${d}일`;
}

/**
 * 공유 카드 SVG 본체 (Phase 8 + Phase 16 + Phase 21 재설계).
 *
 * Phase 21 변경:
 * - 워터마크 "MOHASHIM" → "모하심" (한글)
 * - <g id="highlights">: 그 달의 베스트 (가장 집중 잘 한 날 / 할일 가장 많이 한 날) 노출
 *
 * <foreignObject> 미사용 (AC-G30) — <text>만 사용.
 */
export const ShareCard = forwardRef<SVGSVGElement, ShareCardProps>(function ShareCard(
  { data, message, previewSize, fontDataUrl },
  ref
) {
  const isPreview = typeof previewSize === "number";
  const renderSize = isPreview ? previewSize : SHARE_CARD_SIZE;
  const highlights = useMemo(() => computeMonthHighlights(data), [data]);

  const wrapperClass = isPreview
    ? ""
    : "pointer-events-none absolute top-0";
  const wrapperStyle: CSSProperties = isPreview
    ? { width: previewSize, height: previewSize }
    : { left: "-99999px" };

  // 그리드는 grass 영역 상단으로 고정 (translate y=180). 셀 100 + gap 10 → 행당 110.
  // 6주 최대 660px → grass 영역은 y 180~840 사이. 베스트 통계는 y=890~1010 영역,
  // 사용자 메시지는 y=1040 (이전 y=950보다 아래로 이동하여 통계와 분리).
  const GRASS_TOP = 180;
  const HIGHLIGHTS_TOP = 880;
  const MESSAGE_Y = 1010;

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
        {/* Phase 21: 폰트 임베드. data URL이 들어오면 canvas-as-image 경로에서도
            손글씨 폰트가 적용된다. 미설정 시 fontFamily 폴백 체인으로 렌더. */}
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
        {/* 배경 — cream (Phase 17 FR-D1 통일: #fff8e0 → #fffaed) */}
        <rect width="100%" height="100%" fill="#fffaed" />

        {/* 워터마크 — Phase 21: 한글 "모하심"으로 교체 (브랜드 일관성). */}
        <g id="watermark">
          <text
            x={SHARE_CARD_SIZE / 2}
            y="90"
            textAnchor="middle"
            fontSize="56"
            fontWeight="bold"
            fontFamily={SHARE_FONT_FAMILY}
            fill="#445478"
          >
            모하심
          </text>
          {data && (
            <text
              x={SHARE_CARD_SIZE / 2}
              y="140"
              textAnchor="middle"
              fontSize="28"
              fontFamily={SHARE_FONT_FAMILY}
              fill="#8a93a6"
            >
              {`${data.year}년 ${data.month}월`}
            </text>
          )}
        </g>

        {/* 잔디 그리드 — 7×N, 셀 100×100, gap 10 */}
        <g id="grass-grid" transform={`translate(140, ${GRASS_TOP})`}>
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

        {/* Phase 21: 그 달의 베스트 — 가장 집중 잘 한 날 / 할일 가장 많이 한 날.
            세션이 1건도 없는 신규 사용자/빈 달은 안내문으로 폴백. */}
        <g id="highlights">
          {highlights.bestFocus ? (
            <text
              x={SHARE_CARD_SIZE / 2}
              y={HIGHLIGHTS_TOP}
              textAnchor="middle"
              fontSize="32"
              fontFamily={SHARE_FONT_FAMILY}
              fill="#445478"
            >
              {`🏆 가장 집중 잘 한 날 — ${formatShortKoreanDate(
                highlights.bestFocus.date
              )} (${highlights.bestFocus.score}점)`}
            </text>
          ) : (
            <text
              x={SHARE_CARD_SIZE / 2}
              y={HIGHLIGHTS_TOP}
              textAnchor="middle"
              fontSize="28"
              fontFamily={SHARE_FONT_FAMILY}
              fill="#8a93a6"
            >
              아직 집중 세션 없음
            </text>
          )}
          {highlights.mostTodos ? (
            <text
              x={SHARE_CARD_SIZE / 2}
              y={HIGHLIGHTS_TOP + 60}
              textAnchor="middle"
              fontSize="32"
              fontFamily={SHARE_FONT_FAMILY}
              fill="#5fa97a"
            >
              {`✅ 할일 가장 많이 한 날 — ${formatShortKoreanDate(
                highlights.mostTodos.date
              )} (${highlights.mostTodos.count}개)`}
            </text>
          ) : null}
        </g>

        {/* Phase 16 FR-2: 사용자 메시지 (비어있지 않을 때만 렌더) */}
        {message && (
          <text
            x={SHARE_CARD_SIZE / 2}
            y={MESSAGE_Y}
            textAnchor="middle"
            fontSize="56"
            fontWeight="bold"
            fontFamily={SHARE_FONT_FAMILY}
            fill="#2b2520"
          >
            {message}
          </text>
        )}
      </svg>
    </div>
  );
});
