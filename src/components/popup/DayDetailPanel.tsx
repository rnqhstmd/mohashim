import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  getSessionLogs,
  getTodos,
  type SessionLog,
} from "../../lib/storage";
import { formatDateHeading, formatSessionTime } from "../../lib/grass";

type DayDetailPanelProps = {
  /** 'YYYY-MM-DD' 로컬 날짜 (FR-3 selectedDate). */
  date: string;
  /** X 버튼 / ESC / 외부 클릭 시 호출 (FR-7). */
  onClose: () => void;
  /**
   * Phase 13 CON-2: 외부 클릭 판정에서 제외할 영역 ref (예: 잔디 grid container).
   * 잔디 셀 클릭으로 새 selectedDate를 설정한 직후 unmount→mount 깜박임을 회피한다 —
   * 잔디 grid 안의 mousedown은 '외부 클릭'으로 판정하지 않는다.
   */
  excludeRef?: RefObject<HTMLElement | null>;
};

/**
 * Phase 13 — 잔디 날짜별 상세 조회 패널 (FR-4~12).
 *
 * - 헤더: "2026년 5월 6일 화요일" (FR-8) + X 버튼.
 * - 본문: session_logs 필터 (FR-5) — 순번/시각/집중분/점수 (FR-6, FR-9).
 * - 완료 todo 목록: todos_done ID → todos 스토어 텍스트 (FR-10, BR-5: 삭제된 ID 제외).
 * - 닫기: X 버튼 / ESC / 외부 클릭 (FR-7).
 *
 * mount 시 데이터를 1회 로드. date prop 변경 시 재로드 (BR-3).
 */
export function DayDetailPanel({ date, onClose, excludeRef }: DayDetailPanelProps) {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [todoMap, setTodoMap] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // FR-5 / BR-3: date 변경 시 재로드. cancelled 패턴으로 stale setState 방지.
  // PR #14 cross-review: load 시작 시점에 logs/todoMap을 비워 stale 표시 차단.
  // load 실패 catch에서도 비어있는 상태가 유지되어 이전 날짜 데이터가 화면에 남지 않는다.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLogs([]);
    setTodoMap(new Map());
    (async () => {
      try {
        const [allLogs, todos] = await Promise.all([
          getSessionLogs(),
          getTodos(),
        ]);
        if (cancelled) return;
        setLogs(allLogs.filter((l) => l.date === date));
        setTodoMap(new Map(todos.map((t) => [t.id, t.text])));
      } catch (err) {
        console.error("[mohashim] day detail load failed", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // FR-7: ESC 키로 닫기.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // FR-7 / CON-2: 외부 클릭 닫기. excludeRef 영역과 panel 영역 모두 안이면 미닫힘.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const panelEl = panelRef.current;
      const excludeEl = excludeRef?.current;
      const insidePanel = panelEl !== null && panelEl.contains(target);
      const insideExclude = excludeEl != null && excludeEl.contains(target);
      if (!insidePanel && !insideExclude) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose, excludeRef]);

  // FR-10 / BR-5: 완료 todo 항목 — 삭제된 ID는 제외.
  // PR #14 리뷰: {id, text} 객체 배열 + key={id}로 React 재조정 안정성 확보.
  const doneItems = useMemo(() => {
    const ids = new Set<string>();
    for (const log of logs) {
      const todoIds = log.todos_done ?? [];
      for (const id of todoIds) ids.add(id);
    }
    return Array.from(ids)
      .map((id) => ({ id, text: todoMap.get(id) }))
      .filter((item): item is { id: string; text: string } => typeof item.text === "string");
  }, [logs, todoMap]);

  // FR-8: 'YYYY-MM-DD' → "YYYY년 M월 D일 요일". 로컬 자정 기준 파싱.
  // PR #14 리뷰: split 후 (y, m-1, d) 인자 생성자로 로컬/UTC 해석 차이 회피.
  const headingDate = useMemo(() => {
    const [y, m, day] = date.split("-").map(Number);
    const d = new Date(y, m - 1, day);
    return formatDateHeading(d);
  }, [date]);

  return (
    <div
      ref={panelRef}
      className="mt-3 rounded-xl border-[1.5px] border-ink/15 bg-paperWarm/85 p-3 shadow-[1.5px_1.5px_0_0_rgba(40,37,32,0.08)] backdrop-blur-sm animate-slide-up"
      role="dialog"
      aria-label="날짜 상세"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-ink">{headingDate}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="text-ink/45 hover:text-ink/75"
        >
          ×
        </button>
      </header>
      {loaded && (
        <>
          {logs.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-ink/80">
              {logs.map((log, idx) => (
                <li key={log.id}>
                  [{idx + 1}] {formatSessionTime(log.start_at, log.end_at)} · {log.duration_mins}분 · {log.score}점
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-sm text-ink/45">세션 기록 없음</div>
          )}
          {doneItems.length > 0 && (
            <>
              <h4 className="mt-3 text-xs font-bold text-deepNavy">완료한 todo</h4>
              <ul className="mt-1 space-y-0.5 text-sm text-ink/80">
                {doneItems.map((item) => (
                  <li key={item.id}>✓ {item.text}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
