# 모하심 V2 MVP — 정책 결정 + Phase 계획

V1.0(Phase 0~21) 머지 이후 추가되는 V2 확장 기능의 비즈니스 정책 확정안과 Phase 22~26 구현 단계를 정리합니다. 도메인 PRD는 본 문서를 기반으로 prometheus 흐름에서 도출합니다.

- 작성일: 2026-05-08
- 기반: `requirements/기능mvp.md`(V1) + 사용자 V2 스펙 시안
- 신규 도메인 3개: **economy / shop / mailbox**
- 기존 7개 도메인 영향: timer 🟡 / score 🟢 / character 🟠 / todo 🟢 / grass 🟢 / tray 🟡 / lifecycle 🟡

---

## 1. 확정된 비즈니스 정책

### 1-1. Economy & Timer (보상 도메인)

| ID | 항목 | 결정 |
|----|------|------|
| P-E1 | 타이머 제약 | 집중 **25~60분**, 휴식 **1~30분**. Rust `FOCUS_MINUTES_MIN/MAX`, `BREAK_MINUTES_MIN/MAX` 상수 + DurationsEditScreen 동시 변경 |
| P-E2 | 기존 사용자 마이그레이션 | **불필요** — V1 정식 사용자 부재. 신규 사용자만 가정하고 단순화. 단, dev/test 환경에서 범위 밖 값이 들어와도 부팅 시 store seed defaults가 25/5로 시드되므로 자연 보호 |
| P-E3 | 출석 보상 액수 | **1🌱** (자정 이후 첫 todo 등록 시) |
| P-E4 | 출석 보상 트리거 시점 | **자정 이후 첫 todo 등록**. 정의: `economy.lastTodoSproutDate != today_local` 상태에서 `setTodos`로 todo 카운트가 증가(N → N+1)하는 순간 1회 지급. 지급 후 `lastTodoSproutDate = today_local` |
| P-E5 | 출석 보상 멱등 | 1일 1회 고정. 지급 후 todo 전부 삭제 → 재등록해도 추가 지급 X. `lastTodoSproutDate==today` 가드만으로 멱등 |
| P-E6 | 자정 기준 | **로컬 시간**(`chrono::Local::now()`). 'YYYY-MM-DD' 포맷으로 비교 |
| P-E7 | 출석 보상 알림 | **편지 1통만** 발송. 별도 토스트 X. 본문에 잔액 변화 표기(`+1🌱 → 잔액 N🌱`) |
| P-E8 | 세션 완료 보상 액수 | 세션 평균 점수 기준 — **>=80점: 5🌱 / >=60점: 3🌱 / 그 외: 1🌱** (최소 보상). 80/60 임계값은 `state_from_total`의 81/61 경계와 무관하게 사용자 명세 그대로 |
| P-E9 | 세션 평균 점수 산출 | **Focus tick만 누적** (현재 `accumulate_session_score` 정책 유지). Break tick은 휴식이라 측정 의미 없음 |
| P-E10 | 보상 지급 시점 | `Phase::Complete` 진입 즉시(`on_complete_consumed` 직후). atomic하게 잔액 갱신 + 편지 발송 |
| P-E11 | Discarded 세션 보상 | **0🌱**. `on_sleep_overflow_discard` / 사용자 취소 흐름은 Complete 분기에 진입하지 않으므로 자연 차단 |
| P-E12 | 새싹 자료형 | u32 정수 (음수/소수 불가). store에는 `economy.sprouts: number`로 영속 |

### 1-2. Shop & Customization

