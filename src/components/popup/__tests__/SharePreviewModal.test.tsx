import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonthData } from "../../../lib/grass";

vi.mock("../../../lib/grass", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/grass")>();
  return {
    ...original,
    composeShareCard: vi.fn(async () => new Blob()),
    copyShareCardToClipboard: vi.fn(async () => undefined),
  };
});

import { SharePreviewModal } from "../SharePreviewModal";
import {
  composeShareCard,
  copyShareCardToClipboard,
} from "../../../lib/grass";

const composeMock = vi.mocked(composeShareCard);
const copyMock = vi.mocked(copyShareCardToClipboard);

const sampleData: MonthData = {
  monthOffset: 0,
  year: 2026,
  month: 5,
  cells: [
    { date: "2026-05-01", sessions: 3, avg: 70, todos: 2, level: 3, isFuture: false },
  ],
  totalSessions: 3,
  avgScore: 70,
};

const SUCCESS_TEXT = "복사됐어요! 카카오톡·SNS에 붙여넣기 해주세요 🌱";
const FAIL_TEXT = "복사에 실패했어요. 잠시 후 다시 시도해 주세요 😢";

beforeEach(() => {
  composeMock.mockClear();
  copyMock.mockClear();
  composeMock.mockResolvedValue(new Blob());
  copyMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SharePreviewModal", () => {
  it("AC-2: 입력창 + 복사 버튼 + 닫기 버튼 + 미리보기 SVG 존재", () => {
    const { container } = render(
      <SharePreviewModal data={sampleData} onClose={vi.fn()} />
    );
    expect(screen.getByPlaceholderText("자랑 한 마디 남겨줘!!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이미지 복사하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();
    expect(container.querySelectorAll("svg").length).toBe(2);
  });

  it("AC-3: 메시지 입력 시 미리보기 SVG에 즉시 반영", () => {
    const { container } = render(
      <SharePreviewModal data={sampleData} onClose={vi.fn()} />
    );
    const input = screen.getByPlaceholderText("자랑 한 마디 남겨줘!!") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "오늘도 불태웠다" } });
    const messageTexts = Array.from(container.querySelectorAll("svg text")).filter(
      (t) => t.textContent === "오늘도 불태웠다"
    );
    expect(messageTexts.length).toBe(2);
  });

  it("AC-4: input maxLength=12 (브라우저/사용자 입력 차단)", () => {
    // PR #17 gemini G3: surrogate pair 손상 방지 위해 onChange의 수동 slice 제거.
    // 13자 차단은 maxLength=12 속성으로 브라우저가 처리.
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText("자랑 한 마디 남겨줘!!") as HTMLInputElement;
    expect(input.maxLength).toBe(12);
  });

  it("AC-5: 빈 메시지로도 복사 가능", async () => {
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이미지 복사하기" }));
    });
    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(copyMock).toHaveBeenCalledTimes(1);
  });

  it("AC-6: busy 동안 disabled 후 완료 시 재활성화", async () => {
    let resolveCompose: ((b: Blob) => void) | null = null;
    composeMock.mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          resolveCompose = resolve;
        })
    );
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "이미지 복사하기" });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(button).toBeDisabled();
    await act(async () => {
      resolveCompose?.(new Blob());
    });
    expect(button).not.toBeDisabled();
  });

  it("AC-7: 복사 완료 시 안내문 표시", async () => {
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이미지 복사하기" }));
    });
    expect(screen.getByText(SUCCESS_TEXT)).toBeInTheDocument();
  });

  it("AC-8: 5초 후 안내문 자동 숨김", async () => {
    vi.useFakeTimers();
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이미지 복사하기" }));
    });
    expect(screen.getByText(SUCCESS_TEXT)).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(SUCCESS_TEXT)).not.toBeInTheDocument();
  });

  it("AC-9: 재복사 시 5초 타이머 재시작", async () => {
    vi.useFakeTimers();
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "이미지 복사하기" });

    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText(SUCCESS_TEXT)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText(SUCCESS_TEXT)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(SUCCESS_TEXT)).not.toBeInTheDocument();
  });

  it("AC-10 (D2 개정): 복사 실패 시 실패 안내문 표시 + busy 해제 + 성공 안내문 미표시", async () => {
    // PR #17 gemini G2 + D2 개정: 실패 시 모달 내 안내문 표시.
    composeMock.mockRejectedValueOnce(new Error("compose failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "이미지 복사하기" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.queryByText(SUCCESS_TEXT)).not.toBeInTheDocument();
    expect(screen.getByText(FAIL_TEXT)).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    errorSpy.mockRestore();
  });

  it("성공 후 실패 시 성공 안내문 즉시 정리 + 실패 안내문 표시 (Copilot C2 + cross-review)", async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "이미지 복사하기" });

    // 1차: 성공.
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByText(SUCCESS_TEXT)).toBeInTheDocument();

    // 2차: 실패. 성공 안내문은 사라지고 실패 안내문 표시.
    composeMock.mockRejectedValueOnce(new Error("compose failed"));
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.queryByText(SUCCESS_TEXT)).not.toBeInTheDocument();
    expect(screen.getByText(FAIL_TEXT)).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("실패 안내문 5초 자동 숨김", async () => {
    vi.useFakeTimers();
    composeMock.mockRejectedValueOnce(new Error("compose failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이미지 복사하기" }));
    });
    expect(screen.getByText(FAIL_TEXT)).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(FAIL_TEXT)).not.toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("G1: 1초 SLA — composeShareCard가 1초 이상 걸리면 실패 처리", async () => {
    vi.useFakeTimers();
    // 영원히 resolve되지 않는 promise — 1초 timeout이 trigger돼야 함.
    composeMock.mockImplementationOnce(() => new Promise<Blob>(() => {}));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "이미지 복사하기" });
    fireEvent.click(button);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // timeout 후 실패 안내문이 떠야 한다 + busy 해제.
    expect(screen.getByText(FAIL_TEXT)).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    errorSpy.mockRestore();
  });

  it("AC-11: X 버튼 클릭 시 onClose 호출", () => {
    const onClose = vi.fn();
    render(<SharePreviewModal data={sampleData} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("AC-11: 오버레이 클릭 시 onClose 호출, panel 클릭은 미호출", () => {
    const onClose = vi.fn();
    const { container } = render(
      <SharePreviewModal data={sampleData} onClose={onClose} />
    );
    const overlay = container.firstChild as HTMLElement;
    const panel = screen.getByRole("dialog");

    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("AC-11: ESC 키 입력 시 onClose 호출 (FR-8a)", () => {
    const onClose = vi.fn();
    render(<SharePreviewModal data={sampleData} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("autofocus: mount 직후 입력창에 focus", () => {
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText("자랑 한 마디 남겨줘!!");
    expect(document.activeElement).toBe(input);
  });

  it("MA-1: off-screen ShareCard가 panel 내부 자식으로 마운트", () => {
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const panel = screen.getByRole("dialog");
    expect(panel.querySelectorAll("svg").length).toBe(2);
  });

  it("a11y(Copilot C3): dialog에 aria-modal=true + aria-labelledby 연결", () => {
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const panel = screen.getByRole("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    const labelledBy = panel.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const titleEl = document.getElementById(labelledBy as string);
    expect(titleEl?.textContent).toBe("잔디 자랑하기");
  });
});
