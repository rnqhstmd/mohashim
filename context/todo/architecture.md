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
