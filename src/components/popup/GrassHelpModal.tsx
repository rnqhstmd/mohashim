import { createPortal } from "react-dom";

type GrassHelpModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * 잔디 색 산출 정책 도움말 모달.
 *
 * Phase 22+ 통합 가중치 모델 (사용자 피드백):
 * - 집중 시간 / 완료한 할 일 / 평균 점수 보너스를 합산해 5단계 레벨로 매핑.
 * - 25분×6 vs 50분×3 형평성 문제 해결 (시간 총합 기반).
 * - 타이머만 / 할 일만 / 둘 다 사용 — 세 패턴 모두 공정 평가.
 */
export function GrassHelpModal({ open, onClose }: GrassHelpModalProps) {
  if (!open) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grass-help-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden rounded-[18px] px-3 py-4"
      style={{ backgroundColor: "rgba(40, 37, 32, 0.7)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-[260px] overflow-y-auto rounded-xl border-[1.5px] border-ink px-3 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        style={{ backgroundColor: "#fdf8ef" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2
            id="grass-help-title"
            className="text-[12px] font-extrabold text-ink"
          >
            잔디 색은 이렇게 정해져요
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink/55 hover:bg-ink/10 hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="mt-2 space-y-2 text-[10px] leading-relaxed text-ink/75">
          <div>
            <p className="font-bold text-ink">점수 = 시간 + 할 일 + 보너스</p>
            <p className="mt-0.5">세 항목을 합산해 잔디 색을 정해요.</p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">⏱ 집중 시간</p>
            <p className="mt-0.5"><b>30분 = 1점</b></p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">✅ 완료한 할 일</p>
            <p className="mt-0.5"><b>2개 = 1점</b></p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">🌟 평균 점수 보너스</p>
            <p className="mt-0.5">80점 이상 → <b>+0.25점</b></p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">🎨 레벨</p>
            <p className="mt-0.5">0 / &lt;1.5 / 1.5~2.5 / 2.5~3.5 / <b>3.5+ (최대)</b></p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
