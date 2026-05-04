# character 아키텍처

## 5단계 SVG 컴포넌트

```ts
type PotatoState = 'focused' | 'calm' | 'distracted' | 'covering' | 'stressed';

<Potato state={state} size={140} animated={true} />
```

- viewBox `0 0 200 200`, 호빵형 몸통(rx≈60, ry≈53)
- 표정은 state별 분기 — 눈·볼·입·기타(땀/눈물)
- 새싹은 `<Sprout state={state} P={POTATO_PALETTE.light} />`
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

### pickPhrase

```ts
function pickPhrase(bucket: keyof typeof POTATO_PHRASES, seed: number): string {
  const arr = POTATO_PHRASES[bucket];
  return arr[Math.abs(seed) % arr.length];
}
```

- seed는 phase/total/timestamp 등에서 도출 (UI 깜빡임 방지를 위해 빠르게 변하지 않도록)
- 같은 버킷 내 중복은 seed 회전으로 자연 분산

## 트레이 아이콘 (`tray` 도메인 참조)

- 22×22 라인 아트는 `PotatoTrayIcon` 컴포넌트 (이미 시안에 작성됨)
- 빌드 시 OS별 자산으로 변환 — `tray/architecture.md` 참조

## 부속 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `<SpeechBubble text color>` | 모하 옆 말풍선. 라운딩 14 + 1.5px ink + 2px shadow + 좌하단 45° 회전 사각 꼬리 |
| `<Sprout state P>` | 머리 위 새싹 SVG (state별 5종). Body 안쪽 첫 자식으로 렌더 |

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

## 모드별 표정 분기 (Idle 트레이는 `tray` 도메인)

- Focus / Break: Score Engine의 5단계 state 그대로
- Idle (팝업 안 모하): `calm` 고정. dB > 80일 때 `covering` 정도로 일시 변경 (멘트가 noiseLoud일 때)
- Discard 모달 안 모하: `stressed` 고정 (절망 표정)
