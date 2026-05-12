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

describe("grass.ts — gridLevel (Phase 22+ 통합 가중치 모델)", () => {
  // 공식: points = focusMins/30 + todos/2 + (avg >= 80 ? 1 : 0)
  // 임계: 0(비활동) / 활동 0~1.5=1 / 1.5~2.5=2 / 2.5~3.5=3 / 3.5+=4

  it("비활동 (sessions=0, todos=0) → 0", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(0, 0, 0, 0)).toBe(0);
    expect(gridLevel(0, 100, 0, 0)).toBe(0);
  });

  it("2시간 집중만으로 만점 (focusMins=120) → 4", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(6, 50, 0, 120)).toBe(4); // 120/30 = 4
  });

  it("형평성: 50분×3 = 25분×6 = 150분 → 4", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(3, 70, 0, 150)).toBe(4);
    expect(gridLevel(6, 70, 0, 150)).toBe(4);
  });

  it("할 일 8개만으로 만점 → 4", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(0, 0, 8, 0)).toBe(4); // 8/2 = 4
  });

  it("시너지: 1시간 + todo 3 + 평균 85 → 4", async () => {
    const { gridLevel } = await import("../grass");
    // 60/30 + 3/2 + 1 = 4.5
    expect(gridLevel(2, 85, 3, 60)).toBe(4);
  });

  it("평균 점수 보너스: 25분×1 + 평균 80 → 1 (1.08)", async () => {
    const { gridLevel } = await import("../grass");
    // 25/30 + 0 + 0.25 = 1.08 → 1.5 미만이라 활동 있어서 1
    expect(gridLevel(1, 80, 0, 25)).toBe(1);
  });

  it("점수 보너스 미발동: 25분×1 + 평균 79 → 1", async () => {
    const { gridLevel } = await import("../grass");
    // 25/30 = 0.83 → 활동 있으니 최소 1
    expect(gridLevel(1, 79, 0, 25)).toBe(1);
  });

  it("평균 점수 보너스 작은 가중치: 1시간 + 평균 80 → 2 (2.25)", async () => {
    const { gridLevel } = await import("../grass");
    // 60/30 + 0 + 0.25 = 2.25 → 1.5~2.5 → 2
    expect(gridLevel(2, 80, 0, 60)).toBe(2);
  });

  it("할 일만 적게 (todo 1~2) → 1", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(0, 0, 1, 0)).toBe(1);
    expect(gridLevel(0, 0, 2, 0)).toBe(1);
  });

  it("할 일 3개만 → 1 (1.5 미만), 4개 → 2", async () => {
    const { gridLevel } = await import("../grass");
    expect(gridLevel(0, 0, 3, 0)).toBe(2); // 3/2 = 1.5 → 2
    expect(gridLevel(0, 0, 4, 0)).toBe(2); // 4/2 = 2 → 2
  });

  it("활동은 있지만 점수 미달 → 최소 1 보장", async () => {
    const { gridLevel } = await import("../grass");
    // 5분 세션 1번 → 5/30 = 0.17 → 활동 있어서 1
    expect(gridLevel(1, 50, 0, 5)).toBe(1);
  });

  it("경계: total 1.5 → 2, 2.5 → 3, 3.5 → 4", async () => {
    const { gridLevel } = await import("../grass");
    // total = 1.5 (todo 3) → 2
    expect(gridLevel(1, 0, 3, 0)).toBe(2);
    // total = 2.5 (1시간 30분 = 90분) → 3
    expect(gridLevel(3, 0, 0, 75)).toBe(3); // 75/30 = 2.5
    // total = 3.5 (todo 7개) → 4
    expect(gridLevel(0, 0, 7, 0)).toBe(4); // 7/2 = 3.5
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

describe("grass.ts — formatDateHeading (Phase 13 FR-8)", () => {
  it("'YYYY년 M월 D일 요일' 포맷 (수요일)", async () => {
    const { formatDateHeading } = await import("../grass");
    // 2026년 5월 6일은 수요일.
    const d = new Date(2026, 4, 6);
    expect(formatDateHeading(d)).toBe("2026년 5월 6일 수요일");
  });

  it("한 자리 월/일은 padding 없이 표기", async () => {
    const { formatDateHeading } = await import("../grass");
    // 2026-01-01은 목요일.
    const d = new Date(2026, 0, 1);
    expect(formatDateHeading(d)).toBe("2026년 1월 1일 목요일");
  });

  it("일요일/토요일 요일 산출", async () => {
    const { formatDateHeading } = await import("../grass");
    // 2026-05-03 일요일.
    expect(formatDateHeading(new Date(2026, 4, 3))).toBe("2026년 5월 3일 일요일");
    // 2026-05-09 토요일.
    expect(formatDateHeading(new Date(2026, 4, 9))).toBe("2026년 5월 9일 토요일");
  });
});

describe("grass.ts — formatSessionTime (Phase 13 FR-9)", () => {
  it("오전 시각: 09:00~09:25", async () => {
    const { formatSessionTime } = await import("../grass");
    const start = new Date(2026, 4, 6, 9, 0).toISOString();
    const end = new Date(2026, 4, 6, 9, 25).toISOString();
    expect(formatSessionTime(start, end)).toBe("오전 9:00~9:25");
  });

  it("오후 시각: 14:00~14:25 → 오후 2:00~2:25", async () => {
    const { formatSessionTime } = await import("../grass");
    const start = new Date(2026, 4, 6, 14, 0).toISOString();
    const end = new Date(2026, 4, 6, 14, 25).toISOString();
    expect(formatSessionTime(start, end)).toBe("오후 2:00~2:25");
  });

  it("정오 경계: 12:00 → 오후 12:00", async () => {
    const { formatSessionTime } = await import("../grass");
    const start = new Date(2026, 4, 6, 12, 0).toISOString();
    const end = new Date(2026, 4, 6, 12, 25).toISOString();
    expect(formatSessionTime(start, end)).toBe("오후 12:00~12:25");
  });

  it("자정 경계: 0시는 12시로 표기 (오전 12:00)", async () => {
    const { formatSessionTime } = await import("../grass");
    const start = new Date(2026, 4, 6, 0, 0).toISOString();
    const end = new Date(2026, 4, 6, 0, 25).toISOString();
    expect(formatSessionTime(start, end)).toBe("오전 12:00~12:25");
  });

  it("분 단위 zero-padding: 5분 → :05", async () => {
    const { formatSessionTime } = await import("../grass");
    const start = new Date(2026, 4, 6, 14, 5).toISOString();
    const end = new Date(2026, 4, 6, 14, 30).toISOString();
    expect(formatSessionTime(start, end)).toBe("오후 2:05~2:30");
  });

  it("invalid ISO 입력은 빈 문자열 반환 (UI 폴백)", async () => {
    const { formatSessionTime } = await import("../grass");
    expect(formatSessionTime("invalid-date", "also-invalid")).toBe("");
    expect(formatSessionTime("2026-05-06T14:00:00+09:00", "garbage")).toBe("");
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

  it("적재된 세션 데이터를 반영하여 cells의 sessions/avg/level 값 산출", async () => {
    const { getMonthSessions, formatDate } = await import("../grass");
    const todayStr = formatDate(new Date());
    inMemory.set("sessions", {
      [todayStr]: { date: todayStr, sessions: 4, avg: 75 },
    });
    // Phase 22+ 정책: focusMins 필요. session_logs도 mock — 4세션 × 25분 = 100분.
    inMemory.set("session_logs", [
      { id: "sl-1", date: todayStr, start_at: "", end_at: "", duration_mins: 25, score: 75, todos_done: [], avg_db: 0, earned_sprouts: 0 },
      { id: "sl-2", date: todayStr, start_at: "", end_at: "", duration_mins: 25, score: 75, todos_done: [], avg_db: 0, earned_sprouts: 0 },
      { id: "sl-3", date: todayStr, start_at: "", end_at: "", duration_mins: 25, score: 75, todos_done: [], avg_db: 0, earned_sprouts: 0 },
      { id: "sl-4", date: todayStr, start_at: "", end_at: "", duration_mins: 25, score: 75, todos_done: [], avg_db: 0, earned_sprouts: 0 },
    ]);

    const md = await getMonthSessions(0);
    const todayCell = md.cells.find((c) => c.date === todayStr);
    expect(todayCell).toBeDefined();
    expect(todayCell!.sessions).toBe(4);
    expect(todayCell!.avg).toBe(75);
    // 100/30 + 0 + 0 = 3.33 → level 3.
    expect(todayCell!.level).toBe(3);
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
