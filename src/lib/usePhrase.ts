import { useEffect, useMemo, useState } from "react";
import {
  mapPhaseToPotatoState,
  pickPhrase,
  selectBucket,
  type BucketKey,
  type PotatoState,
} from "./phrases";
import type { LiveState, Phase } from "./score";

export type UsePhraseInput =
  | {
      phase: Phase;
      total: number;
      db: number;
      state: LiveState;
      noiseLoudActive: boolean;
    }
  | null;

export type UsePhraseOutput = {
  bucket: BucketKey;
  phrase: string;
  potatoState: PotatoState;
};

/** 멘트 회전 주기 (BR-1: 8초). score-tick(1Hz)마다 멘트가 바뀌지 않도록 분리. */
export const PHRASE_ROTATE_MS = 8000;

const FALLBACK_INPUT: {
  phase: Phase;
  total: number;
  db: number;
  state: LiveState;
  noiseLoudActive: boolean;
} = {
  phase: "idle",
  total: 0,
  db: 0,
  state: "calm",
  noiseLoudActive: false,
};

/**
 * 멘트 회전 + potatoState 산출 hook (FR-2, FR-3, BR-1, BR-2, BR-5, DEC-9-10).
 *
 * - 입력 null(snap=null) 시 idle/calm 폴백으로 처리한다 (BR-5).
 * - bucket이 바뀌면 즉시 새 버킷 첫 멘트로 갱신한다 (FR-2, BR-2).
 * - 8초마다 같은 버킷에서 새 멘트로 회전한다 (FR-3, BR-1). bucket 변경 시 interval
 *   재시작하여 새 버킷 첫 멘트가 8초 동안 유지되도록 한다.
 * - potatoState는 mapPhaseToPotatoState로 산출. discarded는 score-tick으로 emit되지 않으므로
 *   본 hook에서는 직접 다루지 않으며, DiscardModal은 정적으로 stressed를 렌더한다 (BR-6).
 * - 입력 방어: phase=discarded → idle 폴백, total은 0~100 clamp (PRD BR-4 호출자 책임 보정).
 * - noiseLoud bucket 진입/해제 히스테리시스는 score 도메인(Rust audio.rs)의 EMA 필터로
 *   흡수됨. db_ema가 80dB 경계를 짧은 시간 내 반복 교차하지 않으므로 본 hook의 1Hz 버킷
 *   전환은 안정적. 추가 frontend 디바운스 미필요.
 *
 * Phase 9: useReducer(seed) 제거. pickPhrase가 Math.random을 내부화하므로 seed 추적 불필요.
 * useState lazy init으로 첫 렌더 phrase를 currentBucket 기준으로 산출한다. StrictMode가
 * 두 번 호출해도 마지막 결과만 보존되어 사용자 인지 영향 없음 (DEC-9-10).
 */
export function usePhrase(input: UsePhraseInput): UsePhraseOutput {
  const safeCtx = input ?? FALLBACK_INPUT;
  // discarded phase 방어 (BR-6) — usePhrase는 idle/focus/break/complete만 처리.
  const safePhase: Phase = safeCtx.phase === "discarded" ? "idle" : safeCtx.phase;
  // total 0~100 clamp (PRD BR-4 호출자 책임 — JS 레벨 보정).
  const safeTotal = Math.max(0, Math.min(100, safeCtx.total));
  const safeDb = safeCtx.db; // db는 score.ts에서 NaN 방어된 상태로 가정.
  const safeState = safeCtx.state;
  const safeNoiseLoudActive = safeCtx.noiseLoudActive;

  // 매 렌더의 bucket 산출.
  const currentBucket = useMemo(
    () =>
      selectBucket({
        phase: safePhase,
        total: safeTotal,
        db: safeDb,
        noiseLoudActive: safeNoiseLoudActive,
      }),
    [safePhase, safeTotal, safeDb, safeNoiseLoudActive]
  );

  // lazy init: 첫 렌더에서 currentBucket 기준 멘트 1개 산출.
  const [phrase, setPhrase] = useState<string>(() => pickPhrase(currentBucket));
  const [prevBucket, setPrevBucket] = useState<BucketKey>(currentBucket);

  // bucket 변경 시 즉시 새 버킷 첫 멘트로 갱신 (FR-2, BR-2).
  // useEffect 대신 렌더링 중 상태를 조정하여 1-render lag(stale phrase 노출)을 방지한다.
  // React 가이드 "Adjusting state when a prop changes" 패턴.
  if (currentBucket !== prevBucket) {
    setPrevBucket(currentBucket);
    setPhrase(pickPhrase(currentBucket));
  }

  // 8초마다 같은 버킷 내에서 멘트 회전 (FR-3, BR-1). bucket 변경 시 interval 재시작하여
  // 새 버킷 첫 멘트가 8초 동안 유지되도록 currentBucket을 deps에 포함.
  useEffect(() => {
    const handle = setInterval(() => {
      setPhrase(pickPhrase(currentBucket));
    }, PHRASE_ROTATE_MS);
    return () => {
      clearInterval(handle);
    };
  }, [currentBucket]);

  const potatoState = useMemo(
    () =>
      mapPhaseToPotatoState(
        {
          phase: safePhase,
          total: safeTotal,
          db: safeDb,
          noiseLoudActive: safeNoiseLoudActive,
        },
        safeState
      ),
    [safePhase, safeTotal, safeDb, safeNoiseLoudActive, safeState]
  );

  return { bucket: currentBucket, phrase, potatoState };
}