| ID | 항목 | 결정 |
|----|------|------|
| P-S1 | 9종 아이템 ID 네이밍 | snake_case `{slot}_{descriptor}`. 얼굴: `face_round_glasses`, `face_heart_glasses`, `face_square_horn` / 머리: `head_strawhat`, `head_beret_red`, `head_wizard_cone` / 등: `back_blanket_check`, `back_cloak_navy`, `back_cloak_aura` |
| P-S2 | 카탈로그 데이터 위치 | `src/lib/shopCatalog.ts` 하드코딩 (단일 진실 소스). 빌드 타임 타입 검증 + JSON 파일 분리 X |
| P-S3 | 아이템 SVG 자산 | `src/assets/items/{id}.svg`. Potato.tsx와 동일한 viewBox 200×200 좌표계 사용. Phase 25에서 placeholder SVG → 시안 확정 후 자산만 교체 |
| P-S4 | 잔액 부족 인터랙션 | 카드 회색 비활성 + 호버 시 `"{부족분}🌱 더 모아주세요"` 툴팁. 클릭 무반응 |
| P-S5 | 구매 확인 모달 | **항상 표시**(첫 구매 / 반복 구매 구분 없음). 모달에 "환불 불가" 한 줄 명시 + "{아이템명} ({가격}🌱) 구매할까요?" 본문 + 확인/취소 |
| P-S6 | 구매 직후 자동 장착 | **No** — 영수증 편지만 발송. 장착은 사용자가 인벤토리에서 명시적으로 |
| P-S7 | 환불/되팔기 | MVP 미지원. 안내 문구는 P-S5 모달에만 노출 |
| P-S8 | 동일 슬롯 교체 | 즉시 교체(이전 아이템 자동 해제). 별도 확인 모달 X |
| P-S9 | 장착 해제 UI | 인벤토리 화면에서 "해제" 버튼. 슬롯별 표시 |
| P-S10 | 상점 미리보기 | 카드 클릭 시 상단 모하 미리보기 갱신(구매와 분리). 구매 전 자유 미리보기 |

### 1-3. Mailbox

| ID | 항목 | 결정 |
|----|------|------|
| P-M1 | 안 읽은 편지 뱃지 | 빨간 점 1개 fixed (숫자 X) — 사용자 명세 "앙증맞은" 정합 |
| P-M2 | 읽음 처리 시점 | **편지함 리스트 진입 시 일괄 `isRead=true`** 처리. 개별 클릭 X. 즉, 진입 = 모두 읽음. 빨간 점 뱃지는 진입 후 즉시 해제 |
| P-M3 | 일괄 읽음 / 전체 삭제 | 미지원 (P-M2로 자동 일괄 읽음 + FIFO 50으로 자연 정리) |
| P-M4 | 정렬 | 최신순 fixed |
| P-M5 | Empty state | 모하 그림 + `"아직 편지가 없어. 함께 집중해보자!"` |
| P-M6 | FIFO 50 한도 | 51번째 편지 도착 시 oldest부터 자동 삭제. 안 읽은 편지도 보호 X (정책 단순화) |
| P-M7 | 편지 본문 길이 | 무제한(월간 편지 길이 수용). 리스트는 제목 + 1줄 요약(최대 60자) |
| P-M8 | OS 알림 토글 | `notifications_enabled=false`면 OS 알림 차단. 단, 편지함 누적 + 뱃지 갱신은 항상 수행 |
| P-M9 | Focus 중 발생 이벤트 OS 알림 | **보류 큐**. Focus 종료 시 모아서 1회 발송(`BR-notif-guard` 정합). 편지함 뱃지/누적은 즉시 |
| P-M10 | 세션 요약 편지 양식 | 제목: `"{HH:MM}~{HH:MM} 집중 완료"` / 본문: `"총 {분}분 / 집중도 평균 {점수}점 / 평균 소음 {dB}dB / 완료한 할 일 {N}개 / 🌱 +{보상}"` 후행에 `compute_session_tag` 결과(작업/위치 태그) 한 줄 |
| P-M11 | 알림 클릭 딥링크 | 윈도우 `show()` + `setFocus()` + `unminimize()` + 편지함 화면 라우팅. 특정 편지로 자동 이동 X(MVP 단순화) |

### 1-4. 월간 인사이트

