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

export type PhraseCtx = {
  phase: Phase;
  total: number;
  noiseLoudActive: boolean;
};

export const POTATO_PHRASES: Record<BucketKey, readonly string[]> = {
  idle: [
    "오늘도 화이팅해서 잔디 심어줘 크크",
    "준비 됐어?",
    "오늘도 행복한 하루 보내",
    "안농",
    "난 그냥 너가 죠음. 이유는 묻지마삼.",
    "(대충 네잎클로버 들고 행운 비는 짤)",
    "히히",
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
    "쉴 때는 또 제대로 쉬어줘야하거등요~",
    "완전 잘했어 넌 체고야",
  ],
  sessionComplete: [
    "오늘 하루도 진짜진짜진짜 고생했어 너가 체고야",
    "너는 정말 믓진 사람이야",
    "남은 하루도 행복하게 보내 고생했어",
    "잔디 하나 심었움!! 아싸",
  ],
  noiseLoud: [
    "엇..주변이 조금 시끄럽네...",
    "조용한 곳을 가야 집중이 잘 되거등요~,,",
    "아 안되겠다 조용히해달라고 전화해야겠다. ... 여보세요?",
  ],
  discarded: [
    "엇 이번 건 기록 못 했움...",
    "아쉽다 다음에 또 힘내서 시작해보자 키키",
    "무슨 일 있는 건 아니디? 걱정댄다;;",
  ],
};

/**
 * 점수 엔진의 (phase, total, noiseLoudActive)를 멘트 버킷으로 매핑한다.
 *
 * @param ctx.phase — score.ts의 Phase union 값 ("idle"|"focus"|"break"|"complete"|"discarded").
 * @param ctx.total — 0~100 범위 가정 (PRD BR-4). 범위 초과값(음수/100초과)은 호출자 책임이며,
 *   현재 구현은 음수→focusBroken, 100초과→focusHigh로 폴백한다 (의도된 동작 아님).
 *   score.ts에서 total을 0~100으로 clamp하거나 호출 직전에 보정해야 한다.
 * @param ctx.noiseLoudActive — Rust score::tick의 hysteresis 카운터 활성 플래그.
 *   phase=idle && noiseLoudActive=true에서만 noiseLoud 버킷 진입 (FR-7, BR-3).
 *   PR #11 리뷰: 원래 ctx.db로 분기했으나 db는 더 이상 분기에 사용되지 않아 제거됨.
 */
export function selectBucket(ctx: PhraseCtx): BucketKey {
  if (ctx.phase === "discarded") return "discarded";
  if (ctx.phase === "complete") return "sessionComplete";
  if (ctx.phase === "break") return "break";
  if (ctx.phase === "idle" && ctx.noiseLoudActive) return "noiseLoud";
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
  // Math.floor로 정수 정규화. fractional seed (예: 0.5)에서도 항상 정수 인덱스를 보장 →
  // arr[fractional]이 undefined를 반환하지 않도록 한다.
  return arr[Math.floor(Math.abs(s)) % arr.length];
}

/**
 * 버킷에서 랜덤하게 멘트 1개를 선택한다 (FR-1, BR-1, DEC-9-3).
 *
 * 본 함수는 호출 시점의 `Math.random()`으로 인덱스를 결정한다 — 결정성이 필요한
 * 테스트는 `vi.spyOn(Math, "random")`으로 Math.random을 stub한다.
 * 빈 배열은 `""`을 반환한다 (DEC-9-3 가드 보존).
 *
 * `__pickPhraseFromArray`(seed 기반)는 시그니처/구현을 그대로 유지하여 빈 배열/단일
 * 원소 회귀 테스트를 보존한다 (BR-2).
 */
export function pickPhrase(bucket: BucketKey): string {
  const arr = POTATO_PHRASES[bucket];
  if (arr.length === 0) return "";
  // Math.random spy가 1.0 또는 NaN을 반환하면 인덱스가 범위 밖이 될 수 있다.
  // [0, arr.length-1] 구간으로 clamp하고, 그래도 undefined라면 첫 원소로 폴백.
  const r = Math.random();
  const raw = Number.isFinite(r) ? Math.floor(r * arr.length) : 0;
  const idx = Math.max(0, Math.min(raw, arr.length - 1));
  return arr[idx] ?? arr[0];
}

export const VALID_POTATO_STATES: ReadonlySet<PotatoState> = new Set([
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
  // Phase 11 MA-1: noiseLoudActive 기반으로 selectBucket과 동기 (표정-멘트 동시 전환).
  if (ctx.phase === "idle" && ctx.noiseLoudActive) return "covering";
  if (ctx.phase === "idle") return "calm";
  // 호출자가 invalid engineState (undefined/null/union 외)를 넘기면 'calm' 폴백 (FR-22 idle 기본값과 동일).
  return VALID_POTATO_STATES.has(engineState) ? engineState : "calm";
}
