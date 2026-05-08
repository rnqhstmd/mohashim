# grass 구현 추적

## 범례

- ✅ 반영됨 — 코드에 구현 완료
- ⬜ 미반영 — 정책/설계만 확정, 코드 미구현

## 잔디

| ID | 항목 | 상태 | 비고 |
|----|------|------|------|
| FR-16 | 세션이 완전히 끝났을 때(집중+휴식)만 평균 점수 로컬 DB 저장 | ✅ | PR #8 — Rust 단일 writer (R-G1) + score::shared 누적 atomic 평균 (R-G2) |
| FR-17 | 28일 윈도우 잔디 레벨 0~4 계산 | ✅ | PR #8 — D-G4 월별 달력 채택. ContributionGraph 7×N 그리드 + monthOffset 네비 |
| FR-28 | 잔디 데이터 모델 확장 + 연도 자동 정리 (Phase 10) | ✅ | [PR #10](https://github.com/rnqhstmd/mohashim/pull/10). 연도 변경 시 이전 데이터 보존 + 자동 archive |
| FR-29 | Todo 기반 잔디 + gridLevel H-5 역전 해소 (Phase 12) | ✅ | [PR #13](https://github.com/rnqhstmd/mohashim/pull/13). todos_done 적재 도입 |
| FR-30 | 잔디 날짜별 상세 조회 — DayDetailPanel (해당 날짜 평균 점수/세션/완료한 todo 노출) | ✅ | [PR #14](https://github.com/rnqhstmd/mohashim/pull/14) — Phase 13 + cross-review stale 차단(1c0b918). 9c1583a — drain idiomatic + key 안정 |

## 공유 카드

| ID | 항목 | 상태 | 비고 |
|----|------|------|------|
| FR-18 | 공유 카드 — 전용 `<ShareCard>` 템플릿(4주 잔디 + 모하 + 누적 통계)을 1080×1080 PNG로 합성해 클립보드 복사. 순수 SVG → XMLSerializer → Canvas → toBlob('image/png') | ✅ | PR #8 — 합성 파이프라인 + 뼈대 SVG 4 그룹 (워터마크/잔디/통계/캐릭터) + clipboard-manager 등록. 정밀 좌표는 DEC-16 후속 |
| FR-31 | ShareCard 재설계 + SharePreviewModal — 클립보드 복사 전 미리보기 + 1080×1080 시안 확정 | ✅ | [PR #17](https://github.com/rnqhstmd/mohashim/pull/17) — Phase 16. dbe2e54 — 1초 SLA 복원 + a11y |

## 디자인 결정

| ID | 항목 | 상태 | 비고 |
|----|------|------|------|
| DEC-3 | 공유는 화면 캡처가 아닌 전용 템플릿 합성 방식 | ✅ | PR #8 — ShareCard 전용 템플릿 채택 |
| DEC-5 | 공유 합성 옵션 A — 순수 SVG → Canvas → PNG, 외부 합성 라이브러리 미사용 | ✅ | PR #8 — XMLSerializer + Canvas drawImage + toBlob, 외부 라이브러리 의존 zero (clipboard-manager만) |
| DEC-16 | ShareCard 1080×1080 픽셀 레이아웃은 별도 디자인 작업 | ✅ | [PR #17](https://github.com/rnqhstmd/mohashim/pull/17) — Phase 16 ShareCard 재설계로 시안 확정 (FR-31) |
