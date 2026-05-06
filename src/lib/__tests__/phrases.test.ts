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
  it("AC-1: phase=idle, db=75 → 'idle'", () => {
    expect(selectBucket({ phase: "idle", total: 0, db: 75 })).toBe("idle");
  });

  it("AC-2: phase=idle, db=81 → 'noiseLoud'", () => {
    expect(selectBucket({ phase: "idle", total: 0, db: 81 })).toBe(
      "noiseLoud"
    );
  });

  it("AC-3: phase=idle, db=80 → 'idle' (db=80은 noiseLoud 미해당)", () => {
    expect(selectBucket({ phase: "idle", total: 0, db: 80 })).toBe("idle");
  });

  it("AC-4: phase=focus, total=80 → 'focusHigh'", () => {
    expect(selectBucket({ phase: "focus", total: 80, db: 50 })).toBe(
      "focusHigh"
    );
  });

  it("AC-5: phase=focus, total=79 → 'focusLow'", () => {
    expect(selectBucket({ phase: "focus", total: 79, db: 50 })).toBe(
      "focusLow"
    );
  });

  it("AC-6: phase=focus, total=40 → 'focusLow'", () => {
    expect(selectBucket({ phase: "focus", total: 40, db: 50 })).toBe(
      "focusLow"
    );
  });

  it("AC-7: phase=focus, total=39 → 'focusBroken'", () => {
    expect(selectBucket({ phase: "focus", total: 39, db: 50 })).toBe(
      "focusBroken"
    );
  });

  it("AC-8: phase=focus, total=0 → 'focusBroken'", () => {
    expect(selectBucket({ phase: "focus", total: 0, db: 50 })).toBe(
      "focusBroken"
    );
  });

  it("AC-9 (BR-2): phase=focus, total=100, db=90 → 'focusHigh' (noiseLoud 아님)", () => {
    expect(selectBucket({ phase: "focus", total: 100, db: 90 })).toBe(
      "focusHigh"
    );
  });

  it("AC-10: phase=discarded → 'discarded'", () => {
    expect(selectBucket({ phase: "discarded", total: 50, db: 50 })).toBe(
      "discarded"
    );
  });

  it("AC-11: phase=complete → 'sessionComplete'", () => {
    expect(selectBucket({ phase: "complete", total: 50, db: 50 })).toBe(
      "sessionComplete"
    );
  });

  it("AC-12: phase=break → 'break'", () => {
    expect(selectBucket({ phase: "break", total: 50, db: 50 })).toBe("break");
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

describe("POTATO_PHRASES — 원문 보존 (AC-15, AC-15a, AC-15b, BR-1)", () => {
  it("AC-15: idle[0] 정확 일치", () => {
    expect(POTATO_PHRASES.idle[0]).toBe("오늘도 화이팅해서 잔디 심어줘 크크");
  });

  it("AC-15a: noiseLoud[0] 정확 일치", () => {
    expect(POTATO_PHRASES.noiseLoud[0]).toBe("시끄러워서 잠 못자 크크");
  });

  it("AC-15b: discarded[0] 정확 일치 (말줄임표 U+2026)", () => {
    expect(POTATO_PHRASES.discarded[0]).toBe("이번 건 기록 못 했어…");
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

describe("mapPhaseToPotatoState — FR-22 / FR-23", () => {
  it("FR-22: idle + db=50 → 'calm' (idle calm 고정)", () => {
    expect(
      mapPhaseToPotatoState({ phase: "idle", total: 0, db: 50 }, "focused")
    ).toBe("calm");
  });

  it("FR-22: idle + db=81 → 'covering' (idle 소음 일시 전환)", () => {
    expect(
      mapPhaseToPotatoState({ phase: "idle", total: 0, db: 81 }, "focused")
    ).toBe("covering");
  });

  it("FR-22: idle + db=80 → 'calm' (db=80 경계 미해당)", () => {
    expect(
      mapPhaseToPotatoState({ phase: "idle", total: 0, db: 80 }, "focused")
    ).toBe("calm");
  });

  it("FR-23: discarded → 'stressed' (고정)", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "discarded", total: 50, db: 50 },
        "focused"
      )
    ).toBe("stressed");
  });

  it("focus 시 엔진 state 통과 ('focused')", () => {
    expect(
      mapPhaseToPotatoState({ phase: "focus", total: 90, db: 50 }, "focused")
    ).toBe("focused");
  });

  it("break 시 엔진 state 통과 ('calm')", () => {
    expect(
      mapPhaseToPotatoState({ phase: "break", total: 50, db: 50 }, "calm")
    ).toBe("calm");
  });

  it("complete 시 엔진 state 통과 ('stressed')", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "complete", total: 50, db: 50 },
        "stressed"
      )
    ).toBe("stressed");
  });

  it("invalid engineState (union 외)는 'calm' 폴백", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "focus", total: 50, db: 50 },
        "invalid_state" as PotatoState,
      ),
    ).toBe("calm");
  });

  it("undefined engineState도 'calm' 폴백", () => {
    expect(
      mapPhaseToPotatoState(
        { phase: "focus", total: 50, db: 50 },
        undefined as unknown as PotatoState,
      ),
    ).toBe("calm");
  });
});
