import type { ToastMessage } from "../../lib/toast";

type ToastContainerProps = {
  toasts: ToastMessage[];
};

/**
 * 팝업 하단의 토스트 컨테이너 (설계 §22).
 *
 * `useToastQueue`는 MainScreen에서만 단일 호출하고, ToastContainer는 그 큐의
 * 스냅샷(toasts)만 prop으로 전달받아 렌더한다. 다중 호출 시 큐 인스턴스가
 * 분리되어 push/dismiss가 다른 인스턴스로 갈 수 있으므로 본 컴포넌트 내부에서는
 * 절대 useToastQueue를 호출하지 않는다.
 */
export function ToastContainer({ toasts }: ToastContainerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none absolute bottom-16 left-1/2 z-40 flex -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-md bg-deep/90 px-3 py-2 text-xs text-white shadow"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
