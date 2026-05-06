import { afterEach, describe, expect, it, vi } from "vitest";
import {
  POTATO_PHRASES,
  selectBucket,
  pickPhrase,
  __pickPhraseFromArray,
  mapPhaseToPotatoState,
  type BucketKey,
} from "../phrases";
import type { PotatoState } from "../phrases";

afterEach(() => {
  // spy 누수 차단: 다음 it/describe로 Math.random stub이 새지 않도록.
  vi.restoreAllMocks();
});

describe("selectBucket — 버킷 분기 (AC-1~AC-12, BR-2)", () => {
  it("AC-1: phase=idle, db=75, noiseLoudActive=false → 'idle'", () => {
    expect(
      selectBucket({ phase: "idle", total: 0, noiseLoudActive: false })
    ).toBe("idle");
  });

  it("AC-2: phase=idle, noiseLoudActive=true → 'noiseLoud'", () => {
    expect(
      selectBucket({ phase: "idle", total: 0, noiseLoudActive: true })
    ).toBe("noiseLoud");
  });

  it("AC-3: phase=idle, db=80, noiseLoudActive=false → 'idle' (db=80은 noiseLoud 미해당)", () => {
    expect(
      selectBucket({ phase: "idle", total: 0, noiseLoudActive: false })
    ).toBe("idle");
  });

  it("AC-4: phase=focus, total=80 → 'focusHigh'", () => {
    expect(
      selectBucket({ phase: "focus", total: 80, noiseLoudActive: false })
    ).toBe("focusHigh");
  });

  it("AC-5: phase=focus, total=79 → 'focusLow'", () => {
    expect(
      selectBucket({ phase: "focus", total: 79, noiseLoudActive: false })
    ).toBe("focusLow");
  });

  it("AC-6: phase=focus, total=40 → 'focusLow'", () => {
    expect(
      selectBucket({ phase: "focus", total: 40, noiseLoudActive: false })
    ).toBe("focusLow");
  });

  it("AC-7: phase=focus, total=39 → 'focusBroken'", () => {
    expect(
      selectBucket({ phase: "focus", total: 39, noiseLoudActive: false })
    ).toBe("focusBroken");
  });

  it("AC-8: phase=focus, total=0 → 'focusBroken'", () => {
    expect(
      selectBucket({ phase: "focus", total: 0, noiseLoudActive: false })
    ).toBe("focusBroken");
  });

  it("AC-9 (BR-2): phase=focus, total=100, db=90 → 'focusHigh' (noiseLoud 아님)", () => {
    expect(
      selectBucket({ phase: "focus", total: 100, noiseLoudActive: false })
    ).toBe("focusHigh");
  });

  it("AC-10: phase=discarded → 'discarded'", () => {
    expect(
      selectBucket({
        phase: "discarded",
        total: 50,
        noiseLoudActive: false,
      })
    ).toBe("discarded");
  });

  it("AC-11: phase=complete → 'sessionComplete'", () => {
    expect(
      selectBucket({
        phase: "complete",
        total: 50,
        noiseLoudActive: false,
      })
    ).toBe("sessionComplete");
  });

  it("AC-12: phase=break → 'break'", () => {
    expect(
      selectBucket({ phase: "break", total: 50, noiseLoudActive: false })
    ).toBe("break");
  });

  // Phase 11 신규: noiseLoudActive 기반 분기 (FR-7, BR-3, BR-5).
  it("Phase 11 (FR-7): phase=idle, db=90, noiseLoudActive=false → 'idle' (db 무관, hysteresis 미충족)", () => {
    expect(
      selectBucket({ phase: "idle", total: 0, noiseLoudActive: false })
    ).toBe("idle");
  });

  it("Phase 11 (FR-7): phase=idle, db=50, noiseLoudActive=true → 'noiseLoud' (분기는 active 플래그 기준)", () => {
    expect(
      selectBucket({ phase: "idle", total: 0, noiseLoudActive: true })
    ).toBe("noiseLoud");
  });
});

