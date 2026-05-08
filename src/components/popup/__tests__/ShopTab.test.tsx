import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// invoke + listen 모킹.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const listenMock = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

// store 모킹 (storage.ts의 Store.load 폴백 — getInventory/getEconomy가 storage 키 직접 접근).
const inMemory = new Map<string, unknown>();
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(async () => ({
      get: vi.fn(async (k: string) =>
        inMemory.has(k) ? inMemory.get(k) : null
      ),
      set: vi.fn(async (k: string, v: unknown) => {
        inMemory.set(k, v);
      }),
      has: vi.fn(async (k: string) => inMemory.has(k)),
      save: vi.fn(async () => {}),
    })),
  },
}));

beforeEach(() => {
  inMemory.clear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  listenMock.mockReset();
  listenMock.mockResolvedValue(() => {}); // unlisten no-op
  vi.resetModules();
});

describe("ShopTab", () => {
  it("AC-19: 마운트 시 face 영역 카드 3종 표시", async () => {
    inMemory.set("economy", { sprouts: 100, lastTodoSproutDate: null });
    inMemory.set("inventory", {
      owned: [],
      equipped: { face: null, head: null, back: null },
    });
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_mailbox") return [];
      return undefined;
    });

    const { ShopTab } = await import("../ShopTab");
    render(<ShopTab />);

    // face 슬롯 3개 카드 (동글 안경/불타는 눈빛/멋쟁이 선글라스).
    await waitFor(() => {
      expect(screen.getByText("동글 안경")).toBeInTheDocument();
      expect(screen.getByText("불타는 눈빛")).toBeInTheDocument();
      expect(screen.getByText("멋쟁이 선글라스")).toBeInTheDocument();
    });
  });

  it("AC-13/14: 잔액 부족 카드는 회색 비활성 + 부족분 툴팁 표시", async () => {
    inMemory.set("economy", { sprouts: 50, lastTodoSproutDate: null });
    inMemory.set("inventory", {
      owned: [],
      equipped: { face: null, head: null, back: null },
    });

    const { ShopTab } = await import("../ShopTab");
    const { container } = render(<ShopTab />);

    // 60🌱 멋쟁이 선글라스: 잔액 50 → 부족 10🌱.
    await waitFor(() => {
      expect(screen.getByText("멋쟁이 선글라스")).toBeInTheDocument();
    });

    // 카드 컨테이너에서 title 속성 확인 (부족분 툴팁).
    const cards = container.querySelectorAll('[title]');
    const insufficientCard = Array.from(cards).find((el) =>
      el.getAttribute("title")?.includes("10")
    );
    expect(insufficientCard).toBeTruthy();
    expect(insufficientCard?.getAttribute("title")).toBe("10🌱 더 모아주세요");
    expect(insufficientCard?.getAttribute("aria-disabled")).toBe("true");
  });

  it("AC-16: 구매 확인 모달에 환불 불가 + 가격 표시", async () => {
    inMemory.set("economy", { sprouts: 100, lastTodoSproutDate: null });
    inMemory.set("inventory", {
      owned: [],
      equipped: { face: null, head: null, back: null },
    });

    const { ShopTab } = await import("../ShopTab");
    render(<ShopTab />);

    await waitFor(() => {
      expect(screen.getByText("동글 안경")).toBeInTheDocument();
    });

    // "구매" 버튼 클릭 (동글 안경 카드).
    const purchaseButtons = screen.getAllByRole("button", { name: "구매" });
    fireEvent.click(purchaseButtons[0]);

    // 모달 표시: "동글 안경 (30🌱) 구매할까요?" + "환불 불가" + 확인/취소.
    await waitFor(() => {
      expect(screen.getByText(/동글 안경 \(30🌱\) 구매할까요\?/)).toBeInTheDocument();
      expect(screen.getByText("환불 불가")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "확인" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();
    });
  });

  it("구매 확인 클릭 시 purchase_item IPC 호출", async () => {
    inMemory.set("economy", { sprouts: 100, lastTodoSproutDate: null });
    inMemory.set("inventory", {
      owned: [],
      equipped: { face: null, head: null, back: null },
    });
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "purchase_item") return undefined;
      return undefined;
    });

    const { ShopTab } = await import("../ShopTab");
    render(<ShopTab />);

    await waitFor(() => {
      expect(screen.getByText("동글 안경")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "구매" })[0]);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "확인" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("purchase_item", {
        itemId: "face_round_glasses",
      });
    });
  });

  it("AC-17: '내 아이템' 토글 시 owned 아이템만 표시", async () => {
    inMemory.set("economy", { sprouts: 1000, lastTodoSproutDate: null });
    inMemory.set("inventory", {
      owned: ["face_round_glasses"],
      equipped: { face: null, head: null, back: null },
    });

    const { ShopTab } = await import("../ShopTab");
    render(<ShopTab />);

    await waitFor(() => {
      expect(screen.getByText("동글 안경")).toBeInTheDocument();
      expect(screen.getByText("불타는 눈빛")).toBeInTheDocument();
    });

    // "내 아이템" 체크박스 클릭.
    const checkbox = screen.getByLabelText("내 아이템");
    fireEvent.click(checkbox);

    // 보유 아이템(동글 안경)만 표시, 미보유 아이템(불타는 눈빛, 멋쟁이 선글라스)은 사라짐.
    await waitFor(() => {
      expect(screen.getByText("동글 안경")).toBeInTheDocument();
      expect(screen.queryByText("불타는 눈빛")).not.toBeInTheDocument();
      expect(screen.queryByText("멋쟁이 선글라스")).not.toBeInTheDocument();
    });
  });

  it("AC-18: '내 아이템' 토글 + 장착 중 아이템에 '해제' 버튼", async () => {
    inMemory.set("economy", { sprouts: 1000, lastTodoSproutDate: null });
    inMemory.set("inventory", {
      owned: ["face_round_glasses"],
      equipped: { face: "face_round_glasses", head: null, back: null },
    });

    const { ShopTab } = await import("../ShopTab");
    render(<ShopTab />);

    // 토글 활성화.
    await waitFor(() => {
      expect(screen.getByLabelText("내 아이템")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("내 아이템"));

    // 장착 중 동글 안경 카드 → "해제" 버튼 표시.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "해제" })).toBeInTheDocument();
    });

    // 해제 클릭 → unequip_slot IPC 호출.
    fireEvent.click(screen.getByRole("button", { name: "해제" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("unequip_slot", { slot: "face" });
    });
  });

  it("영역 탭 변경 시 해당 슬롯 카드만 표시", async () => {
    inMemory.set("economy", { sprouts: 1000, lastTodoSproutDate: null });
    inMemory.set("inventory", {
      owned: [],
      equipped: { face: null, head: null, back: null },
    });

    const { ShopTab } = await import("../ShopTab");
    render(<ShopTab />);

    await waitFor(() => {
      expect(screen.getByText("동글 안경")).toBeInTheDocument();
    });

    // "머리" 탭 클릭.
    fireEvent.click(screen.getByRole("button", { name: "머리" }));

    await waitFor(() => {
      expect(screen.getByText("새싹 핀")).toBeInTheDocument();
      expect(screen.getByText("노란 안전모")).toBeInTheDocument();
      expect(screen.getByText("마법사 고깔")).toBeInTheDocument();
      expect(screen.queryByText("동글 안경")).not.toBeInTheDocument();
    });
  });
});
