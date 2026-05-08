type PinGuideModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Windows 트레이 사용 팁 모달.
 *
 * 트레이 우클릭 → "Windows 사용 팁" 클릭 시 노출. OS는 보안상 앱이 자기 자신을
 * 작업 표시줄에 자동 pin할 수 없게 막아놓아, 시작 메뉴 → 우클릭 → "작업 표시줄에
 * 고정" 경로도 일관되게 동작하지 않는다 (Windows 11 변경). 사용자가 실제로 취할
 * 수 있는 액션 두 가지만 안내한다:
 *   1. 트레이 오버플로우(`>` 버튼)에서 모하 아이콘을 노출 영역으로 드래그.
 *   2. 자동 시작 토글로 PC 부팅 시 자동 실행 (트레이에 자동 노출).
 * 앱 종료 시 트레이 아이콘도 함께 사라지는 점은 OS 정책이라 명시적으로 안내한다.
 */
export function PinGuideModal({ open, onClose }: PinGuideModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Windows 사용 팁"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45"
      onClick={onClose}
    >
      <div
        className="w-72 rounded-2xl border-[1.5px] border-ink bg-paperWarm p-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-[14px] font-extrabold text-ink">
          💡 Windows 트레이 사용 팁
        </p>
        <p className="mt-1.5 text-center text-[10px] leading-snug text-ink/55">
          모하는 작업 표시줄 우측의 트레이 아이콘으로 동작해요.
        </p>

        <div className="mt-3 space-y-2 text-[11px] leading-snug text-ink">
          <div className="rounded-lg border border-ink/15 bg-mist px-3 py-2">
            <p className="font-extrabold text-peach">📌 항상 보이게 하기</p>
            <p className="mt-1 text-ink/75">
              트레이 영역의{" "}
              <kbd className="rounded border border-ink/30 bg-paperBg px-1 text-[9px] font-bold">
                ⌃
              </kbd>{" "}
              버튼을 눌러 숨겨진 아이콘 창을 열고, 모하를 트레이 영역으로
              끌어 놓으면 항상 노출돼요.
            </p>
          </div>

          <div className="rounded-lg border border-ink/15 bg-mist px-3 py-2">
            <p className="font-extrabold text-peach">⚡ 부팅 시 자동 실행</p>
            <p className="mt-1 text-ink/75">
              트레이 우클릭 → <strong>자동 시작</strong>을 켜두면 PC 켤
              때마다 모하가 알아서 트레이에 떠요.
            </p>
          </div>
        </div>

        <p className="mt-3 rounded-lg border border-ink/15 bg-paperBg px-3 py-2 text-[10px] leading-snug text-ink/55">
          ℹ️ 종료를 누르면 트레이 아이콘도 함께 사라져요. Windows에선 앱 종료 후
          트레이 아이콘만 남길 수 없어요.
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
