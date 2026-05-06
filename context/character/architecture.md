# character 아키텍처

## 5단계 SVG 컴포넌트

```ts
type PotatoState = 'focused' | 'calm' | 'distracted' | 'covering' | 'stressed';

<Potato state={state} size={140} animated={true} />
```

- viewBox `0 0 200 200`, 호빵형 몸통(rx≈60, ry≈53)
- 표정은 state별 분기 — 눈·볼·입·기타(땀/눈물)
- 새싹은 `<Sprout state />` — `Potato.tsx` 내부 비-export 컴포넌트. 색은 `SPROUT_FILL[state]` Tailwind 클래스로 자동 매핑되므로 외부에서 팔레트를 주입하지 않는다.
- 애니메이션: `mh-bob` (3.2s ease-in-out, 살짝 위아래)

## 표정 매핑 규칙

| state | 눈 | 입 | 부속 |
|-------|-----|-----|------|
| focused | 웃는 반달 | 큰 미소 | 볼 ↑ 진하게 |
| calm | 점 | 작은 반달 | 볼 옅게 |
| distracted | 옆으로 쏠린 점 | 살짝 처진 입 | — |
| covering | 슬픈 점 | 〜 흐릿한 입 | 눈물 (왼쪽) |
| stressed | × 표시 | 동그란 입(O) | 머리 위 땀방울 |

## 멘트 시스템

```ts
const POTATO_PHRASES = {
  idle: ['오늘도 화이팅해서 잔디 심어줘 크크', '준비 됐어?', '오늘도 행복한 하루 보내'],
  focusHigh: [',, 반했심', '너가 체고야', '기여워죽겟슨', /* … 8개 */],
  focusLow: ['아 모하심~~', '딴 짓한 거 다 봣슨!!', '좀만 더 힘내서 해보아오'],
  focusBroken: ['아 진짜 모하심!!!!!!', '도둑맞은 집중력 에바슨', '칵시 그냥'],
  break: ['물 한잔 묵고 와 크크', '푹 쉬어', '못본 연락 한번 봐주기~!'],
  sessionComplete: ['오늘 하루도 진짜진짜진짜 고생했어 너가 체고야', /* …3개 */],
  noiseLoud: ['시끄러워서 잠 못자 크크', /* …4개 */],
  discarded: ['이번 건 기록 못 했어…', /* …3개 */],
};
```

### 버킷 선택 로직

```ts
function selectBucket({ phase, total, db }: Ctx): keyof typeof POTATO_PHRASES {
  if (phase === 'discarded') return 'discarded';
  if (phase === 'complete') return 'sessionComplete';
  if (phase === 'break') return 'break';
  if (phase === 'idle' && db > 80) return 'noiseLoud';
  if (phase === 'idle') return 'idle';
  // focus
  if (total >= 80) return 'focusHigh';
  if (total >= 40) return 'focusLow';
  return 'focusBroken';
}
```

### pickPhrase — Math.random 인덱스 (PR #9)

```ts
function pickPhrase(bucket: BucketKey): string {
  const arr = POTATO_PHRASES[bucket];
  return arr.length === 0 ? "" : arr[Math.floor(Math.random() * arr.length)];
}

/** @internal — 빈 배열 가드 검증용. 시그니처 보존 (BR-2). */
function __pickPhraseFromArray(arr: readonly string[], seed: number): string {
  // 기존 시그니처 그대로 유지하여 단위 테스트 (`__pickPhraseFromArray — 빈 배열 / 단일 원소`) 통과 보장.
  // 운영 호출자는 새 `pickPhrase(bucket)`만 사용한다.
}
```

- `pickPhrase`는 단일 인자 `bucket`만 받는다 (seed 인자 제거)
- 인덱스는 `Math.floor(Math.random() * arr.length)` — 매 호출마다 새 랜덤
- 빈 배열 가드는 미래 회귀 방어를 위해 보존 (DEC-9-3)
- 결정성 검증은 `vi.spyOn(Math, "random").mockReturnValue(...)`로 테스트에서 보장

### usePhrase — useState 단순화 (PR #9 / DEC-9-10)

reducer/seed 추적을 제거하고 useState 두 개로 단순화한다.

```ts
const [phrase, setPhrase] = useState<string>(() => pickPhrase(currentBucket));
const [prevBucket, setPrevBucket] = useState<BucketKey>(currentBucket);

// bucket 변경 시 렌더링 중 상태 조정 (1-render lag 회피, PR #9 리뷰 반영)
if (currentBucket !== prevBucket) {
  setPrevBucket(currentBucket);
  setPhrase(pickPhrase(currentBucket));
}

useEffect(() => {
  const h = setInterval(() => setPhrase(pickPhrase(currentBucket)), PHRASE_ROTATE_MS);
  return () => clearInterval(h);
}, [currentBucket]);  // 8s 회전, bucket 변경 시 재시작
```

