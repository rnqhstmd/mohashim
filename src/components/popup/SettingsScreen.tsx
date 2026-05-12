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
  /**
   * Phase 27 FR-11: mailbox-deeplink 발생 신호.
   * MainScreen이 settings 오버레이 활성 시 본 prop을 true로 설정하여 confirm 다이얼로그를
   * 노출하도록 위임한다.
   */
  pendingDeeplink: boolean;
  /**
   * Phase 27 FR-11: pendingDeeplink 소비 콜백.
   * confirm 다이얼로그 확인/취소 시 false로 reset하여 부모 state를 동기화한다.
   */
  onPendingDeeplinkChange: (pending: boolean) => void;
  /**
   * Phase 27 FR-11: confirm 확인 시 부모가 setOverlayScreen("mailbox")로 전환하도록
   * 호출되는 콜백. 본 콜백이 settings → mailbox 오버레이 전환의 단일 경로.
   */
  onAcceptDeeplink: () => void;
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
export function SettingsScreen({
  onResetDone,
  onClose,
  pendingDeeplink,
  onPendingDeeplinkChange,
  onAcceptDeeplink,
}: SettingsScreenProps) {
  const [view, setView] = useState<View>("main");
  const [showReset, setShowReset] = useState(false);
  const [showDeeplinkConfirm, setShowDeeplinkConfirm] = useState(false);
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

  // Phase 27 FR-11: pendingDeeplink 변화 감지 → 더티 판정 (Q8: view !== "main").
  // - view === "main" (서브뷰 아님): 즉시 부모에게 deeplink 수락을 위임 + pending false reset.
  // - view !== "main" (서브뷰 진입 중): confirm 다이얼로그 노출. 사용자 결정에 따라
  //   확인 → onAcceptDeeplink 호출, 취소 → pending false reset만.
  useEffect(() => {
    if (!pendingDeeplink) {
      setShowDeeplinkConfirm(false);
      return;
    }
    if (view === "main") {
      // 메인 카드 리스트면 더티 없음 — 즉시 메일함 진입.
      onPendingDeeplinkChange(false);
      onAcceptDeeplink();
    } else {
      // 서브뷰(durations/work/loc)는 더티 — confirm 노출.
      setShowDeeplinkConfirm(true);
    }
  }, [pendingDeeplink, view, onAcceptDeeplink, onPendingDeeplinkChange]);

  const handleDeeplinkConfirm = () => {
    setShowDeeplinkConfirm(false);
    onPendingDeeplinkChange(false);
    onAcceptDeeplink();
  };

  const handleDeeplinkCancel = () => {
    setShowDeeplinkConfirm(false);
    onPendingDeeplinkChange(false);
  };

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
          label="집중·휴식 시간"
          sub={
            focusMin !== null && breakMin !== null
              ? `집중 시간과 휴식 시간 편집 · 현재 집중 ${focusMin}분 / 휴식 ${breakMin}분`
              : "집중 시간과 휴식 시간을 편집합니다"
          }
          onClick={() => setView("durations")}
        />

        {/* 태그 편집 페이지들 */}
        <Row
          icon="🏷"
          label="작업 태그"
          sub="할 일 등록 시 어떤 종류의 작업인지 분류해요"
          onClick={() => setView("work")}
        />
        <Row
          icon="📍"
          label="위치 태그"
          sub="할 일 등록 시 어디에서 작업할지 분류해요"
          onClick={() => setView("loc")}
        />

        {/* 알림 안내 — kind: "notification"로 OS 네이티브 알림 권한 설정 패널 진입.
            (이전 회귀: "microphone"으로 잘못 호출되어 마이크 권한 화면이 열림.) */}
        <Row
          icon="🔔"
          label="알림"
          sub="시스템 설정 → 알림에서 모하심 권한"
          onClick={() => {
            void invoke("open_permission_settings", {
              kind: "notification",
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

        {/* DEBUG (REMOVE-AFTER-TEST): 월간 리포트 발송 트리거 */}
        <Row
          icon="🧪"
          label="월간 리포트 테스트"
          sub="합성 데이터로 편지 1통 발송"
          onClick={() => {
            void invoke("trigger_monthly_letter_test")
              .then(() =>
                console.log("[mohashim] monthly letter test triggered")
              )
              .catch((err) =>
                console.error("[mohashim] trigger_monthly_letter_test failed", err)
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
      {/* Phase 27 FR-11 / AC-22: 서브뷰 진입 중 mailbox-deeplink 발생 시 confirm 다이얼로그.
          Q3 결정: "저장하지 않고 편지함으로 이동할까요?" 제목.
          Q8 결정: 더티 판정은 view !== "main" 자체 (실제 변경 사항 추적 미수행). */}
      {showDeeplinkConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deeplink-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45"
          onClick={handleDeeplinkCancel}
        >
          <div
            className="w-72 rounded-2xl border-[1.5px] border-ink bg-paperWarm p-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="deeplink-confirm-title"
              className="text-sm font-extrabold text-ink"
            >
              저장하지 않고 편지함으로 이동할까요?
            </h2>
            <p className="mt-2 text-xs leading-snug text-ink/65">
              현재 편집 화면을 닫고 편지함으로 이동합니다.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleDeeplinkCancel}
                className="flex-1 rounded-lg border-[1.5px] border-ink bg-paperWarm px-3 py-2 text-xs font-extrabold text-ink shadow-[1.5px_1.5px_0_0_#2b2520] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeeplinkConfirm}
                className="flex-1 rounded-lg border-[1.5px] border-ink bg-[#3e4d70] px-3 py-2 text-xs font-extrabold text-paperWarm shadow-[1.5px_1.5px_0_0_#2b2520] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
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
