import type { KeyboardEvent } from "react";
import {
  GRASS_COLORS,
  type MonthData,
  type DayCell,
} from "../../lib/grass";

type ContributionGraphProps = {
  data: MonthData | null;
  monthOffset: number;
  onMonthChange: (next: number) => void;
  // U-G3: 옵셔널 props (후속 Phase ShareCard 임베드 등 확장 대비, 본 Phase 미사용)
  onHover?: (idx: number | null) => void;
  hoveredIdx?: number | null;
  hideNav?: boolean;
  /**
   * Phase 10 FR-17, AC-17, BR-6: 이전 월 버튼 비활성화 경계 (음수 또는 0).
   * monthOffset이 minOffset 이하이면 이전 월 버튼 disabled. undefined면 비활성화하지 않음 (하위 호환).
   */
  minOffset?: number;
  /**
   * Phase 13 FR-1, BR-1: 클릭 가능 셀(미래 X + 데이터 있음) 클릭 시 호출.
   * 미전달 시 클릭 비활성 — ShareCard 등 기존 호출자 하위 호환.
   */
  onDayClick?: (date: string) => void;
};

/**
 * 이전 월 버튼 disabled 판정 (DEC-10-5).
 *
 * BR-6 하위 호환: minOffset이 undefined면 항상 활성화 (false).
 * 경계: monthOffset <= minOffset일 때 disabled (예: minOffset=-4, monthOffset=-4 → true).
 */
export function shouldDisablePrev(
  monthOffset: number,
  minOffset: number | undefined
): boolean {
  if (minOffset === undefined) return false;
  return monthOffset <= minOffset;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 월별 달력 잔디 그래프 (D-G4, FR-17).
 *
 * - 헤더: ← `YYYY년 MM월` →. 다음 월 버튼은 monthOffset >= 0이면 disabled (BR-G5).
 * - 7열(일~토) 그리드. leading blank로 1일 정렬. trailing blank로 7의 배수 채움.
 * - 셀 컬러: GRASS_0~GRASS_4 5단계.
 * - hover: scale-110 + ink 보더 + 그림자 (1.10× 보수 — 1.15는 인접 셀 침범 우려).
 * - 미래 일자: GRASS_0 + tooltip 데이터 없음.
 */
export function ContributionGraph({
  data,
  monthOffset,
  onMonthChange,
  hideNav = false,
  minOffset,
  onDayClick,
}: ContributionGraphProps) {
  const prevDisabled = shouldDisablePrev(monthOffset, minOffset);
  return (
    <div className="flex flex-col gap-2">
      {!hideNav && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onMonthChange(monthOffset - 1)}
            disabled={prevDisabled}
            aria-label="이전 달"
            className="rounded-md px-2 py-1 text-sm font-bold text-ink/65 transition-colors hover:bg-ink/5 hover:text-ink disabled:text-ink/20 disabled:hover:bg-transparent"
          >
            ←
          </button>
          <span className="text-sm font-extrabold tabular-nums text-ink">
            {data ? `${data.year}년 ${data.month}월` : "..."}
          </span>
          <button
            type="button"
            onClick={() => onMonthChange(monthOffset + 1)}
            disabled={monthOffset >= 0}
            aria-label="다음 달"
            className="rounded-md px-2 py-1 text-sm font-bold text-ink/65 transition-colors hover:bg-ink/5 hover:text-ink disabled:text-ink/20 disabled:hover:bg-transparent"
          >
            →
          </button>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-ink/45">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {(data?.cells ?? []).map((cell, idx) => (
          <Cell key={idx} cell={cell} onDayClick={onDayClick} />
        ))}
      </div>
    </div>
  );
}

function Cell({
  cell,
  onDayClick,
}: {
  cell: DayCell;
  onDayClick?: (date: string) => void;
}) {
  if (cell.date === null) {
    return <div className="aspect-square" aria-hidden="true" />;
  }
  const tooltip = cell.isFuture
    ? cell.date
    : `${cell.date}: ${cell.sessions}회, 평균 ${cell.avg}점`;
  // Phase 13 FR-2 / BR-2: 미래 X + (sessions>0 || todos>0) + onDayClick 전달 시에만 클릭 가능.
  const clickable =
    !cell.isFuture &&
    cell.date !== null &&
    (cell.sessions > 0 || cell.todos > 0) &&
    onDayClick != null;
  const handleClick = () => {
    if (clickable && cell.date !== null) onDayClick!(cell.date);
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };
  return (
    <div
      title={tooltip}
      role={clickable ? "button" : "img"}
      aria-label={tooltip}
      tabIndex={clickable ? 0 : -1}
      onClick={clickable ? handleClick : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
      style={{ backgroundColor: GRASS_COLORS[cell.level] }}
      className={`aspect-square rounded-sm transition-transform${
        clickable
          ? " hover:scale-110 hover:border hover:border-ink hover:shadow-sm focus:scale-110 focus:border focus:border-ink focus:shadow-sm focus:outline-none cursor-pointer"
          : ""
      }`}
    />
  );
}
