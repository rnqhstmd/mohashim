import { beforeEach, describe, expect, it, vi } from "vitest";

const inMemory = new Map<string, unknown>();
const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-store", () => {
  return {
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
  };
});

beforeEach(() => {
  inMemory.clear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  vi.resetModules();
});

describe("storage", () => {
  it("get returns DEFAULTS when key absent", async () => {
    const mod = await import("../storage");
    await expect(mod.get("focus_minutes")).resolves.toBe(25);
    await expect(mod.get("break_minutes")).resolves.toBe(5);
    await expect(mod.get("notifications_enabled")).resolves.toBe(true);
    await expect(mod.get("todos")).resolves.toEqual([]);
    await expect(mod.get("sessions")).resolves.toEqual({});
  });

  it("set persists value and subsequent get returns it", async () => {
    const mod = await import("../storage");
    await mod.set("focus_minutes", 50);
    await expect(mod.get("focus_minutes")).resolves.toBe(50);
  });

  it("getOnboardingCompleted returns false initially", async () => {
    const mod = await import("../storage");
    await expect(mod.getOnboardingCompleted()).resolves.toBe(false);
  });

  it("setOnboardingCompleted then getOnboardingCompleted returns true", async () => {
    const mod = await import("../storage");
    await mod.setOnboardingCompleted(true);
    await expect(mod.getOnboardingCompleted()).resolves.toBe(true);
  });

  it("initStorage is idempotent across multiple calls", async () => {
    const mod = await import("../storage");
    await mod.initStorage();
    await mod.initStorage();
    await mod.initStorage();
    await expect(mod.get("focus_minutes")).resolves.toBe(25);
  });

  it("set with { save: false } defers persistence; flush() commits batched writes", async () => {
    const mod = await import("../storage");
    await mod.set("focus_minutes", 40, { save: false });
    await mod.set("break_minutes", 10, { save: false });
    await mod.flush();
    await expect(mod.get("focus_minutes")).resolves.toBe(40);
    await expect(mod.get("break_minutes")).resolves.toBe(10);
  });

  it("getActivePhase returns 'idle' by default", async () => {
    const mod = await import("../storage");
    await expect(mod.getActivePhase()).resolves.toBe("idle");
  });

  it("getActivePhase returns persisted value when set", async () => {
    // BR-active-phase: active_phase의 writer는 Rust(timer.rs) 단일 책임이므로
    // TS `set` API는 active_phase 키를 컴파일 타임에 차단한다 (Exclude<..., "active_phase">).
    // 테스트에서는 Rust가 디스크에 기록한 상황을 시뮬레이션하기 위해 mock store에
    // 직접 값을 주입한다.
    inMemory.set("active_phase", "focus");
    const mod = await import("../storage");
    await expect(mod.getActivePhase()).resolves.toBe("focus");
  });

  it("resetAllData invokes 'reset_all' tauri command", async () => {
    const mod = await import("../storage");
    await mod.resetAllData();
    expect(invokeMock).toHaveBeenCalledWith("reset_all");
  });

  it("resetAllData rethrows invoke error after logging to console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockRejectedValueOnce(new Error("ipc failure"));
    const mod = await import("../storage");
    await expect(mod.resetAllData()).rejects.toThrow("ipc failure");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("getFocusMinutes / setFocusMinutes round-trip", async () => {
    const mod = await import("../storage");
    await expect(mod.getFocusMinutes()).resolves.toBe(25);
    await mod.setFocusMinutes(45);
    await expect(mod.getFocusMinutes()).resolves.toBe(45);
  });

  it("getBreakMinutes / setBreakMinutes round-trip", async () => {
    const mod = await import("../storage");
    await expect(mod.getBreakMinutes()).resolves.toBe(5);
    await mod.setBreakMinutes(15);
    await expect(mod.getBreakMinutes()).resolves.toBe(15);
  });

  // ---------- Phase 6 폴백 정규화 회귀 테스트 ----------

  it("getTodos: 비배열 잔존 데이터를 빈 배열로 무효화", async () => {
    inMemory.set("todos", { not: "an array" });
    const mod = await import("../storage");
    await expect(mod.getTodos()).resolves.toEqual([]);
  });

  it("getTodos: 신규 필드(tag/loc/active) 부재 시 null/false 폴백", async () => {
    inMemory.set("todos", [
      { id: "t1", text: "구버전", done: false },
      { id: "t2", text: "완료", done: true },
    ]);
    const mod = await import("../storage");
    const result = await mod.getTodos();
    expect(result).toEqual([
      { id: "t1", text: "구버전", done: false, tag: null, loc: null, active: false, completedAt: null },
      { id: "t2", text: "완료", done: true, tag: null, loc: null, active: false, completedAt: null },
    ]);
  });

  it("getTodos: id 부재 시 결정적 폴백 ID — 호출 시마다 동일", async () => {
    inMemory.set("todos", [{ text: "no-id-1" }, { text: "no-id-2" }]);
    const mod = await import("../storage");
    const a = await mod.getTodos();
    const b = await mod.getTodos();
    expect(a[0].id).toBe("t-fallback-0");
    expect(a[1].id).toBe("t-fallback-1");
    expect(a[0].id).toBe(b[0].id);
    expect(a[1].id).toBe(b[1].id);
  });

  it("getWorkTags: 구 타입(name) → 신 타입(label) 자동 변환 + emoji/color 폴백", async () => {
    inMemory.set("work_tags", [
      { id: "old-1", name: "예전라벨", color: "#abcdef" },
      { id: "old-2", name: "이름만" },
    ]);
    const mod = await import("../storage");
    const result = await mod.getWorkTags();
    expect(result).toEqual([
      { id: "old-1", emoji: "🏷", label: "예전라벨", color: "#abcdef" },
      { id: "old-2", emoji: "🏷", label: "이름만", color: "#7aa3e6" },
    ]);
  });

  it("getWorkTags: 비배열 잔존 데이터를 빈 배열로 무효화", async () => {
    inMemory.set("work_tags", "corrupted");
    const mod = await import("../storage");
    await expect(mod.getWorkTags()).resolves.toEqual([]);
  });

  it("getLocations: 구 타입(name) → 신 타입(label) 자동 변환 + 결정적 ID 폴백", async () => {
    inMemory.set("locations", [
      { name: "도서관" }, // id 부재
      { id: "loc-x", name: "카페", color: "#deadbe" },
    ]);
    const mod = await import("../storage");
    const result = await mod.getLocations();
    expect(result).toEqual([
      { id: "loc-fallback-0", emoji: "📍", label: "도서관", color: "#7aa3e6" },
      { id: "loc-x", emoji: "📍", label: "카페", color: "#deadbe" },
    ]);
  });

  it("set은 active_phase 키를 컴파일 타임에 차단 (런타임 회피 시나리오 검증)", async () => {
    const mod = await import("../storage");
    // @ts-expect-error active_phase는 set 시그니처에서 Exclude로 제거됨 (BR-active-phase)
    await mod.set("active_phase", "focus");
    // 런타임 회피로 호출했을 때도 store가 받기는 하지만, 정상 경로에서는 컴파일 에러로 차단됨.
    // 본 테스트는 타입 가드의 존재만 확인 (@ts-expect-error 미발생 시 테스트 실패).
    expect(true).toBe(true);
  });

  // ---------- Phase 10 데이터 모델 확장 ----------

  it("AC-5 (FR-10): STORE_DEFAULTS에 session_logs=[], last_cleanup_year=0 신규 키 포함", async () => {
    const mod = await import("../storage");
    expect(mod.STORE_DEFAULTS.session_logs).toEqual([]);
    expect(mod.STORE_DEFAULTS.last_cleanup_year).toBe(0);
  });

  it("AC-5: get('session_logs') / get('last_cleanup_year') 부재 시 default 반환", async () => {
    const mod = await import("../storage");
    await expect(mod.get("session_logs")).resolves.toEqual([]);
    await expect(mod.get("last_cleanup_year")).resolves.toBe(0);
  });

  it("AC-3 (FR-1): getTodos completedAt 폴백 — 부재 시 null", async () => {
    inMemory.set("todos", [
      { id: "t1", text: "구버전", done: false },
      { id: "t2", text: "완료", done: true },
    ]);
    const mod = await import("../storage");
    const result = await mod.getTodos();
    expect(result[0].completedAt).toBeNull();
    expect(result[1].completedAt).toBeNull();
  });

  it("AC-3 (FR-1): getTodos completedAt 폴백 — 문자열 보존", async () => {
    inMemory.set("todos", [
      { id: "t1", text: "완료기록", done: true, completedAt: "2026-05-06T12:00:00.000Z" },
    ]);
    const mod = await import("../storage");
    const result = await mod.getTodos();
    expect(result[0].completedAt).toBe("2026-05-06T12:00:00.000Z");
  });

  it("AC-3: getTodos completedAt 폴백 — 비문자열은 null", async () => {
    inMemory.set("todos", [
      { id: "t1", text: "잘못된형식", done: true, completedAt: 12345 },
    ]);
    const mod = await import("../storage");
    const result = await mod.getTodos();
    expect(result[0].completedAt).toBeNull();
  });

  it("AC-7 (FR-4): getSessionLogs — 비배열은 빈 배열로 폴백", async () => {
    inMemory.set("session_logs", { not: "array" });
    const mod = await import("../storage");
    await expect(mod.getSessionLogs()).resolves.toEqual([]);
  });

  it("AC-7: getSessionLogs — 정상 배열은 그대로 반환", async () => {
    const log = {
      id: "sl-123-80",
      date: "2026-05-06",
      start_at: "2026-05-06T12:00:00+09:00",
      end_at: "2026-05-06T12:25:00+09:00",
      duration_mins: 25,
      score: 80,
      todos_done: [],
    };
    inMemory.set("session_logs", [log]);
    const mod = await import("../storage");
    await expect(mod.getSessionLogs()).resolves.toEqual([log]);
  });

  it("AC-10: getLastCleanupYear — 부재/비숫자는 0 폴백", async () => {
    const mod = await import("../storage");
    await expect(mod.getLastCleanupYear()).resolves.toBe(0);
    inMemory.set("last_cleanup_year", "2025");
    vi.resetModules();
    const mod2 = await import("../storage");
    await expect(mod2.getLastCleanupYear()).resolves.toBe(0);
  });

  it("AC-10: getLastCleanupYear — 숫자값 보존", async () => {
    inMemory.set("last_cleanup_year", 2026);
    const mod = await import("../storage");
    await expect(mod.getLastCleanupYear()).resolves.toBe(2026);
  });

  it("BR-1: set은 session_logs 키를 컴파일 타임에 차단", async () => {
    const mod = await import("../storage");
    // @ts-expect-error session_logs는 Rust 단일 writer (BR-1) — set 시그니처에서 Exclude됨
    await mod.set("session_logs", []);
    expect(true).toBe(true);
  });

  it("FR-7: set은 last_cleanup_year 키를 컴파일 타임에 차단", async () => {
    const mod = await import("../storage");
    // @ts-expect-error last_cleanup_year는 Rust 단일 writer — set 시그니처에서 Exclude됨
    await mod.set("last_cleanup_year", 2026);
    expect(true).toBe(true);
  });
});