- StrictMode lazy init 이중 호출은 결과만 보존되므로 사용자 노출 영향 없음
- bucket 변경 시 8s interval이 재시작되어 새 버킷 첫 멘트가 8초 동안 유지
- React 권장 패턴 ["Adjusting state when a prop changes"](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes) — `useEffect` 비동기 갱신은 1-render lag(배경/표정은 새 bucket인데 phrase는 이전 bucket)을 일으키므로 렌더링 중 동기 조정으로 변경 (PR #9 gemini-code-assist 리뷰)

### DiscardModal — 모듈 1회 평가 (PR #9 결정)

`DiscardModal`은 score-tick으로 emit되지 않으므로 `usePhrase`를 거치지 않고 `pickPhrase("discarded")`로 첫 멘트를 정적 렌더한다. 모듈 로드 시 1회만 `Math.random`이 평가되어 같은 앱 실행 세션 내에서 동일 멘트를 반복 노출한다 — 의도된 정책 (사용자 결정 — 모달 멘트는 세션 내 고정).

### mapPhaseToPotatoState (FR-22 / FR-23 유틸)

`useScoreTick`의 `phase`/`db`와 score engine의 `state`를 입력으로, 마운트 시점에 `<Potato state={...} />`로 넘길 표정을 산출하는 유틸. 마운트 코드(timer 도메인)가 사용한다.

```ts
const VALID_POTATO_STATES: ReadonlySet<PotatoState> = new Set([
  "focused", "calm", "distracted", "covering", "stressed",
]);

function mapPhaseToPotatoState(ctx: PhraseCtx, engineState: PotatoState): PotatoState {
  if (ctx.phase === "discarded") return "stressed";              // FR-23 고정
  if (ctx.phase === "idle" && ctx.db > 80) return "covering";    // FR-22 idle 소음 일시 전환
  if (ctx.phase === "idle") return "calm";                       // FR-22 idle 기본
  // focus / break / complete: 엔진 state 그대로 통과 (시나리오 6,7).
  // 호출자가 invalid engineState (undefined/null/union 외)를 넘기면 'calm' 폴백.
  return VALID_POTATO_STATES.has(engineState) ? engineState : "calm";
}
```

## 트레이 아이콘 (`tray` 도메인 참조)

- 22×22 라인 아트는 `PotatoTrayIcon` 컴포넌트 (이미 시안에 작성됨)
- 빌드 시 OS별 자산으로 변환 — `tray/architecture.md` 참조

## 부속 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `<SpeechBubble text color>` | 모하 옆 말풍선. 라운딩 14 + 1.5px ink + 2px shadow + 좌하단 45° 회전 사각 꼬리. `text === ""` 시 자체적으로 `null` 렌더 (BR-3 / AC-21). |
| `<Sprout state>` | 머리 위 새싹 SVG (state별 5종). `Potato.tsx` 내부 비-export 컴포넌트. 잎 색은 내부 `SPROUT_FILL[state]` 매핑 (`fill-sproutVivid` 등). 줄기·잎 좌/우 path 2개에 동일 fill을 적용한다. |

## sprout 5색 토큰 (확정 hex)

`tailwind.config.ts:extend.colors`에 등록. 잎 fill에 `fill-sproutVivid` 등 클래스로 참조.

| 토큰 | hex | 적용 단계 | 출처 |
|------|-----|-----------|------|
| `sproutVivid`   | `#4CAF50` | focused | 그린 계열 제안값 (시안 부재 — 입수 시 단일 파일 교체) |
| `sproutFresh`   | `#81C784` | calm | 동상 |
| `sproutNeutral` | `#A5D6A7` | distracted | 동상 |
| `sproutDry`     | `#C8E6C9` | covering | 동상 |
| `sproutWilt`    | `#BDBDBD` | stressed | 동상 |

## 키프레임

```css
@keyframes mh-bob {
  0%, 100% { transform: translateY(0) rotate(0); }
  50%      { transform: translateY(-3px) rotate(-1deg); }
}
@keyframes mh-pulse {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 1; }
}
```

- `mh-bob` 3.2s ease-in-out infinite — 모든 모하 SVG 기본 (`animated=true` 시)
- `mh-pulse` 0.6s ease-in-out infinite — 점수 변동, grace="looking" 시 👀 이모지에 적용
- `mhpulse` (alias) — BR-7 호환용. timer 도메인이 무하이픈 키를 사용할 때 동일 keyframe으로 폴백.

## 모드별 표정 분기 (Idle 트레이는 `tray` 도메인)

- Focus / Break: Score Engine의 5단계 state 그대로
- Idle (팝업 안 모하): `calm` 고정. dB > 80일 때 `covering` 정도로 일시 변경 (멘트가 noiseLoud일 때)
- Discard 모달 안 모하: `stressed` 고정 (절망 표정)
