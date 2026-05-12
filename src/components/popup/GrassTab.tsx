import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ContributionGraph } from "./ContributionGraph";
import { SharePreviewModal } from "./SharePreviewModal";
import { DayDetailPanel } from "./DayDetailPanel";
import { GrassHelpModal } from "./GrassHelpModal";
import { getMonthSessions, GRASS_COLORS, type MonthData } from "../../lib/grass";

/**
 * Grass 탭 본체.
 *
 * 상단: 잔디 사용법 안내 텍스트(가독성 위해 줄바꿈 명시).
 * 본문: ContributionGraph (월별 달력, 작은 셀로 GitHub contribution 스타일).
 * 하단: 적음 ▢▢▢▢▢ 많음 범례 + 공유 버튼 동일 행 정렬.
 *
 * interactionAreaRef는 그래프 + 범례·공유 버튼을 모두 포함하여 DayDetailPanel의
 * 외부 클릭 닫기 판정에서 제외된다 — 공유 버튼 클릭 시 패널이 먼저 닫혀
 * 공유 팝업이 안 뜨는 회귀 차단.
 */
export function GrassTab() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [data, setData] = useState<MonthData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const interactionAreaRef = useRef<HTMLDivElement>(null);
  const minOffset = useMemo(() => -new Date().getMonth(), []);

  useEffect(() => {
    setSelectedDate(null);
  }, [monthOffset]);

  useEffect(() => {
    let cancelled = false;
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

  const handleShareClick = () => {
    // 공유 팝업 진입 시 상세 패널은 명시적으로 닫는다(시각적 충돌 회피).
    setSelectedDate(null);
    setShowPreview(true);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 안내 텍스트 + ? 버튼 — 상세 정책은 GrassHelpModal로 분리 (점수 ? 버튼과 동일 UX). */}
      <div className="border-b border-ink/10 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="flex-1 text-[12px] font-semibold leading-[1.55] text-ink/80">
            세션 완료·할 일 체크 시 잔디가 자라고, 활동이 많을수록 색이 진해져요. 셀을 누르면 그 날의 상세를 볼 수 있어요.
          </p>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="잔디 색 산출 정책 보기"
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-ink/30 bg-paperWarm text-[9px] font-extrabold text-ink/55 hover:bg-ink/10 hover:text-ink"
          >
            ?
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-2">
        {/* 그래프 + 범례·공유 영역 — DayDetailPanel 외부 클릭 제외 영역 */}
        <div ref={interactionAreaRef}>
          <div className="mx-auto max-w-[224px]">
            <ContributionGraph
              data={data}
              monthOffset={monthOffset}
              onMonthChange={setMonthOffset}
              minOffset={minOffset}
              onDayClick={setSelectedDate}
            />
          </div>

          {/* 범례(적음 ▢▢▢▢▢ 많음) + 공유 버튼 — 같은 행 정렬 */}
          <div className="mx-auto mt-3 flex max-w-[224px] items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] font-bold text-ink/55">
              <span>적음</span>
              {GRASS_COLORS.map((c, i) => (
                <span
                  key={i}
                  className="h-2.5 w-2.5 rounded-sm border border-ink/10"
                  style={{ backgroundColor: c }}
                  aria-hidden
                />
              ))}
              <span>많음</span>
            </div>
            <button
              type="button"
              aria-label="잔디 자랑하기"
              onClick={handleShareClick}
              disabled={!loaded || !data}
              className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink bg-ink px-2.5 py-1 text-[11px] font-extrabold text-paperWarm shadow-[1.5px_1.5px_0_0_rgba(40,30,20,0.18)] transition-transform hover:-translate-y-px hover:shadow-[2px_3px_0_0_rgba(40,30,20,0.22)] active:translate-y-0 active:shadow-[1px_1px_0_0_rgba(40,30,20,0.18)] disabled:translate-y-0 disabled:bg-ink/30 disabled:text-paperWarm/70 disabled:shadow-none disabled:hover:translate-y-0"
            >
              <span aria-hidden>📤</span>
              <span>공유</span>
            </button>
          </div>
        </div>

        {selectedDate !== null && (
          <DayDetailPanel
            date={selectedDate}
            onClose={() => setSelectedDate(null)}
            excludeRef={interactionAreaRef}
          />
        )}
      </div>

      {showPreview && (
        <SharePreviewModal
          data={data}
          onClose={() => setShowPreview(false)}
        />
      )}
      <GrassHelpModal open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
