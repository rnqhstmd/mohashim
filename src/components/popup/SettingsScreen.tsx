import { useEffect, useState } from "react";
import {
  getBreakMinutes,
  getFocusMinutes,
  getWorkTags,
  resetAllData,
} from "../../lib/storage";
import type { WorkTag } from "../../lib/storage";
import { DurationsEditScreen } from "./DurationsEditScreen";
import { ResetConfirmModal } from "./ResetConfirmModal";
import { WorkTagEditorScreen } from "./WorkTagEditorScreen";
import { LocationEditorScreen } from "./LocationEditorScreen";

type SettingsScreenProps = {
  onResetDone: () => void;
};

type View = "main" | "work" | "loc" | "durations";

/**
 * Settings 탭 메인 (Phase 17 B2-E, FR-E1/E2/E8).
 *
 * 단일 패널 sub-screen 라우팅:
 *   - main:      집중/휴식 카드 + 작업 태그 카드 목록 + 위치 태그 편집 + 초기화
 *   - durations: DurationsEditScreen (집중/휴식 분 편집)
 *   - work:      WorkTagEditorScreen (작업 태그 편집)
 *   - loc:       LocationEditorScreen (위치 태그 편집)
 *
 * 메인 마운트 시 / sub-screen에서 복귀 시 focus_minutes / break_minutes / work_tags를
 * 다시 읽어 카드 표기를 갱신한다.
 */
export function SettingsScreen({ onResetDone }: SettingsScreenProps) {
  const [view, setView] = useState<View>("main");
  const [showReset, setShowReset] = useState(false);
  const [focusMin, setFocusMin] = useState<number | null>(null);
  const [breakMin, setBreakMin] = useState<number | null>(null);
  const [workTags, setWorkTagsState] = useState<WorkTag[]>([]);

  // 메인 진입/복귀 시 표기 값 로드.
  useEffect(() => {
    if (view !== "main") return;
    let cancelled = false;
    (async () => {
      try {
        const [f, b, w] = await Promise.all([
          getFocusMinutes(),
          getBreakMinutes(),
          getWorkTags(),
        ]);
        if (cancelled) return;
        setFocusMin(f);
        setBreakMin(b);
        setWorkTagsState(w);
      } catch (err) {
        console.error("[mohashim] settings main load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view]);

  const handleConfirm = async () => {
    setShowReset(false);
    try {
      await resetAllData();
      onResetDone();
    } catch (err) {
      console.error("[mohashim] reset failed", err);
      // 실패 시 onResetDone 미호출 — 스토어 미초기화 상태로 onboarding 진입 방지.
    }
  };

  if (view === "work") {
    return <WorkTagEditorScreen onClose={() => setView("main")} />;
  }
  if (view === "loc") {
    return <LocationEditorScreen onClose={() => setView("main")} />;
  }
  if (view === "durations") {
    return <DurationsEditScreen onClose={() => setView("main")} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 p-4">
        <button
          type="button"
          onClick={() => setView("durations")}
          className="flex w-full items-center justify-between rounded-xl border border-deep/10 bg-white px-4 py-3 hover:bg-deep/5"
        >
          <span className="text-sm text-ink">
            ⏱ 집중 {focusMin ?? "—"} 분
          </span>
          <span className="text-sm text-deep/40">›</span>
        </button>
        <button
          type="button"
          onClick={() => setView("durations")}
          className="flex w-full items-center justify-between rounded-xl border border-deep/10 bg-white px-4 py-3 hover:bg-deep/5"
        >
          <span className="text-sm text-ink">
            ☕ 휴식 {breakMin ?? "—"} 분
          </span>
          <span className="text-sm text-deep/40">›</span>
        </button>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-2">
        <h3 className="text-xs font-semibold text-deep/70">작업 태그</h3>
        {workTags.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center gap-2 rounded-xl border border-deep/10 bg-white px-3 py-2"
          >
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-base"
              style={{ background: tag.color }}
            >
              {tag.emoji}
            </span>
            <span className="flex-1 text-sm text-ink">{tag.label}</span>
            <button
              type="button"
              onClick={() => setView("work")}
              className="px-2 text-xs text-deep/60"
              aria-label="작업 태그 편집"
            >
              ✎
            </button>
            <button
              type="button"
              onClick={() => setView("work")}
              className="px-2 text-xs text-deep/30"
              aria-label="작업 태그 편집으로 이동"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setView("work")}
          disabled={workTags.length >= 5}
          className="w-full rounded-xl border border-dashed border-deep/30 py-2 text-sm text-deep/60 disabled:opacity-40"
        >
          ＋ 새 작업 태그 추가
        </button>

        <button
          type="button"
          onClick={() => setView("loc")}
          className="mt-2 rounded-md border border-deep/15 bg-white px-3 py-2 text-left text-sm text-ink"
        >
          위치 태그 편집
        </button>
      </div>

      <div className="mt-auto p-4">
        <button
          type="button"
          onClick={() => setShowReset(true)}
          className="text-sm text-red-600 underline"
        >
          모든 데이터 초기화
        </button>
      </div>

      <ResetConfirmModal
        open={showReset}
        onConfirm={() => {
          void handleConfirm();
        }}
        onCancel={() => setShowReset(false)}
      />
    </div>
  );
}
