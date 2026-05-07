import { Potato } from "../Potato";
import { SpeechBubble } from "../SpeechBubble";
import { pickPhrase } from "../../lib/phrases";

type DiscardModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// BR-6: discarded는 score-tick으로 emit되지 않으므로 usePhrase를 거치지 않는다.
// pickPhrase("discarded")를 모듈 로드 시 1회만 호출하여 같은 앱 실행 세션 내에서
// 동일 멘트로 고정한다 (Math.random 랜덤 1회 선택 후 모듈 수명 동안 보존).
// 향후 phrases.ts가 동적 로딩 대상이 되면 컴포넌트 내부 useMemo로 이동.
const discardedPhrase = pickPhrase("discarded");

/**
 * Discard 확인 모달 — 진행 중 세션 폐기 의사 확인.
 *
 * - "포기" 클릭: onConfirm → 호출자가 discardSession()을 await.
 * - "계속할래" 또는 backdrop 클릭: onCancel.
 * - 상단에 stressed Potato(72) + discarded 멘트 SpeechBubble (FR-33, BR-4).
 */
export function DiscardModal({ open, onConfirm, onCancel }: DiscardModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="세션 폐기 확인"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45"
      onClick={onCancel}
    >
      <div
        className="w-64 rounded-2xl border-[1.5px] border-ink bg-paperWarm p-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-center gap-2">
          <Potato state="stressed" size={72} animated={true} />
          <div className="mt-6">
            <SpeechBubble text={discardedPhrase} />
          </div>
        </div>
        <p className="mt-3 text-center text-[13px] font-extrabold text-ink">
          이번 세션 기록 못 해요
        </p>
        <p className="mt-1 text-center text-[10px] leading-snug text-ink/55">
          25분 끝까지 가야 잔디에 새겨져요. 지금 멈추면 가차없이 사라져요.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border-[1.5px] border-ink bg-paperWarm px-3 py-2 text-xs font-extrabold text-ink shadow-[1.5px_1.5px_0_0_#2b2520] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
          >
            계속할래
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg border-[1.5px] border-ink bg-[#d8554b] px-3 py-2 text-xs font-extrabold text-paperWarm shadow-[1.5px_1.5px_0_0_#2b2520] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
          >
            포기
          </button>
        </div>
      </div>
    </div>
  );
}
