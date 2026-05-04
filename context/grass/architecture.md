# grass 아키텍처

## 데이터 모델

```ts
type SessionRecord = {
  date: string;     // 'YYYY-MM-DD' (로컬 시간대)
  sessions: number; // 그 날 완료 세션 수
  avg: number;      // 그 날 평균 집중 점수 (0~100)
};
```

- 저장: 일자 키 1개당 1 레코드. 세션 추가 시 누적 평균 갱신
- store 키: `sessions` (Map<date, SessionRecord>)

## 잔디 레벨 알고리즘

```ts
function gridLevel(sessions: number, avg: number): 0 | 1 | 2 | 3 | 4 {
  if (sessions === 0) return 0;
  if (sessions <= 2) return 1;
  if (sessions >= 6 && avg >= 70) return 4;
  if (sessions >= 3 && sessions <= 5 && avg >= 60) return 3;
  return 2;
}
```

## 적재 시점

- timer 도메인의 Complete 전이 시점에만 1건 추가/갱신
- Discarded는 미적재
- 휴식까지 끝나야 1세션 — Focus만 끝나고 Break 도중 종료해도 미적재

## 공유 카드 (ShareCard)

### 합성 파이프라인 (DEC-5 옵션 A)

```
<ShareCard width=1080 height=1080>  (React에서 <svg>로 직접 작성)
   ↓ new XMLSerializer().serializeToString(svgEl)
   ↓ btoa(unescape(encodeURIComponent(svgString))) → data:image/svg+xml;base64,…
   ↓ const img = new Image(); img.src = dataUrl; await img.decode()
   ↓ <canvas 1080×1080>.getContext('2d').drawImage(img, 0, 0)
   ↓ canvas.toBlob(blob, 'image/png')
   ↓ tauri-plugin-clipboard-manager: writeImage(blob)
   ↓ 토스트 "복사됨"
```

### 작성 규칙

- 외부 합성 라이브러리 미사용 (의존성 = clipboard-manager 1개만)
- `<foreignObject>` 대신 `<text>` 직접 (OS 폰트 fallback 회피)
- Pretendard 번들 폰트가 SVG에서 그대로 사용됨 (`font-family: Pretendard`)
- ShareCard는 화면에 렌더되지 않음 (`position: absolute; left: -99999px`)

### 레이아웃 (확정 필요)

```
┌─────────────────────────────────┐
│ MOHASHIM                        │  ← 워터마크/브랜딩
│                                 │
│   [4주 잔디 그리드]             │  ← 일자별 Lv0~4
│                                 │
│   [모하 캐릭터]   [통계 요약]    │  ← 현재 표정 + 누적 세션/시간/평균점수
│                                 │
│   날짜 · 도메인                 │
└─────────────────────────────────┘
   정방형 1080×1080
```

**픽셀 좌표·크기·여백은 별도 디자인 작업** (DEC-16). 코드 작성 전에 시안 확정 필요.

### 트리거

- 잔디 탭 / HistoryScreen의 "잔디 자랑하기" 버튼 클릭
- ~1초 내 합성 → 클립보드 복사 → 토스트
- 화면 어떤 상태든 결과 동일 (스크롤/잘림 영향 없음)

## 화면 구성

| 화면 | 내용 |
|------|------|
| Grass Tab | 메인 팝업 두 번째 탭. 월별 잔디 + 오늘 통계 카드 + 자랑하기 버튼 |
| HistoryScreen | 전체 기록 화면. 월간 통계 + 잔디 + 최근 세션 리스트 |

## ContributionGraph 컴포넌트

```ts
<ContributionGraph
  data={SessionRecord[]}      // 월간 데이터
  monthOffset={0}              // 0=현재 월, -1=지난달
  onMonthChange={(n) => …}     // ← / → 화살표
  onHover={(idx) => …}
  hoveredIdx={number | null}
  hideNav={false}              // 공유 카드용으로 nav 숨길 때 true
/>
```

- 헤더: ← `2026년 5월` → (다음달 disabled when offset >= 0)
- 7×N 그리드 (월요일~일요일이 아닌 **일~토** 헤더, leading blanks로 첫 주 정렬)
- 셀 hover: 1.15× scale + ink 보더 + 그림자
- 5단계 색: GRASS_0 ~ GRASS_4 (`#ebedf0` → `#216e39`)
- legend: "적음 ◻️◻️◻️◻️◻️ 많음" 5개 컬러 단계

## 최근 세션 리스트 (HistoryScreen)

- 카드형 행 — 점수 도트(5단계 컬러) + 시간 + 길이 + 환경(envFromDb) + dB
- 예: `[92] 14:30  25분           ☕ 58dB`
- 최대 표시 개수: 시안에는 3개. 추후 스크롤로 확장
