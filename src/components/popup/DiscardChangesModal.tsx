type Props = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 변경 사항 폐기 확인 모달 (설계 §11, QE-2).
 *
 * TagListEditor 내부에 단일 인스턴스로 마운트되어 dirty 상태에서 뒤로가기 시
 * 1회만 표시된다. ResetConfirmModal 패턴 차용 — 키워드 입력 없이 두 버튼.
 */
export function DiscardChangesModal({ open, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45"
      onClick={onCancel}
    >
      <div
        className="w-72 rounded-2xl border-[1.5px] border-ink bg-paperWarm p-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-extrabold text-ink">변경 사항 폐기</h2>
        <p className="mt-2 text-xs leading-snug text-ink/65">
          변경 사항을 저장하지 않고 나가시겠어요?
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border-[1.5px] border-ink bg-paperWarm px-3 py-2 text-xs font-extrabold text-ink shadow-[1.5px_1.5px_0_0_#2b2520] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
          >
            계속 편집
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg border-[1.5px] border-ink bg-[#d8554b] px-3 py-2 text-xs font-extrabold text-paperWarm shadow-[1.5px_1.5px_0_0_#2b2520] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
          >
            폐기
          </button>
        </div>
      </div>
    </div>
  );
}
