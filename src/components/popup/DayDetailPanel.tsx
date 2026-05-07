import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  getSessionLogs,
  getTodos,
  getWorkTags,
  getLocations,
  type SessionLog,
  type Todo,
  type WorkTag,
  type Location,
} from "../../lib/storage";
import { formatDateHeading, formatSessionTime } from "../../lib/grass";
import { FlatTag } from "./FlatTag";

type DayDetailPanelProps = {
  /** 'YYYY-MM-DD' 로컬 날짜 (FR-3 selectedDate). */
  date: string;
  /** X 버튼 / ESC / 외부 클릭 시 호출 (FR-7). */
  onClose: () => void;
  /**
   * Phase 13 CON-2: 외부 클릭 판정에서 제외할 영역 ref (예: 잔디 grid container).
   */
  excludeRef?: RefObject<HTMLElement | null>;
};

type DoneItem = {
  id: string;
  text: string;
  tag: WorkTag | null;
  loc: Location | null;
};

/**
 * Phase 13 — 잔디 날짜별 상세 조회 패널 (FR-4~12).
 *
 * Phase 21 사용자 피드백 반영:
 *   - 완료한 할 일 영역에서 작업 태그 + 위치 태그를 emoji + 색상으로 함께 노출.
 *   - 세션 0건이어도 todos_done이 있으면 표시. 둘 다 없으면 명시적 빈 상태 메시지.
 *
 * 헤더: "2026년 5월 6일 화요일" + X 버튼.
 * 본문: session_logs 필터 + 완료 todo 목록 (각각 빈 상태 메시지 노출).
 * 닫기: X / ESC / 외부 클릭.
 */
export function DayDetailPanel({ date, onClose, excludeRef }: DayDetailPanelProps) {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [workTags, setWorkTags] = useState<WorkTag[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLogs([]);
    setTodos([]);
    (async () => {
      try {
        const [allLogs, allTodos, wt, locs] = await Promise.all([
          getSessionLogs(),
          getTodos(),
          getWorkTags(),
          getLocations(),
        ]);
        if (cancelled) return;
        setLogs(allLogs.filter((l) => l.date === date));
        setTodos(allTodos);
        setWorkTags(wt);
        setLocations(locs);
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

  // FR-7 / CON-2: 외부 클릭 닫기.
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

  const todoMap = useMemo(() => new Map(todos.map((t) => [t.id, t])), [todos]);
  const tagMap = useMemo(
    () => new Map(workTags.map((t) => [t.id, t])),
    [workTags]
  );
  const locMap = useMemo(
    () => new Map(locations.map((l) => [l.id, l])),
    [locations]
  );

  // 완료된 todo 수집 — 중복 제거 + 태그/위치 룩업.
  //
  // Phase 21 사용자 피드백: 잔디 상세에서 세션이 0건인 날 또는 세션 외부에서
  // 완료된 todo가 누락되는 회귀 — `logs.todos_done`은 Focus/Break 세션 진행
  // 중에만 SESSION_TODOS_DONE buffer에 적재되므로 (1) 세션 없이 완료한 항목
  // (2) 세션 시작 전/종료 후 완료한 항목은 추적 누락. 보완: 같은 날짜의
  // `todo.completedAt`이 그 날인 todo도 함께 수집한다 (id 기반 dedupe).
  const doneItems = useMemo<DoneItem[]>(() => {
    const ids = new Set<string>();
    for (const log of logs) {
      for (const id of log.todos_done ?? []) ids.add(id);
    }
    // todo.completedAt 기반 보충 — 로컬 'YYYY-MM-DD' 매칭.
    for (const t of todos) {
      if (!t.completedAt) continue;
      const parsed = new Date(t.completedAt);
      if (Number.isNaN(parsed.getTime())) continue;
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      const localDate = `${y}-${m}-${day}`;
      if (localDate === date) ids.add(t.id);
    }
    return Array.from(ids)
      .map((id) => {
        const t = todoMap.get(id);
        if (!t) return null;
        return {
          id,
          text: t.text,
          tag: t.tag ? tagMap.get(t.tag) ?? null : null,
          loc: t.loc ? locMap.get(t.loc) ?? null : null,
        };
      })
      .filter((item): item is DoneItem => item !== null);
  }, [logs, todos, date, todoMap, tagMap, locMap]);

  // FR-8: 'YYYY-MM-DD' → "YYYY년 M월 D일 요일".
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
          <section className="mt-3">
            <h4 className="text-[11px] font-extrabold tracking-wide text-deepNavy">
              세션
            </h4>
            {logs.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-sm text-ink/80">
                {logs.map((log, idx) => (
                  <li key={log.id}>
                    [{idx + 1}] {formatSessionTime(log.start_at, log.end_at)} · {log.duration_mins}분 · {log.score}점
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-xs text-ink/40">세션 기록 없음</div>
            )}
          </section>

          <section className="mt-3">
            <h4 className="text-[11px] font-extrabold tracking-wide text-deepNavy">
              완료한 할 일
            </h4>
            {doneItems.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {doneItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-0.5 text-sm text-ink/85"
                  >
                    <span className="break-words">✓ {item.text}</span>
                    {(item.tag || item.loc) && (
                      <span className="ml-4 flex flex-wrap items-center gap-1">
                        {item.tag && <FlatTag tag={item.tag} />}
                        {item.loc && <FlatTag tag={item.loc} />}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-xs text-ink/40">완료한 할 일 없음</div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
