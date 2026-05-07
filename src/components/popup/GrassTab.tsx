import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ContributionGraph } from "./ContributionGraph";
import { SharePreviewModal } from "./SharePreviewModal";
import { DayDetailPanel } from "./DayDetailPanel";
import {
  formatDate,
  getMonthSessions,
  type MonthData,
} from "../../lib/grass";

/**
 * Grass 탭 본체 (FR-17, FR-18 / Phase 16 FR-9).
 *
 * - 헤더: 오늘 sessions/avg 통계 + "잔디 자랑하기" 버튼.
 * - 본문: ContributionGraph (월별 달력).
 * - Phase 16: 자랑하기 클릭 → SharePreviewModal 열림. composeShareCard / 토스트
 *   호출은 모달이 담당 (off-screen ShareCard 마운트도 모달로 이전).
 */
export function GrassTab() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [data, setData] = useState<MonthData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Phase 13 FR-3: 클릭된 셀의 'YYYY-MM-DD'. null이면 패널 미표시.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Phase 13 CON-2: 잔디 grid container ref — DayDetailPanel의 외부 클릭 판정 제외 영역.
  // grid 안에서의 mousedown(다른 셀 클릭)이 panel을 닫고 다시 마운트하는 깜박임을 회피.
  const gridContainerRef = useRef<HTMLDivElement>(null);
  // Phase 10 AC-17: 이전 월 버튼 경계는 올해 1월(= -getMonth()). mount 1회 산출.
  // 자정 경계 부정확은 본 Phase 수용 — 재mount/재기동 시 자가 회복.
  const minOffset = useMemo(() => -new Date().getMonth(), []);

  // Phase 13 FR-11: 월 변경 시 selectedDate 초기화 → 패널 자동 닫힘.
  useEffect(() => {
    setSelectedDate(null);
  }, [monthOffset]);

  useEffect(() => {
    let cancelled = false;
    // monthOffset 변경 시 stale data로 ShareCard가 합성되는 것을 방지하기 위해 즉시 초기화.
    setData(null);
    setLoaded(false);
    (async () => {
      try {
        const md = await getMonthSessions(monthOffset);
        if (!cancelled) setData(md);
      } catch (err) {
        console.error("[mohashim] grass load failed", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monthOffset]);

  /**
   * Phase 12 FR-7 / AC-14: Rust `record_todo_completion` / `undo_todo_completion`이
   * emit한 `todo-completion` 이벤트 수신 시 현재 monthOffset을 다시 로드하여
   * 잔디 색칠을 즉시 갱신한다. 다른 월을 보고 있어도 mounted 동안은 listener 활성.
   *
   * mounted 플래그 + cancelled 패턴으로 unmount 후 setState 차단 + listen 등록 race 방지.
   */
  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const u = await listen("todo-completion", () => {
          if (!mounted) return;
          (async () => {
            try {
              const md = await getMonthSessions(monthOffset);
              if (mounted) setData(md);
            } catch (err) {
              console.error("[mohashim] grass reload failed", err);
            }
          })();
        });
        if (mounted) {
          unlisten = u;
        } else {
          // mount 도중 unmount된 경우 즉시 해제.
          u();
        }
      } catch (err) {
        console.error("[mohashim] todo-completion listen failed", err);
      }
    })();
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [monthOffset]);

  // 오늘 통계 — monthOffset=0이고 오늘 일자가 cells에 있으면.
  // 자기점검 수정: new Date(c.date)는 UTC 자정 파싱이라 TZ 의존. formatDate로 로컬 문자열 직접 비교.
  const todayStr = formatDate(new Date());
  const todayCell =
    monthOffset === 0 ? data?.cells.find((c) => c.date === todayStr) : undefined;
  const todaySessions = todayCell?.sessions ?? 0;
  const todayAvg = todayCell?.avg ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-deep/10 px-4 py-3">
        <div className="text-sm text-deep">
          {loaded
            ? todaySessions > 0
              ? `오늘 ${todaySessions}회 · 평균 ${todayAvg}점`
              : "오늘 아직 세션 없음"
            : "..."}
        </div>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          disabled={!loaded || !data}
          className="rounded-md bg-deep px-3 py-1.5 text-xs text-white disabled:opacity-40"
        >
          잔디 자랑하기
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div ref={gridContainerRef}>
          <ContributionGraph
            data={data}
            monthOffset={monthOffset}
            onMonthChange={setMonthOffset}
            minOffset={minOffset}
            onDayClick={setSelectedDate}
          />
        </div>
        {selectedDate !== null && (
          <DayDetailPanel
            date={selectedDate}
            onClose={() => setSelectedDate(null)}
            excludeRef={gridContainerRef}
          />
        )}
      </div>

      {showPreview && (
        <SharePreviewModal
          data={data}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
