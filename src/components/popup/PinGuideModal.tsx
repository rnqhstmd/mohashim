type PinGuideModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Windows 작업 표시줄 고정 안내 모달.
 *
 * 트레이 우클릭 → "작업 표시줄에 고정 안내" 클릭 시 노출. OS는 보안상 앱이 자기 자신을
 * 작업 표시줄에 자동 pin할 수 없게 막아놓아, 사용자가 직접 pin할 수 있도록 단계별 안내만
 * 제공한다. 자동 시작 토글이 동등 효과(부팅 시 자동 실행)를 주지만, 사용자가 명시적으로
 * 작업 표시줄에서 빠르게 다시 켜고 싶은 경우의 보조 가이드.
 */
export function PinGuideModal({ open, onClose }: PinGuideModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="작업 표시줄에 고정 안내"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45"
      onClick={onClose}
    >
      <div
        className="w-72 rounded-2xl border-[1.5px] border-ink bg-paperWarm p-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-[14px] font-extrabold text-ink">
          📌 작업 표시줄에 고정하기
        </p>
        <p className="mt-1.5 text-center text-[10px] leading-snug text-ink/55">
          종료한 뒤에도 한 번에 다시 켜고 싶다면 시작 메뉴에서 직접 고정해주세요.
        </p>

        <ol className="mt-3 space-y-2 text-[11px] leading-snug text-ink">
          <li className="flex gap-2">
            <span className="font-extrabold text-peach">1.</span>
            <span>
              Windows 시작 메뉴(<kbd className="rounded border border-ink/30 bg-mist px-1 text-[9px] font-bold">⊞</kbd>)
              열기 → 검색창에 <strong>모하심</strong> 입력
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-extrabold text-peach">2.</span>
            <span>검색 결과의 <strong>Mohashim</strong> 위에서 우클릭</span>
          </li>
          <li className="flex gap-2">
            <span className="font-extrabold text-peach">3.</span>
            <span>
              <strong>"작업 표시줄에 고정"</strong> 선택
            </span>
          </li>
        </ol>

        <p className="mt-3 rounded-lg border border-ink/15 bg-mist px-3 py-2 text-[10px] leading-snug text-ink/65">
          💡 <strong>자동 시작</strong>도 켜두면 PC를 켤 때마다 모하가 알아서 트레이에 떠요.
          (트레이 우클릭 → 자동 시작)
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border-[1.5px] border-ink bg-ink px-3 py-2 text-xs font-extrabold text-paperWarm shadow-[1.5px_1.5px_0_0_#2b2520] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
        >
          확인했어요
        </button>
      </div>
    </div>
  );
}
