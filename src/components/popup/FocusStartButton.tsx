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
    <div className="border-b border-deep/10 bg-cream px-3 py-2">
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
            className="shrink-0 rounded-full bg-deep px-4 py-2 text-sm font-bold text-white shadow"
          >
            집중 시작
          </button>
        </div>
      </div>
    </div>
  );
}