| ID | 항목 | 결정 |
|----|------|------|
| P-I1 | 발송 트리거 | 부팅 시 1회 체크. `getCurrentYearMonth() != last_monthly_letter_year_month` && 지난달 분석 가능 시 발송 후 키 갱신 |
| P-I2 | 1월 1일 부팅 시 순서 | **월간 분석 먼저 실행** → yearly_cleanup. 작년 12월 데이터 보존 보장. `last_monthly_letter_year_month` 멱등 가드 |
| P-I3 | 0세션인 달 | 미발송. 격려형(5번)도 0세션이면 의미 없음 |
| P-I4 | 세션 10회 미만 | 격려형(5번) 발송 |
| P-I5 | 시간대 4구간 | 새벽 00~06 / 오전 06~12 / 오후 12~18 / 저녁 18~24 (`Local::now()` 시각 기준) |
| P-I6 | dB 구간 | 조용 0~40 / 보통 40~60 / 다소 시끄러움 60~80 / 시끄러움 80+ |
| P-I7 | 베스트 시간대 산출 | 4구간별 평균 점수 max 구간. 동률 시 세션 수가 많은 구간 우선 |
| P-I8 | 베스트 dB 구간 산출 | 4구간별 평균 점수 max 구간. 동률 시 세션 수 많은 구간 우선 |
| P-I9 | 올빼미형(③) 분기 | 베스트 시간대 == "새벽(00~06)" |
| P-I10 | 소음강자형(④) 분기 | 베스트 dB 구간 ∈ {"다소 시끄러움(60~80)", "시끄러움(80+)"} |
| P-I11 | 올라운더형(②) 분기 | 4구간 평균 점수 표준편차 ≤ 5점 AND 모든 구간 ≥ 10세션 |
| P-I12 | 표준형(①) 분기 | 베스트 시간대 ∈ {"오전","오후","저녁"} |
| P-I13 | 5종 우선순위 | ③ > ④ > ① > ② > ⑤ (특수성 높은 순). 매칭된 첫 번째 템플릿 1통만 발송 |
| P-I14 | 통수 | 1통 |
| P-I15 | 시간대 텍스트 매핑 | 베스트 시간대 → 제목 어구. 새벽=올빼미형 별도, 오전/오후/저녁은 표준형 그대로 |

### 1-5. 데이터 / 마이그레이션

| ID | 항목 | 결정 |
|----|------|------|
| P-D1 | store 키 추가 | 12 → **16 키**. 신규: `economy`, `inventory`, `mailbox`, `last_monthly_letter_year_month` |
| P-D2 | `SessionLog` 확장 | 기존 필드(id/date/start_at/end_at/duration_mins/score/todos_done) + **`avg_db: number`, `earned_sprouts: number`** 추가. 폴백 정규화에서 부재 시 0 |
| P-D3 | session_history 별도 배열 | **불필요** — `session_logs`로 통합. 데이터 중복 회피 |
| P-D4 | 단일 writer 정책 | 신규 4 키 모두 **Rust 단일 writer**. TS는 read-only 헬퍼만 (`getEconomy`, `getInventory`, `getMailbox`, `getLastMonthlyLetter`) |
| P-D5 | reset_all 갱신 | 16 키 defaults 재시드. 기존 init/backup/retry 흐름 그대로 적용 |
| P-D6 | economy.lastTodoSproutDate | 'YYYY-MM-DD' Local 포맷. null 허용 (초기 상태) |
| P-D7 | mailbox 메시지 스키마 | `{ id: string, type: "SESSION"|"MONTHLY"|"SYSTEM", title: string, content: string, isRead: boolean, createdAt: string(RFC3339+offset) }` |

### 1-6. UI/UX

| ID | 항목 | 결정 |
|----|------|------|
| P-U1 | 하단 탭 변경 | `[할일|잔디|상점]` 3탭. 기존 설정 탭 제거 |
| P-U2 | 메인 우상단 아이콘 | ModeChip 왼쪽으로 톱니바퀴(설정) + 편지함 가로 배치. ModeChip은 그 옆 유지 |
| P-U3 | 편지함 진입 | 풀스크린 라우팅 (목록 + 상세 2단계) |
| P-U4 | 새싹 잔액 표시 | 메인 카드 상단에 `점수 {N} · {dB}dB · 🌱 {잔액}` 한 줄. 점수/dB 옆 |
| P-U5 | 상점 첫 화면 | 상단 모하(80×80, 현재 장착 반영) + 영역 탭(얼굴/머리/등) + 9개 카드 그리드 |
| P-U6 | 인벤토리 노출 | 상점 탭 안 "내 아이템" 토글로 owned 만 필터 |
| P-U7 | 모하 사이즈 | 메인 140×140, 상점 미리보기 80×80 (동일 viewBox 200×200, 아이템 좌표 일관) |
| P-U8 | Potato 레이어 합성 | Z-index 기반: back(z=-1) → body → face → head(z=top). SVG `<g>` 그룹으로 layering |
| P-U9 | 디자이너 컨펌 시점 | Phase 25(캐릭터 레이어) 시작 전까지 placeholder SVG로 통합. 시안 확정 후 자산만 교체 (Phase 분리) |

