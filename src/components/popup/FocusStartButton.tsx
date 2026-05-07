import { Potato } from "../Potato";
import { SpeechBubble } from "../SpeechBubble";
import type { PotatoState } from "../../lib/phrases";

type FocusStartButtonProps = {
  potatoState: PotatoState;
  phrase: string;
  onStart: () => Promise<void>;
};

/**
 * Todos 탭 상단 — idle phase에서 노출.
 *
 * Phase 21 사용자 피드백 반영:
 *   - 캐릭터 + 말풍선은 한 줄, "집중 시작" 버튼은 별도 줄(full-width)로 배치.
 *   - 집중 시작 버튼이 우측 끝에 작게 매달려 있어 가독성 떨어지는 문제 해소.
 */
export function FocusStartButton({
  potatoState,
  phrase,
  onStart,
}: FocusStartButtonProps) {
  return (
    <div className="border-b border-ink/10 bg-paperWarm/70 px-3 py-3 backdrop-blur-[1px]">
      {/* 1행: Potato + 말풍선 */}
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <Potato state={potatoState} size={64} animated={true} />
        </div>
        <div className="min-w-0 flex-1">
          <SpeechBubble text={phrase} />
        </div>
      </div>
      {/* 2행: 집중 시작 버튼 (full-width) */}
      <button
        type="button"
        onClick={() => {
          void onStart();
        }}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink bg-ink py-2.5 text-sm font-extrabold tracking-tight text-paperWarm shadow-[1.5px_1.5px_0_0_rgba(40,30,20,0.18)] transition-transform hover:-translate-y-px hover:shadow-[2px_3px_0_0_rgba(40,30,20,0.22)] active:translate-y-0 active:shadow-[1px_1px_0_0_rgba(40,30,20,0.18)]"
      >
        <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-paperWarm/15">
          ▶
        </span>
        <span>집중 시작</span>
        <span aria-hidden className="border-l border-paperWarm/30 pl-2 text-xs font-bold text-paperWarm/70">
          25분
        </span>
      </button>
    </div>
  );
}
