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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
    >
      <div
        className="w-72 rounded-xl bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-ink">변경 사항 폐기</h2>
        <p className="mt-2 text-sm text-ink">
          변경 사항을 저장하지 않고 나가시겠어요?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-deep px-4 py-2 text-sm text-white"
          >
            계속 편집
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-500 px-4 py-2 text-sm text-white"
          >
            폐기
          </button>
        </div>
      </div>
    </div>
  );
}
