import type { Phase, LiveState } from "./score";

export type PotatoState = LiveState;

export type BucketKey =
  | "idle"
  | "focusHigh"
  | "focusLow"
  | "focusBroken"
  | "break"
  | "sessionComplete"
  | "noiseLoud"
  | "discarded";

export type PhraseCtx = { phase: Phase; total: number; db: number };

export const POTATO_PHRASES: Record<BucketKey, readonly string[]> = {
  idle: [
    "오늘도 화이팅해서 잔디 심어줘 크크",
    "준비 됐어?",
    "오늘도 행복한 하루 보내",
  ],
  focusHigh: [
    ",, 반했심",
    "너가 체고야",
    "기여워죽겟슨",
    "가끔 너가 너무 좋아서 어쩔 줄 모르겠는 순간이 있어",
    "사랑해",
    "정말 고생많았어 크크",
    "난 있잖아.. 너가 참 죠타,,",
    "아 왜 이렇게 플러팅하심~~,,",
  ],
  focusLow: [
    "아 모하심~~",
    "딴 짓한 거 다 봣슨!!",
    "좀만 더 힘내서 해보아오",
  ],
  focusBroken: [
    "아 진짜 모하심!!!!!!",
    "도둑맞은 집중력 에바슨",
    "칵시 그냥",
  ],
  break: [
    "물 한잔 묵고 와 크크",
    "푹 쉬어",
    "못본 연락 한번 봐주기~!",
  ],
  sessionComplete: [
    "오늘 하루도 진짜진짜진짜 고생했어 너가 체고야",
    "너는 정말 믓진 사람이야",
    "남은 하루도 행복하게 보내 고생했어",
  ],
  noiseLoud: [
    "시끄러워서 잠 못자 크크",
    "이 소음 실화심??",
    "귀 막고 싶은 거 참는 중",
    "조용히 좀 해줘 크크",
  ],
  discarded: [
    "이번 건 기록 못 했어…",
    "아 아깝다 진짜",
    "다음엔 꼭 끝내줘 크크",
  ],
};

/**
 * 점수 엔진의 (phase, total, db)를 멘트 버킷으로 매핑한다.
 *
 * @param ctx.phase — score.ts의 Phase union 값 ("idle"|"focus"|"break"|"complete"|"discarded").
 * @param ctx.total — 0~100 범위 가정 (PRD BR-4). 범위 초과값(음수/100초과)은 호출자 책임이며,
 *   현재 구현은 음수→focusBroken, 100초과→focusHigh로 폴백한다 (의도된 동작 아님).
 *   score.ts에서 total을 0~100으로 clamp하거나 호출 직전에 보정해야 한다.
 * @param ctx.db — 데시벨 값. db>80 + phase=idle일 때만 noiseLoud로 분기.
 */
export function selectBucket(ctx: PhraseCtx): BucketKey {
  if (ctx.phase === "discarded") return "discarded";
  if (ctx.phase === "complete") return "sessionComplete";
  if (ctx.phase === "break") return "break";
  if (ctx.phase === "idle" && ctx.db > 80) return "noiseLoud";
  if (ctx.phase === "idle") return "idle";
  if (ctx.total >= 80) return "focusHigh";
  if (ctx.total >= 40) return "focusLow";
  return "focusBroken";
}

/** @internal — 빈 배열 가드 검증용. 운영 호출자는 pickPhrase만 사용. */
export function __pickPhraseFromArray(
  arr: readonly string[],
  seed: number,
): string {
  if (arr.length === 0) return "";
  const s = Number.isFinite(seed) ? seed : 0;
  return arr[Math.abs(s) % arr.length];
}

export function pickPhrase(bucket: BucketKey, seed: number): string {
  return __pickPhraseFromArray(POTATO_PHRASES[bucket], seed);
}

const VALID_POTATO_STATES: ReadonlySet<PotatoState> = new Set([
  "focused",
  "calm",
  "distracted",
  "covering",
  "stressed",
]);

export function mapPhaseToPotatoState(
  ctx: PhraseCtx,
  engineState: PotatoState,
): PotatoState {
  if (ctx.phase === "discarded") return "stressed";
  if (ctx.phase === "idle" && ctx.db > 80) return "covering";
  if (ctx.phase === "idle") return "calm";
  // 호출자가 invalid engineState (undefined/null/union 외)를 넘기면 'calm' 폴백 (FR-22 idle 기본값과 동일).
  return VALID_POTATO_STATES.has(engineState) ? engineState : "calm";
}
