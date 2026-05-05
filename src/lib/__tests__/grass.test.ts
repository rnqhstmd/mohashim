import { beforeEach, describe, expect, it, vi } from "vitest";

const inMemory = new Map<string, unknown>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

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
  vi.resetModules();
});

describe("grass.ts — gridLevel (BR-G1, AC-G7~G14)", () => {
  it("AC-G7: gridLevel(0, _) === 0", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(0, 0)).toBe(0);
    expect(gridLevel(0, 100)).toBe(0);
  });

  it("AC-G8: gridLevel(1, _) === 1", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(1, 0)).toBe(1);
    expect(gridLevel(1, 100)).toBe(1);
  });

  it("AC-G9: gridLevel(2, _) === 1", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(2, 0)).toBe(1);
    expect(gridLevel(2, 100)).toBe(1);
  });

  it("AC-G10: gridLevel(3, 60) === 3", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(3, 60)).toBe(3);
  });

  it("AC-G11: gridLevel(3, 59) === 2", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(3, 59)).toBe(2);
  });

  it("AC-G12: gridLevel(6, 70) === 4", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(6, 70)).toBe(4);
  });

  it("AC-G13: gridLevel(6, 69) === 2", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(6, 69)).toBe(2);
  });

  it("AC-G14: gridLevel(5, 70) === 3 (sessions 3~5 + avg≥60)", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(5, 70)).toBe(3);
  });

  it("Lv4 경계: sessions=7 + avg=70 → 4", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(7, 70)).toBe(4);
  });

  it("Lv4 경계: sessions=10 + avg=100 → 4", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(10, 100)).toBe(4);
  });
});

describe("grass.ts — formatDate (BR-G4)", () => {
  it("로컬 시간대 'YYYY-MM-DD' 포맷", async () => {
    const { formatDate } = await import("../grass");
    const d = new Date(2026, 4, 5); // 2026년 5월 5일 (month 0-indexed)
    expect(formatDate(d)).toBe("2026-05-05");
  });

  it("한자리 월/일 zero-padding", async () => {
    const { formatDate } = await import("../grass");
    expect(formatDate(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(formatDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("grass.ts — getMonthSessions (D-G4 월별 달력)", () => {
  it("AC-G15-monthly: 빈 sessions 상태에서도 해당 월 모든 일자 셀 + leading blank 정렬", async () => {
    const { getMonthSessions } = await import("../grass");
    const md = await getMonthSessions(0);

    // cells 길이가 7의 배수 (월별 달력 행 정렬)
    expect(md.cells.length % 7).toBe(0);

    // 적어도 4주 (28일) 이상 (가장 짧은 2월도 leading blank 포함 시 4주 또는 5주)
    expect(md.cells.length).toBeGreaterThanOrEqual(28);

    // null이 아닌 셀(실제 일자)이 28~31개
    const dayCells = md.cells.filter((c) => c.date !== null);
    expect(dayCells.length).toBeGreaterThanOrEqual(28);
    expect(dayCells.length).toBeLessThanOrEqual(31);
  });

  it("AC-G19-monthly: 빈 sessions 상태에서 모든 일자 level=0 (GRASS_0)", async () => {
    const { getMonthSessions } = await import("../grass");
    const md = await getMonthSessions(0);
    const dayCells = md.cells.filter((c) => c.date !== null);
    for (const c of dayCells) {
      expect(c.level).toBe(0);
      expect(c.sessions).toBe(0);
      expect(c.avg).toBe(0);
    }
  });

  it("BR-G7-monthly: monthOffset=0의 미래 일자는 isFuture=true + level=0", async () => {
    const { getMonthSessions, formatDate } = await import("../grass");
    const md = await getMonthSessions(0);
    const todayStr = formatDate(new Date());
    const futureCells = md.cells.filter(
      (c) => c.date !== null && c.date > todayStr
    );
    for (const c of futureCells) {
      expect(c.isFuture).toBe(true);
      expect(c.level).toBe(0);
    }
  });

  it("monthOffset < 0 (과거 월)은 모든 일자 isFuture=false", async () => {
    const { getMonthSessions } = await import("../grass");
    const md = await getMonthSessions(-1);
    const dayCells = md.cells.filter((c) => c.date !== null);
    for (const c of dayCells) {
      expect(c.isFuture).toBe(false);
    }
  });

  it("year/month 필드가 monthOffset에 맞게 산출됨", async () => {
    const { getMonthSessions } = await import("../grass");
    const md0 = await getMonthSessions(0);
    const md1 = await getMonthSessions(-1);
    // -1 월은 0 월보다 1개월 이전이거나 (12월에서 0월로 넘어가면) 작년 12월
    if (md0.month === 1) {
      expect(md1.year).toBe(md0.year - 1);
      expect(md1.month).toBe(12);
    } else {
      expect(md1.year).toBe(md0.year);
      expect(md1.month).toBe(md0.month - 1);
    }
  });

  it("적재된 세션 데이터를 반영하여 cells의 sessions/avg 값 산출", async () => {
    const { getMonthSessions, formatDate } = await import("../grass");
    const todayStr = formatDate(new Date());
    inMemory.set("sessions", {
      [todayStr]: { date: todayStr, sessions: 4, avg: 75 },
    });

    const md = await getMonthSessions(0);
    const todayCell = md.cells.find((c) => c.date === todayStr);
    expect(todayCell).toBeDefined();
    expect(todayCell!.sessions).toBe(4);
    expect(todayCell!.avg).toBe(75);
    expect(todayCell!.level).toBe(3); // sessions 3~5 + avg≥60
  });

  it("totalSessions/avgScore 가중 평균 계산 정확", async () => {
    const { getMonthSessions, formatDate } = await import("../grass");
    const today = new Date();
    const day1 = formatDate(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const day2 = formatDate(yesterday);

    inMemory.set("sessions", {
      [day1]: { date: day1, sessions: 2, avg: 80 },
      [day2]: { date: day2, sessions: 3, avg: 60 },
    });

    const md = await getMonthSessions(0);
    expect(md.totalSessions).toBe(5);
    // 가중 평균 = (80*2 + 60*3) / 5 = (160 + 180) / 5 = 68
    expect(md.avgScore).toBe(68);
  });
});

describe("grass.ts — 폴백 정규화 (BR-G8)", () => {
  it("sessions raw가 배열이면 빈 객체로 폴백 (cross-review 반영)", async () => {
    const { getMonthSessions } = await import("../grass");
    inMemory.set("sessions", [{ date: "2026-05-05", sessions: 1, avg: 80 }]);

    const md = await getMonthSessions(0);
    // 배열은 폴백되어 모든 cells의 sessions=0
    const dayCells = md.cells.filter((c) => c.date !== null);
    for (const c of dayCells) {
      expect(c.sessions).toBe(0);
    }
    expect(md.totalSessions).toBe(0);
  });
});
