import { Potato } from "../Potato";
import { pickPhrase } from "../../lib/phrases";

type DiscardModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// BR-6: discarded는 score-tick으로 emit되지 않으므로 usePhrase를 거치지 않는다.
// pickPhrase("discarded")를 모듈 로드 시 1회만 호출하여 같은 앱 실행 세션 내에서
// 동일 멘트로 고정한다.
const discardedPhrase = pickPhrase("discarded");

/**
 * Discard 확인 모달 — 진행 중 세션 폐기 의사 확인.
 *
 * - 캐릭터(72) + 말풍선 수직 중앙 정렬, 말풍선 꼬리가 캐릭터 중심을 향하도록 top-1/2 배치.
 * - 안내 텍스트는 명시적 <br /> 줄바꿈으로 가독성 확보.
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
        {/* 캐릭터 + 말풍선 — 수직 중앙 정렬, 꼬리는 말풍선 좌측 중앙(=캐릭터 중심)을 향함 */}
        <div className="flex items-center justify-center gap-2">
          <Potato state="stressed" size={72} animated={true} />
          <div
            className="relative inline-block max-w-[150px] rounded-[14px] border-[1.5px] border-ink bg-[#fdf8ef] px-3 py-2 shadow-[2px_2px_0_0_#2b2520]"
          >
            <span className="block break-words text-[13px] font-semibold leading-snug text-ink">
              {discardedPhrase}
            </span>
            {/* 꼬리 — 말풍선 좌측 수직 중앙에 배치(캐릭터 중심을 가리킴) */}
            <span
              aria-hidden="true"
              className="absolute -left-[6px] top-1/2 -translate-y-1/2 h-3 w-3 rotate-45 border-[1.5px] border-b-ink border-l-ink border-r-transparent border-t-transparent bg-[#fdf8ef]"
            />
          </div>
        </div>

        <p className="mt-3 text-center text-[14px] font-extrabold text-ink">
          이번 세션 기록 못 해요
        </p>
        <p className="mt-1.5 text-center text-[11px] leading-[1.5] text-ink/65">
          25분 끝까지 가야 잔디에 새겨져요.
          <br />
          지금 멈추면 가차없이 사라져요.
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
