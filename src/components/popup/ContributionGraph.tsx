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
};

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
}: ContributionGraphProps) {
  return (
    <div className="flex flex-col gap-2">
      {!hideNav && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onMonthChange(monthOffset - 1)}
            aria-label="이전 달"
            className="px-2 py-1 text-sm text-deep"
          >
            ←
          </button>
          <span className="text-sm font-semibold text-ink">
            {data ? `${data.year}년 ${data.month}월` : "..."}
          </span>
          <button
            type="button"
            onClick={() => onMonthChange(monthOffset + 1)}
            disabled={monthOffset >= 0}
            aria-label="다음 달"
            className="px-2 py-1 text-sm text-deep disabled:text-deep/20"
          >
            →
          </button>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-deep/60">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {(data?.cells ?? []).map((cell, idx) => (
          <Cell key={idx} cell={cell} />
        ))}
      </div>
    </div>
  );
}

function Cell({ cell }: { cell: DayCell }) {
  if (cell.date === null) {
    return <div className="aspect-square" aria-hidden="true" />;
  }
  const tooltip = cell.isFuture
    ? cell.date
    : `${cell.date}: ${cell.sessions}회, 평균 ${cell.avg}점`;
  return (
    <div
      title={tooltip}
      style={{ backgroundColor: GRASS_COLORS[cell.level] }}
      className="aspect-square rounded-sm transition-transform hover:scale-110 hover:border hover:border-ink hover:shadow-sm"
    />
  );
}
