import { useEffect, useMemo, useReducer } from "react";
import {
  mapPhaseToPotatoState,
  pickPhrase,
  selectBucket,
  type BucketKey,
  type PotatoState,
} from "./phrases";
import type { LiveState, Phase } from "./score";

export type UsePhraseInput =
  | { phase: Phase; total: number; db: number; state: LiveState }
  | null;

export type UsePhraseOutput = {
  bucket: BucketKey;
  phrase: string;
  potatoState: PotatoState;
};

/** 멘트 회전 주기 (BR-1: 8초). score-tick(1Hz)마다 멘트가 바뀌지 않도록 분리. */
export const PHRASE_ROTATE_MS = 8000;

const FALLBACK_INPUT: { phase: Phase; total: number; db: number; state: LiveState } = {
  phase: "idle",
  total: 0,
  db: 0,
  state: "calm",
};

type State = { bucket: BucketKey; seed: number };
type Action =
  | { type: "set_bucket"; bucket: BucketKey }
  | { type: "tick" };

/**
 * bucket과 seed를 단일 state로 묶어 동기 갱신한다 (HIGH 1+2+4 대응).
 *
 * - set_bucket: bucket 동일 시 변경 없음(StrictMode 이중 invoke no-op),
 *   다르면 seed=0으로 동기 reset (BR-2).
 * - tick: seed +1 (BR-1).
 *
 * setSeed(0) + setInterval 분리 effect의 batching 레이스를 제거한다.
 */
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set_bucket":
      if (state.bucket === action.bucket) return state;
      return { bucket: action.bucket, seed: 0 };
    case "tick":
      return { ...state, seed: state.seed + 1 };
  }
}

/**
 * 멘트 회전 + potatoState 산출 hook (FR-34, BR-1, BR-2, BR-3, BR-5).
 *
 * - 입력 null(snap=null) 시 idle/calm 폴백으로 처리한다 (BR-5).
 * - bucket이 바뀌면 reducer가 seed=0으로 동기 reset하여 새 버킷 첫 멘트부터 표시한다 (BR-2).
 * - 8초마다 dispatch({type:"tick"})로 seed를 1씩 증가시켜 동일 버킷 내에서 멘트를 순환한다 (BR-1).
 * - potatoState는 mapPhaseToPotatoState로 산출. discarded는 score-tick으로 emit되지 않으므로
 *   본 hook에서는 직접 다루지 않으며, DiscardModal은 정적으로 stressed를 렌더한다 (BR-6).
 * - 입력 방어: phase=discarded → idle 폴백, total은 0~100 clamp (PRD BR-4 호출자 책임 보정).
 * - noiseLoud bucket 진입/해제 히스테리시스는 score 도메인(Rust audio.rs)의 EMA 필터로
 *   흡수됨. db_ema가 80dB 경계를 짧은 시간 내 반복 교차하지 않으므로 본 hook의 1Hz 버킷
 *   전환은 안정적. 추가 frontend 디바운스 미필요.
 */
export function usePhrase(input: UsePhraseInput): UsePhraseOutput {
  const safeCtx = input ?? FALLBACK_INPUT;
  // discarded phase 방어 (BR-6) — usePhrase는 idle/focus/break/complete만 처리.
  const safePhase: Phase = safeCtx.phase === "discarded" ? "idle" : safeCtx.phase;
  // total 0~100 clamp (PRD BR-4 호출자 책임 — JS 레벨 보정).
  const safeTotal = Math.max(0, Math.min(100, safeCtx.total));
  const safeDb = safeCtx.db; // db는 score.ts에서 NaN 방어된 상태로 가정.
  const safeState = safeCtx.state;

  // initialBucket은 첫 렌더 1회만 사용. 이후는 set_bucket dispatch로 갱신.
  const initialBucket = useMemo(
    () => selectBucket({ phase: safePhase, total: safeTotal, db: safeDb }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [state, dispatch] = useReducer(reducer, {
    bucket: initialBucket,
    seed: 0,
  });

  // 매 렌더의 bucket 산출.
  const currentBucket = useMemo(
    () => selectBucket({ phase: safePhase, total: safeTotal, db: safeDb }),
    [safePhase, safeTotal, safeDb]
  );

  // bucket 변경 감지 → reducer가 seed=0 동기 reset. StrictMode 이중 invoke 시
  // 동일 bucket이면 reducer가 state를 그대로 반환하여 no-op.
  useEffect(() => {
    dispatch({ type: "set_bucket", bucket: currentBucket });
  }, [currentBucket]);

  // 8초마다 seed 증가. mount 시 1회만 등록 — bucket 변경에도 interval 유지 (절대 8초 주기).
  // bucket 변경 시 seed=0 reset은 reducer에서 처리되므로 다음 tick은 seed=1로 진행.
  useEffect(() => {
    const handle = setInterval(() => {
      dispatch({ type: "tick" });
    }, PHRASE_ROTATE_MS);
    return () => {
      clearInterval(handle);
    };
  }, []);

  const phrase = useMemo(
    () => pickPhrase(state.bucket, state.seed),
    [state.bucket, state.seed]
  );

  const potatoState = useMemo(
    () =>
      mapPhaseToPotatoState(
        { phase: safePhase, total: safeTotal, db: safeDb },
        safeState
      ),
    [safePhase, safeTotal, safeDb, safeState]
  );

  return { bucket: state.bucket, phrase, potatoState };
}