### 1-7. 알림

| ID | 항목 | 결정 |
|----|------|------|
| P-N1 | 세션 종료 OS 알림 | `notifications_enabled && Complete` 시 발화. Discarded는 알림 X |
| P-N2 | 출석 보상 OS 알림 | 발화 X (편지함 뱃지만). 자발적 todo 등록 흐름이라 OS 알림 불필요 |
| P-N3 | 구매 영수증 OS 알림 | 발화 X (편지함 뱃지만). 구매 직후 사용자가 보는 화면이라 중복 |
| P-N4 | 월간 편지 OS 알림 | 발화. 클릭 시 편지함 직진(P-M11) |
| P-N5 | 윈도우 활성화 방식 | `show()` + `setFocus()` + `unminimize()` 3단 |
| P-N6 | 알림 발화 위치 | Rust `mailbox::push` IPC 내에서 OS 알림도 함께 처리(편지함 단일 진입점) |

---

## 2. Phase 22~26 구현 단계

각 Phase는 PR 1개를 목표로. PRD는 Phase 시작 직전 prometheus로 도출.

### Phase 22 — 인프라 + Economy 코어 (PR 1개)
**목표**: store 스키마 확장 + 타이머 제약 변경 + 새싹 보상 흐름

- store 스키마 12 → 16 키 (`economy`, `inventory`, `mailbox`, `last_monthly_letter_year_month`)
- defaults seed + `reset_all` 갱신 (P-D5)
- 타이머 제약 25~60 / 1~30 (Rust 상수 + DurationsEditScreen, P-E1)
- Rust `economy` 모듈
  - 잔액 read/write IPC (단일 writer, P-D4)
  - 세션 Complete 보상 hook (`on_complete_consumed` 직후, P-E10)
  - 출석 보상 hook (`record_todo_added` IPC에서 카운트 N→N+1 시점, P-E4/E5)
  - earned_sprouts를 `append_session_log`에 함께 적재 (P-D2)
- 단위 테스트
  - `compute_session_reward(score)` 임계값 80/60 (P-E8)
  - 출석 보상 멱등성 (P-E5)
  - Discarded 분기 보상 미지급 (P-E11)
- **의존**: 이후 Phase가 Phase 22 인프라 위에 쌓임

### Phase 23 — Mailbox 기반 (PR 1개)
**Phase 22 다음으로 우선** — Phase 24(Shop)의 영수증 편지가 mailbox API를 호출해야 함

- Rust `mailbox` 모듈
  - FIFO 50 push (P-M6)
  - 메시지 스키마 직렬화 (P-D7)
  - `mark_all_read` IPC (편지함 진입 시 호출, P-M2)
  - 보류 큐(Focus 중 → Complete 직후 발화, P-M9)
- MailboxScreen UI (풀스크린 라우팅, P-U3)
  - 리스트 진입 시 `mark_all_read` 자동 호출
  - 빨간 점 뱃지 (메인 우상단 편지함 아이콘, P-M1)
  - empty state (P-M5)
- 세션 요약 편지 발화 (Complete 직후, P-M10)
- OS 알림 wiring (`notifications_enabled` 게이트, P-M8/N1)
- 단위 테스트
  - FIFO 50 경계 (51번째 도착 시 oldest 삭제, P-M6)
  - 보류 큐 release 순서 (P-M9)
  - 리스트 진입 시 일괄 isRead 처리 (P-M2)

### Phase 24 — Shop 카탈로그 + Inventory (PR 1개)
**Phase 23 다음** — 영수증 편지가 mailbox에 의존

- shopCatalog.ts 9종 아이템 정의 (P-S1/S2)
- placeholder SVG 9개 (`src/assets/items/{id}.svg`, P-S3)
- Rust `shop` 모듈
  - 구매 IPC (잔액 검증 + 차감 + inventory 갱신 atomic)
  - 장착/해제 IPC (P-S8/S9)
