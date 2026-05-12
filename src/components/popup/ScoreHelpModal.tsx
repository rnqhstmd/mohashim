import { createPortal } from "react-dom";

type ScoreHelpModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * 점수 산출 도움말 모달.
 *
 * 점수 = 작업 점수(0~80) + 소음 점수(0 또는 20). 합산 0~100.
 *
 * - 작업 점수: 키보드/마우스 입력 추적. 3분 grace 후 차감, EMA로 부드럽게 수렴.
 *   회복은 천천히(약 90초), 차감은 빠르게(약 30초) — 잃기 쉽고 회복은 어려운 정책.
 * - 소음 점수: 마이크 dB가 80 이하면 20점, 초과면 0점.
 * - 휴식 중에는 점수 변동 없음 (집중 종료 시점 값을 유지).
 */
export function ScoreHelpModal({ open, onClose }: ScoreHelpModalProps) {
  if (!open) return null;
  // 부모 컨테이너 transform이 fixed positioning context를 바꾸는 회귀 방지 — Portal로 body에 직접 렌더.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-help-title"
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
            id="score-help-title"
            className="text-[12px] font-extrabold text-ink"
          >
            점수는 이렇게 계산돼요
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
            <p className="font-bold text-ink">총점 = 작업 + 소음 (0~100)</p>
            <p className="mt-0.5">점수에 따라 감자 표정이 5단계로 변해요.</p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">⌨️ 작업 (0~80)</p>
            <p className="mt-0.5">입력 시 80점 · 3분 후 차감 · 6분 이상 0점</p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">🔊 소음 (0 / 20)</p>
            <p className="mt-0.5">80dB 이하 = 20점</p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">☕ 휴식 중</p>
            <p className="mt-0.5">집중 종료 점수 그대로 유지돼요.</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
