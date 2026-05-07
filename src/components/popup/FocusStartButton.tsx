import { Potato } from "../Potato";
import { SpeechBubble } from "../SpeechBubble";
import type { PotatoState } from "../../lib/phrases";

type FocusStartButtonProps = {
  potatoState: PotatoState;
  phrase: string;
  onStart: () => Promise<void>;
};

/**
 * Todos 탭 상단 압축 CTA — idle phase에서 노출.
 *
 * Potato(80) + SpeechBubble + "집중 시작" 버튼을 가로 압축하여 노출 (옵션 A 통합, M1).
 * 카드 영역 ~80px 높이.
 */
export function FocusStartButton({
  potatoState,
  phrase,
  onStart,
}: FocusStartButtonProps) {
  return (
    <div className="border-b border-ink/10 bg-paperWarm/70 px-3 py-2 backdrop-blur-[1px]">
      <div className="flex items-center gap-3">
        <Potato state={potatoState} size={80} animated={true} />
        <div className="flex flex-1 items-center gap-2">
          <div className="flex-1">
            <SpeechBubble text={phrase} />
          </div>
          <button
            type="button"
            onClick={() => {
              void onStart();
            }}
            className="shrink-0 rounded-full border-[1.5px] border-ink bg-ink px-4 py-2 text-sm font-extrabold text-paperWarm shadow-[1.5px_1.5px_0_0_rgba(40,30,20,0.18)] transition-transform hover:-translate-y-px hover:shadow-[2px_3px_0_0_rgba(40,30,20,0.22)] active:translate-y-0 active:shadow-[1px_1px_0_0_rgba(40,30,20,0.18)]"
          >
            집중 시작
          </button>
        </div>
      </div>
    </div>
  );
}
