# character 구현 추적

## 범례

- ✅ 반영됨 — 코드에 구현 완료
- ⬜ 미반영 — 정책/설계만 확정, 코드 미구현

## 캐릭터 + 멘트

| ID | 항목 | 상태 | 비고 |
|----|------|------|------|
| FR-19 | 모하 5단계 표정(focused/calm/distracted/covering/stressed) + 새싹 sprout | ✅ | [PR #3](https://github.com/rnqhstmd/mohashim/pull/3). sprout 5색은 그린 계열 제안값(시안 입수 시 `tailwind.config.ts` 단일 파일 교체) |
| FR-19-S | Sprout 5단계 SVG (Potato 내부, 색 토큰 5종 매핑) | ✅ | [PR #3](https://github.com/rnqhstmd/mohashim/pull/3). `Potato.tsx` 내부 비-export. `fill-sproutVivid/Fresh/Neutral/Dry/Wilt` 토큰 |
| FR-20 | 멘트 8 버킷 무작위 노출 (idle/focusHigh/focusLow/focusBroken/break/sessionComplete/noiseLoud/discarded) | ✅ | [PR #3](https://github.com/rnqhstmd/mohashim/pull/3) + [PR #11](https://github.com/rnqhstmd/mohashim/pull/11) + [PR #23](https://github.com/rnqhstmd/mohashim/pull/23). seed 기반 회전 + NaN/Infinity 폴백 + 빈 배열 가드. PR #11 — ANALYSIS.md §6 확정 문안으로 5버킷(idle 7/break 5/sessionComplete 4/noiseLoud 3 전체교체/discarded 3 전체교체) 갱신. focusHigh/focusLow/focusBroken 불변 (BR-2). PR #23 — 말풍선 회전 주기 8초 → 15분 (c912392), idle chip 별도 주기로 분리 (9355298) |
| FR-20-S | SpeechBubble 컴포넌트 (라운딩 14 + 1.5px ink + 2px shadow + 좌하단 45° 꼬리) | ✅ | [PR #3](https://github.com/rnqhstmd/mohashim/pull/3). `text === ""` 자체 가드 (BR-3 / AC-21 정합) |
| FR-21 | Tailwind 키프레임(`mh-bob` 3.2s / `mh-pulse` 0.6s) + sprout 5색 토큰 | ✅ | [PR #3](https://github.com/rnqhstmd/mohashim/pull/3). timer 도메인의 `mhpulse`(무하이픈)는 phase-3 머지 시 자체 keyframe(1.2s scale, PRD AC-30)으로 통합되어 BR-7 alias 폴백 불필요 — character는 `mh-bob`/`mh-pulse` 직접 사용 |
| FR-22 | Idle calm 고정 + dB>80 시 covering 일시 전환 (`mapPhaseToPotatoState` 유틸) | ✅ | [PR #3](https://github.com/rnqhstmd/mohashim/pull/3) + [PR #5](https://github.com/rnqhstmd/mohashim/pull/5) MainScreen 통합 완료. usePhrase hook이 score-tick → mapPhaseToPotatoState 호출 |
| FR-23 | Discarded stressed 고정 (`mapPhaseToPotatoState` 분기) | ✅ | [PR #3](https://github.com/rnqhstmd/mohashim/pull/3) + [PR #5](https://github.com/rnqhstmd/mohashim/pull/5) DiscardModal 통합 완료. stressed Potato(72, animated) + discarded 첫 멘트 정적 렌더 |
