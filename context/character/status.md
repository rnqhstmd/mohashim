# character 구현 추적

## 범례

- ✅ 반영됨 — 코드에 구현 완료
- ⬜ 미반영 — 정책/설계만 확정, 코드 미구현

## 캐릭터 + 멘트

| ID | 항목 | 상태 | 비고 |
|----|------|------|------|
| FR-19 | 모하 5단계 표정(focused/calm/distracted/covering/stressed) + 새싹 sprout | ✅ | [PR #3](https://github.com/rnqhstmd/mohashim/pull/3). sprout 5색은 그린 계열 제안값(시안 입수 시 `tailwind.config.ts` 단일 파일 교체) |
| FR-20 | 멘트 8 버킷 무작위 노출 (idle/focusHigh/focusLow/focusBroken/break/sessionComplete/noiseLoud/discarded) | ✅ | [PR #3](https://github.com/rnqhstmd/mohashim/pull/3). seed 기반 회전 + NaN/Infinity 폴백 + 빈 배열 가드. noiseLoud/discarded는 architecture.md 예시 + 동일 톤 보완 (기획 리뷰 시 교체 가능) |
