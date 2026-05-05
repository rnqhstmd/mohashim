import { beforeEach, describe, expect, it, vi } from "vitest";

const inMemory = new Map<string, unknown>();

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
});
