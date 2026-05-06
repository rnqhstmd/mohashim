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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
    >
      <div
        className="w-64 rounded-xl bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-center gap-2">
          <Potato state="stressed" size={72} animated={true} />
          <div className="mt-6">
            <SpeechBubble text={discardedPhrase} />
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-ink">
          정말 그만두시겠어요?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-peach px-4 py-2 text-sm text-white"
          >
            포기
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-deep px-4 py-2 text-sm text-white"
          >
            계속할래
          </button>
        </div>
      </div>
    </div>
  );
}