describe("pickPhrase — Math.random spy 결정성 (AC-1, AC-2)", () => {
  it("AC-1 (BR-1): Math.random=0 → idle[0] (첫 원소)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(pickPhrase("idle")).toBe(POTATO_PHRASES.idle[0]);
  });

  it("AC-1 (BR-1): Math.random=0.5 → idle[floor(0.5 * length)] (중간 원소)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const expectedIdx = Math.floor(0.5 * POTATO_PHRASES.idle.length);
    expect(pickPhrase("idle")).toBe(POTATO_PHRASES.idle[expectedIdx]);
  });

  it("AC-2 (BR-1): Math.random=lastIdx/length → idle[lastIdx] (마지막 원소)", () => {
    // length 비의존: lastIdx / length는 length 변경과 무관하게
    // floor((lastIdx/length) * length) === lastIdx를 보장.
    const lastIdx = POTATO_PHRASES.idle.length - 1;
    vi.spyOn(Math, "random").mockReturnValue(lastIdx / POTATO_PHRASES.idle.length);
    expect(pickPhrase("idle")).toBe(POTATO_PHRASES.idle[lastIdx]);
  });
});

describe("pickPhrase — 빈 배열 가드 (회귀 방지, DEC-9-3)", () => {
  it("8개 버킷 모두 string 반환 (length>0이므로 비어있지 않음)", () => {
    const buckets: BucketKey[] = [
      "idle",
      "focusHigh",
      "focusLow",
      "focusBroken",
      "break",
      "sessionComplete",
      "noiseLoud",
      "discarded",
    ];
    for (const bucket of buckets) {
      expect(typeof pickPhrase(bucket)).toBe("string");
      expect(pickPhrase(bucket)).not.toBe("");
    }
  });
});

describe("POTATO_PHRASES — Phase 11 원문 보존 (AC-1~AC-5, BR-1)", () => {
  // AC-1~AC-5 버킷 길이 검증.
  it("AC-1: idle 정확히 7개", () => {
    expect(POTATO_PHRASES.idle.length).toBe(7);
  });

  it("AC-2: break 정확히 5개", () => {
    expect(POTATO_PHRASES.break.length).toBe(5);
  });

  it("AC-3: sessionComplete 정확히 4개", () => {
    expect(POTATO_PHRASES.sessionComplete.length).toBe(4);
  });

  it("AC-4: noiseLoud 정확히 3개", () => {
    expect(POTATO_PHRASES.noiseLoud.length).toBe(3);
  });

  it("AC-5: discarded 정확히 3개", () => {
    expect(POTATO_PHRASES.discarded.length).toBe(3);
  });

  // AC-1: idle[0] 원문 일치.
  it("AC-1 (BR-1): idle[0] 정확 일치", () => {
    expect(POTATO_PHRASES.idle[0]).toBe("오늘도 화이팅해서 잔디 심어줘 크크");
  });

  // AC-4: noiseLoud 신규 원문 + 구버전 부재.
  it("AC-4 (BR-1): noiseLoud[0] 정확 일치 (점 2개+점 3개 ASCII)", () => {
    expect(POTATO_PHRASES.noiseLoud[0]).toBe("엇..주변이 조금 시끄럽네...");
  });

  it("AC-4: noiseLoud 구버전 텍스트 부재", () => {
    expect(POTATO_PHRASES.noiseLoud).not.toContain("시끄러워서 잠 못자 크크");
    expect(POTATO_PHRASES.noiseLoud).not.toContain("이 소음 실화심??");
    expect(POTATO_PHRASES.noiseLoud).not.toContain("귀 막고 싶은 거 참는 중");
    expect(POTATO_PHRASES.noiseLoud).not.toContain("조용히 좀 해줘 크크");
  });

  // AC-5: discarded 신규 원문 + 구버전 부재.
  it("AC-5 (BR-1): discarded[0] 정확 일치 (점 3개 ASCII, U+2026 제거)", () => {
    expect(POTATO_PHRASES.discarded[0]).toBe("엇 이번 건 기록 못 했움...");
  });

  it("AC-5: discarded 구버전 텍스트 부재", () => {
    expect(POTATO_PHRASES.discarded).not.toContain("이번 건 기록 못 했어…");
    expect(POTATO_PHRASES.discarded).not.toContain("아 아깝다 진짜");
    expect(POTATO_PHRASES.discarded).not.toContain("다음엔 꼭 끝내줘 크크");
  });

  // AC-7 BR-2: focus 3버킷 불변.
  it("AC-7 (BR-2): focusHigh 8개 / focusLow 3개 / focusBroken 3개 불변", () => {
    expect(POTATO_PHRASES.focusHigh.length).toBe(8);
    expect(POTATO_PHRASES.focusLow.length).toBe(3);
    expect(POTATO_PHRASES.focusBroken.length).toBe(3);
  });

  it("8버킷 모두 length > 0", () => {
    expect(
      Object.values(POTATO_PHRASES).every((arr) => arr.length > 0)
    ).toBe(true);
  });
});

