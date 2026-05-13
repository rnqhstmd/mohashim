import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";

type WhatsNewModalProps = {
  open: boolean;
  version: string;
  body: string | null;
  onConfirm: () => void;
};

/**
 * 업데이트된 새 버전으로 첫 실행 시 1회 표시되는 "What's new" 모달.
 *
 * - `version`: 현재 앱 버전 (예: "1.0.5")
 * - `body`: GitHub release body (마크다운). null이면 본문 자리에 안내 문구 표시.
 * - `onConfirm`: 확인 버튼 클릭 시 호출 → 부모가 last_seen_version 갱신 + 모달 닫기.
 */
export function WhatsNewModal({ open, version, body, onConfirm }: WhatsNewModalProps) {
  // ESC 키로 확인과 동일하게 동작.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="presentation"
    >
      <div
        className="relative flex max-h-[calc(100vh-16px)] w-[290px] flex-col overflow-hidden rounded-xl bg-cream p-4 shadow-lg animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-base">✨</span>
          <h3 id="whats-new-title" className="text-sm font-extrabold text-ink">
            v{version}로 업데이트 됐어요
          </h3>
        </div>
        <p className="mb-2 text-[11px] text-ink/60">
          이번 버전에서 달라진 점이에요
        </p>

        <div className="mb-3 flex-1 overflow-y-auto rounded-lg border border-ink/10 bg-paperWarm/60 p-3">
          {body ? (
            <div className="text-[11px] leading-relaxed text-ink/80">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }: { children?: React.ReactNode }) => (
                    <h3 className="mt-2 mb-1 text-[13px] font-extrabold text-ink first:mt-0">
                      {children}
                    </h3>
                  ),
                  h2: ({ children }: { children?: React.ReactNode }) => (
                    <h4 className="mt-2 mb-1 text-[12px] font-extrabold text-ink first:mt-0">
                      {children}
                    </h4>
                  ),
                  h3: ({ children }: { children?: React.ReactNode }) => (
                    <h5 className="mt-2 mb-0.5 text-[11px] font-bold text-ink first:mt-0">
                      {children}
                    </h5>
                  ),
                  p: ({ children }: { children?: React.ReactNode }) => (
                    <p className="mt-1 first:mt-0">{children}</p>
                  ),
                  ul: ({ children }: { children?: React.ReactNode }) => (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">{children}</ul>
                  ),
                  ol: ({ children }: { children?: React.ReactNode }) => (
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4">{children}</ol>
                  ),
                  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
                  strong: ({ children }: { children?: React.ReactNode }) => (
                    <strong className="font-bold text-ink">{children}</strong>
                  ),
                  em: ({ children }: { children?: React.ReactNode }) => (
                    <em className="italic">{children}</em>
                  ),
                  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        if (href) {
                          void openUrl(href).catch((err: unknown) =>
                            console.error("[mohashim] open url failed", err)
                          );
                        }
                      }}
                      className="text-[#3e4d70] underline underline-offset-2"
                    >
                      {children}
                    </a>
                  ),
                  code: ({ children }: { children?: React.ReactNode }) => (
                    <code className="rounded bg-ink/10 px-1 font-mono text-[10px]">
                      {children}
                    </code>
                  ),
                  hr: () => <hr className="my-2 border-ink/10" />,
                }}
              >
                {body}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-[11px] text-ink/55">
              릴리즈 노트를 불러올 수 없어요. 자세한 내용은 GitHub Releases를 참고해주세요.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-md bg-deep px-3 py-2 text-xs font-semibold text-white hover:bg-deep/90"
          autoFocus
        >
          확인
        </button>
      </div>
    </div>
  );
}
