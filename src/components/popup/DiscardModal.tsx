type DiscardModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Discard 확인 모달 — 진행 중 세션 폐기 의사 확인.
 *
 * - "포기" 클릭: onConfirm → 호출자가 discardSession()을 await.
 * - "계속할래" 또는 backdrop 클릭: onCancel.
 * - 캐릭터 영역은 후속 character Phase에서 채워진다 (placeholder).
 */
export function DiscardModal({ open, onConfirm, onCancel }: DiscardModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
    >
      <div
        className="w-64 rounded-xl bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-20 w-full rounded-md bg-mist" />
        <p className="mt-3 text-center text-sm text-ink">
          정말 그만두시겠어요?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-peach px-4 py-2 text-sm text-white"
          >
            포기
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-deep px-4 py-2 text-sm text-white"
          >
            계속할래
          </button>
        </div>
      </div>
    </div>
  );
}
