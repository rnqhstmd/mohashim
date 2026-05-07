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
    // panel 내부 SVG 2개 (미리보기 + off-screen).
    expect(container.querySelectorAll("svg").length).toBe(2);
  });

  it("AC-3: 메시지 입력 시 미리보기 SVG에 즉시 반영", () => {
    const { container } = render(
      <SharePreviewModal data={sampleData} onClose={vi.fn()} />
    );
    const input = screen.getByPlaceholderText("자랑 한 마디 남겨줘!!") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "오늘도 불태웠다" } });
    // 두 SVG 인스턴스 모두 message text를 포함해야 함.
    const messageTexts = Array.from(container.querySelectorAll("svg text")).filter(
      (t) => t.textContent === "오늘도 불태웠다"
    );
    expect(messageTexts.length).toBe(2);
  });

  it("AC-4: maxLength=12, 13자 입력 시 12자로 절단", () => {
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText("자랑 한 마디 남겨줘!!") as HTMLInputElement;
    expect(input.maxLength).toBe(12);
    fireEvent.change(input, { target: { value: "1234567890123" } });
    expect(input.value.length).toBe(12);
    expect(input.value).toBe("123456789012");
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
    // 비동기 작업 진행 중 → disabled.
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
    expect(
      screen.getByText("복사됐어요! 카카오톡·SNS에 붙여넣기 해주세요 🌱")
    ).toBeInTheDocument();
  });

  it("AC-8: 5초 후 안내문 자동 숨김", async () => {
    vi.useFakeTimers();
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이미지 복사하기" }));
    });
    expect(
      screen.getByText("복사됐어요! 카카오톡·SNS에 붙여넣기 해주세요 🌱")
    ).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      screen.queryByText("복사됐어요! 카카오톡·SNS에 붙여넣기 해주세요 🌱")
    ).not.toBeInTheDocument();
  });

  it("AC-9: 재복사 시 5초 타이머 재시작", async () => {
    vi.useFakeTimers();
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "이미지 복사하기" });

    await act(async () => {
      fireEvent.click(button);
    });
    // 4초 경과 → 안내문 유지.
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(
      screen.getByText("복사됐어요! 카카오톡·SNS에 붙여넣기 해주세요 🌱")
    ).toBeInTheDocument();

    // 재복사 → 타이머 리셋.
    await act(async () => {
      fireEvent.click(button);
    });
    // 추가 4초 (총 8초이지만 재시작 후 4초) → 여전히 표시.
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(
      screen.getByText("복사됐어요! 카카오톡·SNS에 붙여넣기 해주세요 🌱")
    ).toBeInTheDocument();

    // 추가 1초 (재시작 후 5초) → 사라짐.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.queryByText("복사됐어요! 카카오톡·SNS에 붙여넣기 해주세요 🌱")
    ).not.toBeInTheDocument();
  });

  it("AC-10: 복사 실패 시 안내문 미표시 + busy 해제", async () => {
    composeMock.mockRejectedValueOnce(new Error("compose failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SharePreviewModal data={sampleData} onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "이미지 복사하기" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(
      screen.queryByText("복사됐어요! 카카오톡·SNS에 붙여넣기 해주세요 🌱")
    ).not.toBeInTheDocument();
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

    // panel 클릭은 stopPropagation으로 onClose 미호출.
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();

    // overlay 클릭 시 onClose 호출.
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
    // panel 내부에 SVG 2개(미리보기 + off-screen).
    const svgsInsidePanel = panel.querySelectorAll("svg");
    expect(svgsInsidePanel.length).toBe(2);
  });
});
