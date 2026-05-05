# todo 아키텍처

## 데이터 모델

```ts
type WorkTag = { id: string; emoji: string; label: string; color: string };
type Location = { id: string; emoji: string; label: string; color: string };
type Todo = {
  id: string;        // 't' + Date.now()
  text: string;
  done: boolean;
  tag: string | null;   // WorkTag.id
  loc: string | null;   // Location.id
  active: boolean;      // 다음 뽀모도로 대상 표시
};
```

## 자동 정렬 규칙

```ts
todos.sort((a, b) => {
  if (a.done !== b.done) return a.done ? 1 : -1;          // 완료는 하단
  if (a.active !== b.active) return a.active ? -1 : 1;     // active 우선
  return 0;                                                // 입력 순서 유지
});
```

- 토글 시 즉시 재정렬 (애니메이션 없이 위치 점프)
- 롤백(완료 → 미완료) = active=false라도 최상단 복귀

## 화면 구성

| 화면 | 위치 | 내용 |
|------|------|------|
| Todos Tab | 메인 팝업 첫 탭 | 정렬된 목록 + "+ 새 할 일" 입력 + active 표시 |
| WorkTagEditorScreen | Settings → 작업 태그 | 6개 기본 + 사용자 커스텀. 추가/삭제/편집 |
| LocationEditorScreen | Settings → 위치 태그 | 4개 기본 + 사용자 커스텀. 추가/삭제/편집 |

## 입력 UX

- 텍스트 입력 + ＋ 아이콘
- 🏷 버튼 클릭 → 작업 태그 picker (가로 스크롤 칩)
- 📍 버튼 클릭 → 위치 태그 picker
- Enter 또는 "추가" 버튼으로 등록

## Storage 키 (lifecycle 도메인 참조)

- `todos`: Todo[]
- `work_tags`: WorkTag[] (없으면 기본 6종 시드)
- `locations`: Location[] (없으면 기본 4종 시드)

## UI 컴포넌트

| 컴포넌트 | 책임 |
|----------|------|
| `<MetaChip tag size active removable>` | 일반 태그 칩 — 입력 바·편집 화면 |
| `<FlatTag tag>` | 미니 태그 — 투두 행 표시용 |
| `<EmptyChip>` | "선택 안 함" placeholder, dashed 보더 |
| `<TagListEditor title items kind maxItems>` | 공유 편집 컴포넌트. WorkTagEditorScreen·LocationEditorScreen이 래핑 |

## TagListEditor 동작

- 각 항목 카드: 좌측 컬러 박스(이모지) + 라벨 + ✎/✓ 편집 토글 + × 삭제
- 편집 모드 활성 시: 이모지 picker(18종 그리드) + 색상 picker(10종 원형)
- 새 항목: dashed 보더 "＋ 새 태그/장소 추가" 버튼
- **maxItems 제한**: 작업 태그 = 5개 / 위치 태그 = 제한 없음
- dirty 감지 시 푸터 "저장" 활성, 닫기 시 confirm
- 항목 1개 미만으로 줄일 수 없음 (최소 1개 보장)

## Active Todo 시각 디테일

- 배경: linear-gradient(135deg, #fff8e0, #fff2c4)
- 보더: 1.5px ACCENT
- 좌측 4×24 막대: ACCENT_DARK
- 그림자: 0 4px 12px rgba(244,209,96,0.35)
- 텍스트: fontWeight 800

## 뽀모도로와 독립

- 투두는 timer 모드와 무관하게 항상 추가/완료/삭제 가능
- "▶" 액션 = 해당 todo를 active로 표시 후 timer Focus 진입 (timer 도메인 호출)

## 확정 결정 사항 (Phase 6 PR #6)

| 분류 | ID | 항목 | 확정 |
|------|----|------|------|
| PRD | D-1 | 기본 태그 시드 시점 | TS 부트 (`App.tsx` `initStorage()` 직후 `seedDefaultTags()`). Rust 변경 없음. |
| PRD | D-2 | active 토글 위치 | 행 우측 끝 ▶/★ 아이콘 (체크박스 분리) |
| PRD | D-3 | 태그 삭제 confirm | 미표시, 즉시 draft에서 제거 |
| PRD | D-4 | 투두 항목 삭제 UI | 좌측 스와이프 → 삭제 버튼 노출 |
| PRD | D-5 | 롤백 정렬 위치 | 미완료 영역 최상단 (active 항목이 있으면 그 바로 아래) |
| User | U-1 | todos 탭 통합 | 옵션 A — `<TodosTab />`이 phase 분기로 PomodoroCard/FocusStartButton 내장 |
| User | U-2 | 기본 위치 태그 명칭 | 사무실 → **회사** |
| User | U-3 | 태그 갱신 반영 | `<TodosTab key={tab} />` 재마운트 |
| User | U-4 | BR-5 시점 | 일괄 저장 (TagListEditor onSave에서 setTodos+removeTagRefs+flush) |
| Critic | M-1 | 옵션 A 명세 | TodosTab phase 분기 + handleFocusStart 보존, IdleScreen/PomodoroRunning 직접 분기 제거 |
| Critic | M-2 | 폴백 강화 | name→label 자동 매핑 + COLOR_PALETTE[0] 폴백 (외부 호출자 grep 0건 검증 후) |
| Critic | M-3 | 롤백 결정성 | toggleDone에서 splice → sortTodos 순서로 결정성 보장 |
| Critic | C-1 | 스와이프 의도 분기 | 5px 임계, dx-dy 비교, setPointerCapture |
| Critic | C-2 | dirty 통신 | TagListEditor 자체 처리, SettingsScreen은 단순 라우터 |
| Critic | C-3 | ACCENT 토큰 | 인라인 hex 유지, sun(#f4d160)이 ACCENT 역할 |
