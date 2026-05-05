import { Potato } from "../Potato";
import { SpeechBubble } from "../SpeechBubble";
import type { PotatoState } from "../../lib/phrases";

type IdleScreenProps = {
  onStart: () => Promise<void>;
  potatoState: PotatoState;
  phrase: string;
};

/**
 * Idle 상태 메인 콘텐츠 — Potato 캐릭터 + SpeechBubble + "집중 시작" 버튼.
 *
 * onStart는 보통 `focusStart()`를 호출하며, Rust 단일 writer가
 * atomic phase=Focus + active_phase 스토어를 갱신한다.
 *
 * 레이아웃 (FR-31):
 *   1. Potato(120, animated) + SpeechBubble 좌하단 (relative 컨테이너 + absolute)
 *   2. 안내 문구
 *   3. "집중 시작" 버튼
 */
export function IdleScreen({ onStart, potatoState, phrase }: IdleScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="relative">
        <Potato state={potatoState} size={120} animated={true} />
        <div className="absolute -bottom-2 -left-16">
          <SpeechBubble text={phrase} />
        </div>
      </div>
      <p className="text-sm text-deep/70">집중을 시작할 준비가 되셨나요?</p>
      <button
        type="button"
        onClick={() => {
          void onStart();
        }}
        className="rounded-full bg-deep px-6 py-3 text-sm font-bold text-white shadow"
      >
        집중 시작
      </button>
    </div>
  );
}
