import { useToastQueue } from "../../lib/toast";

/**
 * 팝업 하단의 토스트 컨테이너 (설계 §22).
 *
 * useToastQueue가 Rust → JS `toast` 이벤트를 구독하고 3초 자동 dismiss.
 * webview 활성 시에만 가시, OS 알림이 1차 전달 수단.
 */
export function ToastContainer() {
  const { toasts } = useToastQueue();
  return (
    <div className="pointer-events-none absolute bottom-16 left-1/2 z-40 flex -translate-x-1/2 flex-col gap-2">
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
