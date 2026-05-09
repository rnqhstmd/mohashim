import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  getBreakMinutes,
  getFocusMinutes,
  resetAllData,
} from "../../lib/storage";
import { DurationsEditScreen } from "./DurationsEditScreen";
import { ResetConfirmModal } from "./ResetConfirmModal";
import { LocationEditorScreen } from "./LocationEditorScreen";
import { WorkTagEditorScreen } from "./WorkTagEditorScreen";

type SettingsScreenProps = {
  onResetDone: () => void;
  /** Phase 26 FR-20: 좌상단 ← 버튼이 호출. 오버레이를 닫고 메인 화면 복귀. */
  onClose: () => void;
};

// Phase 21 사용자 피드백: 설정 화면을 카드 리스트로 단순화. 시간/태그 편집은 모두 별도
// 페이지로 이동, 인라인 편집 제거. 알림 / 로그 폴더 / 데이터 초기화 / 버전 footer 추가.
type View = "main" | "loc" | "work" | "durations";

const APP_VERSION = "0.1.0";

/**
 * Settings 화면 (Phase 21 재구조).
 *
 * 카드 리스트:
 *   1. ⏱ 시간 편집 — 집중/휴식 분 (DurationsEditScreen으로 이동)
 *   2. 🏷 작업 태그 — WorkTagEditorScreen으로 이동
 *   3. 📍 위치 태그 — LocationEditorScreen으로 이동
 *   4. 🔔 알림 — OS 알림 권한 (정보 + 시스템 설정 링크)
 *   5. 📁 로그 폴더 열기 — Finder/Explorer로 폴더 노출
 *
 * 하단:
 *   - "데이터 초기화" 버튼 (빨간 텍스트, 명시적 확인 모달)
 *   - 버전 / 개발자 copyright footer
 */
export function SettingsScreen({ onResetDone, onClose }: SettingsScreenProps) {
  const [view, setView] = useState<View>("main");
  const [showReset, setShowReset] = useState(false);
  const [focusMin, setFocusMin] = useState<number | null>(null);
  const [breakMin, setBreakMin] = useState<number | null>(null);

  // 메인 진입/복귀 시 표기 값 로드.
  useEffect(() => {
    if (view !== "main") return;
    let cancelled = false;
    (async () => {
      try {
        const [f, b] = await Promise.all([
          getFocusMinutes(),
          getBreakMinutes(),
        ]);
        if (cancelled) return;
        setFocusMin(f);
        setBreakMin(b);
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
    }
  };

  if (view === "loc") {
    return <LocationEditorScreen onClose={() => setView("main")} />;
  }
  if (view === "work") {
    return <WorkTagEditorScreen onClose={() => setView("main")} />;
  }
  if (view === "durations") {
    return <DurationsEditScreen onClose={() => setView("main")} />;
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Phase 26 FR-20: 좌상단 ← 버튼으로 메인 화면 복귀. sub-view는 setView("main")로 복귀. */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/60 transition-colors hover:bg-ink/8 hover:text-ink"
          aria-label="닫기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="flex-1 truncate text-[13px] font-semibold text-ink">
          설정
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 pt-1">
        {/* 시간 편집 — 집중/휴식 모두 한 화면에서 */}
        <Row
          icon="⏱"
          label="시간 편집"
          sub={
            focusMin !== null && breakMin !== null
              ? `집중 ${focusMin}분 · 휴식 ${breakMin}분`
              : "—"
          }
          onClick={() => setView("durations")}
        />

        {/* 태그 편집 페이지들 */}
        <Row
          icon="🏷"
          label="작업 태그"
          sub="이름 · 색상 · 이모지"
          onClick={() => setView("work")}
        />
        <Row
          icon="📍"
          label="위치 태그"
          sub="집 · 카페 · 회사 등"
          onClick={() => setView("loc")}
        />

        {/* 알림 안내 */}
        <Row
          icon="🔔"
          label="알림"
          sub="시스템 설정 → 알림에서 모하심 권한"
          onClick={() => {
            void invoke("open_permission_settings", {
              kind: "microphone",
            }).catch((err) =>
              console.error("[mohashim] open notification settings failed", err)
            );
          }}
        />

        {/* 로그 폴더 */}
        <Row
          icon="📁"
          label="로그 폴더 열기"
          sub="분석용 JSON Lines 기록"
          onClick={() => {
            void invoke("open_log_dir").catch((err) =>
              console.error("[mohashim] open_log_dir failed", err)
            );
          }}
        />
      </div>

      {/* 데이터 초기화 — 명시적으로 노출 */}
      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => setShowReset(true)}
          className="inline-flex w-full items-center justify-center rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10"
        >
          모든 데이터 초기화
        </button>
      </div>

      {/* 버전 + Copyright footer */}
      <footer className="mt-auto px-4 pb-3 pt-4 text-center text-[10px] font-semibold leading-relaxed text-ink/40">
        <div>모하심 · v{APP_VERSION}</div>
        <div>© 2026 rnqhstmd · 모든 데이터는 PC에만 저장</div>
      </footer>

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

type RowProps = {
  icon: string;
  label: string;
  sub?: string;
  onClick: () => void;
};

function Row({ icon, label, sub, onClick }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-ink/15 bg-paperWarm/80 px-3 py-2.5 text-left shadow-[1px_1px_0_0_rgba(40,37,32,0.06)] transition-colors hover:bg-paperWarm"
    >
      <span aria-hidden className="text-lg leading-none">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-extrabold text-ink">{label}</span>
        {sub && (
          <span className="mt-0.5 truncate text-[10px] font-semibold text-ink/55">
            {sub}
          </span>
        )}
      </div>
      <span aria-hidden className="text-sm font-bold text-ink/40">
        ›
      </span>
    </button>
  );
}