describe("__pickPhraseFromArray — 빈 배열 / 단일 원소 (AC-21, BR-2, BR-3)", () => {
  it("빈 배열 + seed=0 → ''", () => {
    expect(__pickPhraseFromArray([], 0)).toBe("");
  });

  it("빈 배열 + seed=-5 → ''", () => {
    expect(__pickPhraseFromArray([], -5)).toBe("");
  });

  it("빈 배열 + seed=NaN → ''", () => {
    expect(__pickPhraseFromArray([], NaN)).toBe("");
  });

  it("단일 원소 배열 + seed=0 → 그 원소", () => {
    expect(__pickPhraseFromArray(["only"], 0)).toBe("only");
  });

  it("단일 원소 배열 + seed=7 → 그 원소", () => {
    expect(__pickPhraseFromArray(["only"], 7)).toBe("only");
  });

  it("단일 원소 배열 + seed=-3 → 그 원소", () => {
    expect(__pickPhraseFromArray(["only"], -3)).toBe("only");
  });

  it("빈 배열 호출 시 throw 없음", () => {
    expect(() => __pickPhraseFromArray([], 0)).not.toThrow();
    expect(() => __pickPhraseFromArray([], -5)).not.toThrow();
    expect(() => __pickPhraseFromArray([], NaN)).not.toThrow();
  });
});

describe("mapPhaseToPotatoState — FR-22 / FR-23 / Phase 11 MA-1", () => {
  it("FR-22: idle + noiseLoudActive=false → 'calm' (idle calm 고정)", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "idle", total: 0, noiseLoudActive: false },
        "focused"
      )
    ).toBe("calm");
  });

  it("Phase 11 (MA-1): idle + noiseLoudActive=true → 'covering' (db 무관)", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "idle", total: 0, noiseLoudActive: true },
        "focused"
      )
    ).toBe("covering");
  });

  it("Phase 11 (MA-1): idle + db=90 + noiseLoudActive=false → 'calm' (db 무관, hysteresis 미충족)", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "idle", total: 0, noiseLoudActive: false },
        "focused"
      )
    ).toBe("calm");
  });

  it("FR-23: discarded → 'stressed' (고정)", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "discarded", total: 50, noiseLoudActive: false },
        "focused"
      )
    ).toBe("stressed");
  });

  it("focus 시 엔진 state 통과 ('focused')", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "focus", total: 90, noiseLoudActive: false },
        "focused"
      )
    ).toBe("focused");
  });

  it("break 시 엔진 state 통과 ('calm')", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "break", total: 50, noiseLoudActive: false },
        "calm"
      )
    ).toBe("calm");
  });

  it("complete 시 엔진 state 통과 ('stressed')", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "complete", total: 50, noiseLoudActive: false },
        "stressed"
      )
    ).toBe("stressed");
  });

  it("invalid engineState (union 외)는 'calm' 폴백", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "focus", total: 50, noiseLoudActive: false },
        "invalid_state" as PotatoState,
      ),
    ).toBe("calm");
  });

  it("undefined engineState도 'calm' 폴백", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "focus", total: 50, noiseLoudActive: false },
        undefined as unknown as PotatoState,
      ),
    ).toBe("calm");
  });
});
