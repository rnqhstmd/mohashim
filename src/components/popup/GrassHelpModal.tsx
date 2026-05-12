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
      className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4"
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
            <p className="mt-0.5">
              집중 시간 / 완료한 할 일 / 집중도 점수 세 가지를 합산해서 잔디 색을 결정해요.
            </p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">⏱ 집중 시간</p>
            <p className="mt-0.5"><b>30분 = 1점</b> (총 합산)</p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">✅ 완료한 할 일</p>
            <p className="mt-0.5"><b>2개 = 1점</b></p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">🌟 평균 점수 보너스</p>
            <p className="mt-0.5">평균이 <b>80점 이상</b>이면 <b>+0.25점</b></p>
          </div>

          <div className="rounded-md bg-ink/5 px-2 py-1.5">
            <p className="font-bold text-ink">🎨 레벨 매핑</p>
            <ul className="mt-0.5 list-disc pl-3.5 space-y-0.5">
              <li>활동 없음 → 회색</li>
              <li>1.5점 미만 → 연한 녹색</li>
              <li>1.5~2.5점 → 중간 녹색</li>
              <li>2.5~3.5점 → 진한 녹색</li>
              <li><b>3.5점 이상 → 가장 진한 색</b></li>
            </ul>
          </div>

          <div>
            <p className="font-bold text-ink">예시</p>
            <ul className="mt-0.5 list-disc pl-3.5 space-y-0.5">
              <li>집중 <b>2시간</b>만 → 만점</li>
              <li>할 일 <b>8개</b>만 → 만점</li>
              <li>1시간 + 할 일 3개 + 평균 85점 → 만점</li>
            </ul>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
