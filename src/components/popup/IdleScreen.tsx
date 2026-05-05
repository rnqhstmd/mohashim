type IdleScreenProps = {
  onStart: () => Promise<void>;
};

/**
 * Idle 상태 메인 콘텐츠 — "집중 시작" 버튼 + 보조 안내.
 *
 * onStart는 보통 `focusStart()`를 호출하며, Rust 단일 writer가
 * atomic phase=Focus + active_phase 스토어를 갱신한다.
 */
export function IdleScreen({ onStart }: IdleScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
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