- ShopTab UI
  - 상단 모하 미리보기 (P-S10/U5)
  - 영역 탭 + 9개 카드 그리드
  - 잔액 부족 호버 툴팁 (P-S4)
  - **모든 구매에 확인 모달**(환불 불가 명시, P-S5)
  - 구매 후 영수증 편지 발화 (mailbox::push, P-S6)
- 인벤토리 토글 ("내 아이템" 필터, P-U6)
- 단위 테스트
  - 잔액 검증 로직 (부족 시 구매 차단)
  - 동일 슬롯 즉시 교체 (P-S8)

### Phase 25 — 캐릭터 레이어 시스템 (PR 1개)
- Potato.tsx 리팩터: `ItemOverlay` 컴포넌트 도입
- Z-index 레이어링 back/body/face/head (P-U8)
- inventory.equipped 반영 (메인 + 상점 미리보기 양쪽, P-U7)
- placeholder SVG로 통합 검증 → 디자이너 시안 확정 시 자산만 교체(P-U9)
- 단위 테스트
  - equipped 슬롯 매핑 (face/head/back 각각 렌더 검증)
  - 미장착 슬롯 미렌더 (null 처리)

### Phase 26 — 월간 인사이트 + 알림 딥링크 (PR 1개)
- Rust `analyze_monthly_pattern(session_logs, year_month)` 순수 함수
  - 시간대/dB 4구간 분류 (P-I5/I6)
  - 베스트 시간대/dB 산출 (P-I7/I8)
  - 5종 템플릿 분기 (P-I9~I13, 우선순위 ③>④>①>②>⑤)
  - 0세션/10회 미만 분기 (P-I3/I4)
- 월간 편지 트리거 (부팅 시 체크, P-I1/I2)
- yearly_cleanup 순서 보정 (월간 분석 먼저, P-I2)
- BottomTabBar 변경 (todos/grass/shop, P-U1)
- 메인 우상단 톱니바퀴 + 편지함 아이콘 (P-U2)
- 새싹 잔액 표시 (P-U4)
- 알림 딥링크 단순화 (윈도우 활성화 + 편지함 진입, P-M11/N5)
- 단위 테스트
  - `analyze_monthly_pattern` 5종 템플릿 분기 (각 시나리오)
  - 우선순위 (올빼미+소음강자 동시 매칭 시 올빼미 선택)
  - `last_monthly_letter_year_month` 멱등 (월 첫 부팅에만 1회)

---

## 3. 주요 리스크 / 후속 결정

| 리스크 | 등급 | 대응 |
|--------|------|------|
| 캐릭터 레이어 좌표 정렬 (9종 아이템 × 5단계 표정 × 각 슬롯) | 🔴 | Phase 25에서 placeholder SVG로 통합 후, 디자이너 시안 확정 시 자산만 교체. 시안 검증은 Phase 25 PR 머지 후 후속 Phase로 분리 가능 |
| 월간 분석 엔진 정확성 (5종 분기) | 🟡 | `analyze_monthly_pattern` 순수 함수 + 5종 시나리오 단위 테스트 필수 |
| Focus 중 OS 알림 보류 큐 | 🟡 | 보류된 알림이 Complete 직후 모아서 1회 — 큐 길이 제한 / 중복 제거 정책 단위 테스트로 검증 |
| Tauri 알림 클릭 콜백 OS별 차이 | 🟡 | MVP는 단순화(P-M11) — 진짜 딥링크는 후속 Phase |

---

## 4. 메모

- 본 문서는 V2 MVP 구현 직전 정책 진실 소스. Phase 진행 중 결정 변경 발생 시 본 문서를 갱신한 후 PR 머지
- 도메인별 PRD는 본 문서를 컨텍스트로 prometheus 흐름에서 도출 (Phase 22 PRD부터)
- 신규 도메인 3개(economy/shop/mailbox)의 `context/{도메인}/` 디렉토리는 Phase 22 머지 시 생성. 본 정책 문서를 PROJECTS/glossary/architecture/status로 분해
