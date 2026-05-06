import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inMemory = new Map<string, unknown>();
const writeImageMock = vi.fn();

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

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeImage: writeImageMock,
}));

beforeEach(() => {
  inMemory.clear();
  writeImageMock.mockReset();
  vi.resetModules();
});

describe("grass.ts — gridLevel (BR-G1, Phase 12 ANALYSIS.md §10-1 표)", () => {
  // ---------- 기존 회귀 (Phase 8~10) — Phase 12 표로 갱신 ----------
  it("AC-G7: gridLevel(0, _, todos=0) === 0", async () => {
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

  // Phase 12 H-5 역전 해소: sessions≥6은 점수 미달이어도 최소 레벨 3 보장.
  it("AC-G13 (Phase 12 갱신): gridLevel(6, 69) === 3 — 역전 방지", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(6, 69)).toBe(3);
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

  // ---------- Phase 12 신규 (PRD AC-1~AC-9 + BR-1) ----------
  it("AC-1: sessions=0, todos=0 → 0", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(0, 0, 0)).toBe(0);
  });

  it("AC-2: sessions=0, todos≥1 → 1", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(0, 0, 1)).toBe(1);
    expect(gridLevel(0, 0, 2)).toBe(1);
  });

  it("AC-3: sessions=0, todos≥3 → 2", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(0, 0, 3)).toBe(2);
    expect(gridLevel(0, 0, 5)).toBe(2);
    expect(gridLevel(0, 0, 100)).toBe(2);
  });

  it("AC-4: sessions 1~2, todos<3 → 1", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(1, 90, 0)).toBe(1);
    expect(gridLevel(1, 50, 2)).toBe(1);
    expect(gridLevel(2, 0, 0)).toBe(1);
    expect(gridLevel(2, 100, 2)).toBe(1);
  });

  it("AC-4b (PR #13 리뷰): sessions 1~2, todos≥3 → 2 (todos 단조 비감소)", async () => {
    // sessions=0/todos=3 → 2 였으므로 sessions=1/todos=3에서 1로 떨어지면 역전.
    const { gridLevel } = await import("../grass");
    expect(gridLevel(1, 0, 3)).toBe(2);
    expect(gridLevel(2, 50, 100)).toBe(2);
  });

  it("AC-5: sessions 3~5, avg<60 → 2", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(3, 59, 0)).toBe(2);
    expect(gridLevel(5, 0, 0)).toBe(2);
  });

  it("AC-6: sessions 3~5, avg≥60 → 3", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(3, 60, 0)).toBe(3);
    expect(gridLevel(5, 100, 0)).toBe(3);
  });

  it("AC-7: sessions≥6, avg<70 → 3 (역전 방지)", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(6, 69, 0)).toBe(3);
    expect(gridLevel(10, 50, 0)).toBe(3);
    expect(gridLevel(100, 0, 0)).toBe(3);
  });

  it("AC-8: sessions≥6, avg≥70 → 4", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(6, 70, 0)).toBe(4);
    expect(gridLevel(10, 100, 0)).toBe(4);
  });

  it("AC-9: H-5 역전 부재 — 동일 avg에서 sessions 단조 비감소", async () => {
    const { gridLevel } = await import("../grass");
    for (let avg = 0; avg <= 100; avg += 10) {
      let prev = -1;
      for (const s of [0, 1, 2, 3, 4, 5, 6, 10, 50]) {
        const lvl = gridLevel(s, avg, 0);
        expect(lvl).toBeGreaterThanOrEqual(prev);
        prev = lvl;
      }
    }
  });

  it("BR-1: todo 단독은 최대 레벨 2까지만 (정체성 보존)", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(0, 0, 1000)).toBe(2);
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

  it("totalSessions/avgScore 가중 평균 계산 정확 (legacy: sum 미존재, avg*sessions 폴백)", async () => {
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

  it("Phase 12 FR-5/FR-6: todos_completed가 DayCell.todos에 채워지고 gridLevel에 반영", async () => {
    const { getMonthSessions, formatDate } = await import("../grass");
    const todayStr = formatDate(new Date());
    // sessions=0 + todos_completed=3 → 새 표 기준 레벨 2 (BR-1).
    inMemory.set("sessions", {
      [todayStr]: { date: todayStr, sessions: 0, avg: 0, todos_completed: 3 },
    });

    const md = await getMonthSessions(0);
    const todayCell = md.cells.find((c) => c.date === todayStr);
    expect(todayCell).toBeDefined();
    expect(todayCell!.sessions).toBe(0);
    expect(todayCell!.todos).toBe(3);
    expect(todayCell!.level).toBe(2);
  });

  it("Phase 12 FR-6: todos_completed 미존재 레거시 레코드는 todos=0 폴백", async () => {
    const { getMonthSessions, formatDate } = await import("../grass");
    const todayStr = formatDate(new Date());
    inMemory.set("sessions", {
      [todayStr]: { date: todayStr, sessions: 1, avg: 50 },
    });

    const md = await getMonthSessions(0);
    const todayCell = md.cells.find((c) => c.date === todayStr);
    expect(todayCell!.todos).toBe(0);
    expect(todayCell!.level).toBe(1); // sessions=1 → 1.
  });

  it("totalSessions/avgScore: sum 필드 사용 시 avg 반올림 누적 오류 없음", async () => {
    const { getMonthSessions, formatDate } = await import("../grass");
    const today = new Date();
    const day1 = formatDate(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const day2 = formatDate(yesterday);

    // day1: sessions=2, scores=[0,1] → avg=round(1/2)=1(반올림), sum=1
    // day2: sessions=1, scores=[0]   → avg=0, sum=0
    // 진짜 전체 평균 = round((0+1+0)/3) = round(1/3) = 0
    // avg*sessions 방식은 round(1*2 + 0*1) / 3 = round(2/3) = 1 (오류)
    inMemory.set("sessions", {
      [day1]: { date: day1, sessions: 2, avg: 1, sum: 1 },
      [day2]: { date: day2, sessions: 1, avg: 0, sum: 0 },
    });

    const md = await getMonthSessions(0);
    expect(md.totalSessions).toBe(3);
    // sum 필드 사용: (1 + 0) / 3 = round(0.33) = 0
    expect(md.avgScore).toBe(0);
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

// ---------- 합성 파이프라인 테스트 (FR-18) ----------

describe("grass.ts — composeShareCard (SVG→PNG)", () => {
  let drawImageMock: ReturnType<typeof vi.fn>;
  let toBlobMock: ReturnType<typeof vi.fn>;
  let getContextMock: ReturnType<typeof vi.fn>;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    drawImageMock = vi.fn();
    toBlobMock = vi.fn();
    getContextMock = vi.fn(() => ({ drawImage: drawImageMock }));

    // canvas 엘리먼트를 mock canvas로 대체
    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: getContextMock,
          toBlob: toBlobMock,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("정상 경로: SVG → PNG Blob 반환", async () => {
    const expectedBlob = new Blob(["png-data"], { type: "image/png" });
    toBlobMock.mockImplementation(
      (cb: (blob: Blob | null) => void) => void cb(expectedBlob)
    );

    // decode()를 즉시 resolve하는 Image mock
    const imgMock = { src: "", decode: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(globalThis, "Image").mockImplementation(() => imgMock as unknown as HTMLImageElement);

    const { composeShareCard, SHARE_CARD_SIZE } = await import("../grass");

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const blob = await composeShareCard(svgEl);

    expect(blob).toBe(expectedBlob);
    expect(getContextMock).toHaveBeenCalledWith("2d");
    expect(drawImageMock).toHaveBeenCalledWith(
      imgMock,
      0,
      0,
      SHARE_CARD_SIZE,
      SHARE_CARD_SIZE
    );
    expect(toBlobMock).toHaveBeenCalledWith(expect.any(Function), "image/png");
  });

  it("UTF-8 안전성: 한글 포함 SVG 직렬화 후 dataUrl이 base64로 인코딩됨", async () => {
    const expectedBlob = new Blob(["png-data"], { type: "image/png" });
    toBlobMock.mockImplementation(
      (cb: (blob: Blob | null) => void) => void cb(expectedBlob)
    );

    let capturedSrc = "";
    const imgMock = {
      get src() {
        return capturedSrc;
      },
      set src(v: string) {
        capturedSrc = v;
      },
      decode: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(globalThis, "Image").mockImplementation(
      () => imgMock as unknown as HTMLImageElement
    );

    const { composeShareCard } = await import("../grass");

    // 한글 텍스트 포함 SVG
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "잔디 자랑하기";
    svgEl.appendChild(text);

    await composeShareCard(svgEl);

    // data URL이 base64 인코딩된 svg+xml임을 검증
    expect(capturedSrc).toMatch(/^data:image\/svg\+xml;base64,/);
    const base64 = capturedSrc.replace("data:image/svg+xml;base64,", "");
    // base64 → binary → UTF-8 decode 가 올바른 값을 복원해야 함
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    );
    expect(decoded).toContain("잔디 자랑하기");
  });

  it("toBlob 실패: blob=null일 때 reject", async () => {
    toBlobMock.mockImplementation(
      (cb: (blob: Blob | null) => void) => void cb(null)
    );

    const imgMock = { src: "", decode: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(globalThis, "Image").mockImplementation(
      () => imgMock as unknown as HTMLImageElement
    );

    const { composeShareCard } = await import("../grass");

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    await expect(composeShareCard(svgEl)).rejects.toThrow("canvas.toBlob 실패");
  });

  it("canvas 2d 컨텍스트 미지원: getContext가 null 반환 시 throw", async () => {
    getContextMock.mockReturnValue(null);

    const imgMock = { src: "", decode: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(globalThis, "Image").mockImplementation(
      () => imgMock as unknown as HTMLImageElement
    );

    const { composeShareCard } = await import("../grass");

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    await expect(composeShareCard(svgEl)).rejects.toThrow(
      "canvas 2d 컨텍스트 미지원"
    );
  });
});

describe("grass.ts — copyShareCardToClipboard (클립보드)", () => {
  it("정상 경로: Blob → Uint8Array로 writeImage 호출", async () => {
    writeImageMock.mockResolvedValue(undefined);
    const { copyShareCardToClipboard } = await import("../grass");

    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG 헤더
    // jsdom의 Blob은 arrayBuffer()를 지원하지 않으므로 mock 사용
    const mockBlob = {
      arrayBuffer: vi.fn().mockResolvedValue(data.buffer),
    } as unknown as Blob;

    await copyShareCardToClipboard(mockBlob);

    expect(writeImageMock).toHaveBeenCalledTimes(1);
    const arg = writeImageMock.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg)).toEqual(Array.from(data));
  });

  it("클립보드 거부: writeImage가 reject하면 에러 전파", async () => {
    const clipboardError = new Error("클립보드 권한 거부");
    writeImageMock.mockRejectedValue(clipboardError);
    const { copyShareCardToClipboard } = await import("../grass");

    const mockBlob = {
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    } as unknown as Blob;
    await expect(copyShareCardToClipboard(mockBlob)).rejects.toThrow(
      "클립보드 권한 거부"
    );
  });
});
