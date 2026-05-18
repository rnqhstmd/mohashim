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
  | "noiseMedium"
  | "discarded";

export type PhraseCtx = {
  phase: Phase;
  total: number;
  noiseLoudActive: boolean;
  noiseMediumActive: boolean;
};

export const POTATO_PHRASES: Record<BucketKey, readonly string[]> = {
  idle: [
    "오늘도 화이팅해서\n잔디 심어줘 크크",
    "준비 됐어?",
    "오늘도 행복한 하루 보내",
    "안농",
    "난 그냥 너가 죠음.\n이유는 묻지마삼.",
    "(대충 네잎클로버 들고\n행운 비는 짤)",
    "히히",
    "군모밍",
    "군모밀",
    "아~~ 쪼금 보고싶네.\n아주 쪼금.",
    "오늘 쫌 꼬질하신데오~",
    "안되겠다.\n이따 옷 냄새 좀 맡아봐야겠다",
    "안녕하데오?",
  ],
  focusHigh: [
    ",, 반했심",
    "너가 체고야",
    "기여워죽겟슨",
    "가끔 너가 너무 좋아서\n어쩔 줄 모르겠는 순간이 있어",
    "사랑해",
    "정말 고생많았어 크크",
    "난 있잖아..\n너가 참 죠타,,",
    "아 왜 이렇게\n플러팅하심~~,,",
    "그거 알아?\n오늘 쫌 예쁘심.",
    "자꾸 이러면 나랑 데이트갈지도~?",
    "집중 참 잘했슨.\n왠줄 알아?",
    "퀘스트 보상: 고양이 소리 잘 내는 법\n애옹 발음해보기",
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
    "쉴 때는 또 제대로\n쉬어줘야하거등요~",
    "완전 잘했어 넌 체고야",
  ],
  sessionComplete: [
    "오늘 하루도 진짜진짜진짜\n고생했어 너가 체고야",
    "너는 정말 믓진 사람이야",
    "남은 하루도 행복하게\n보내 고생했어",
    "잔디 하나 심었움!! 아싸",
  ],
  noiseLoud: [
    "엇..주변이 조금\n시끄럽네...",
    "조용한 곳을 가야\n집중이 잘 되거등요~,,",
    "아 안되겠다 조용히해달라고\n전화해야겠다. ... 여보세요?",
  ],
  noiseMedium: [
    "음~ 좀 시끄러운 것 같은데?",
  ],
  discarded: [
    "엇 이번 건 기록 못 했움...",
    "아쉽다 다음에 또 힘내서\n시작해보자 키키",
    "무슨 일 있는 건 아니디?\n걱정댄다;;",
  ],
};

/**
 * 점수 엔진의 (phase, total, noiseLoudActive, noiseMediumActive)를 멘트 버킷으로 매핑한다.
 *
 * 소음 3단계 분리: noiseLoud(80+) > noiseMedium(60-80) > phase 기반 멘트.
 * 소음 멘트는 idle/focus/break 모든 phase에서 점수 기반 멘트보다 우선 출력된다.
 *
 * @param ctx.noiseLoudActive — Rust apply_noise_hysteresis의 loud 활성 플래그 (5초 hysteresis).
 * @param ctx.noiseMediumActive — Rust apply_noise_hysteresis의 medium 활성 플래그 (5초 hysteresis).
 *   loud와 상호 배타 (BR-1) — 둘 다 true인 입력은 loud 우선 분기로 방어.
 */
export function selectBucket(ctx: PhraseCtx): BucketKey {
  if (ctx.phase === "discarded") return "discarded";
  if (ctx.phase === "complete") return "sessionComplete";
  if (ctx.noiseLoudActive) return "noiseLoud";
  if (ctx.noiseMediumActive) return "noiseMedium";
  if (ctx.phase === "break") return "break";
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
