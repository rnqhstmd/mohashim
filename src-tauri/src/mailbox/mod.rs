//! Mailbox IPC + record_session_letter + plugin actions (Phase 23, FR-2~14).
//!
//! `mailbox` 키 단일 writer (P-D4): TS는 `getMailbox()` read-only만 노출.
//! MAILBOX_MUTEX로 read-mutate-write 직렬화 (MUST-2).

pub mod notifier;
pub mod state;

use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Local;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_store::StoreExt;

use crate::storage::STORE_FILE;
use notifier::{lock_mailbox, push_message, LAST_NOTIF_AT_MS, NOTIF_DEEPLINK_WINDOW_MS};
use state::{append_with_cap, mark_all_read_in_place, read_mailbox, write_mailbox, Letter};

/// Letter를 mailbox에 append + persist + 알림 push + emit하는 도메인 무지 인프라 (Phase 24 v2).
///
/// **도메인 무지 원칙**: 본 함수는 letter가 SESSION/SYSTEM/MONTHLY/ATTENDANCE 어느 종류인지 알지 않는다.
/// 도메인(timer / shop)이 Letter struct를 만들어 호출하고, 인프라는 4단계를 수행한다:
///   1) MAILBOX_MUTEX 획득 → read_mailbox → append_with_cap → write_mailbox → store.save
///   2) push_message(title, body) — phase 분기 내장 (Focus/Break: 보류, Idle: 즉시 발화)
///   3) app.emit("mailbox-updated", ()) — phase 무관 항상 emit (편지함 뱃지 갱신)
///
/// 실패 시 stderr 로그만 남기고 무시(반환 unit). 호출자는 letter 생성 책임 + 호출 시점
/// phase 결정 책임만 가진다(예: timer는 Idle 전환 후, shop은 phase 무관 호출).
pub fn append_letter_and_emit<R: Runtime>(app: &AppHandle<R>, letter: Letter) {
    let title = letter.title.clone();
    let body = letter.body.clone();
    {
        let _guard = lock_mailbox();
        let store = match app.store(STORE_FILE) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[mohashim] append_letter_and_emit store open failed: {e}");
                return;
            }
        };
        let mut letters = read_mailbox(&store);
        append_with_cap(&mut letters, letter);
        write_mailbox(&store, &letters);
        if let Err(e) = store.save() {
            eprintln!("[mohashim] append_letter_and_emit store save failed: {e}");
        }
    }
    push_message(app, &title, &body);
    if let Err(e) = app.emit("mailbox-updated", ()) {
        eprintln!("[mohashim] mailbox-updated emit failed: {e}");
    }
}

/// In-memory mailbox 적재 헬퍼 (Phase 27 MA-1).
///
/// **lock 계약**: 호출자가 이미 `lock_mailbox()` 가드를 획득한 상태에서 호출해야 한다.
/// 내부에서 추가 락을 획득하지 않으므로 이중 락에 의한 데드락은 발생하지 않는다.
///
/// **side-effect 미수행**: `store.save()`를 호출하지 않으며, `push_message`/`emit`도
/// 발생시키지 않는다. 호출자가 단일 트랜잭션의 다른 키 mutate와 함께 묶어 1회 save하고,
/// 락 외부에서 push_message/emit을 발화하도록 책임을 위임한다 (Phase 27 MA-2 단일 save 정책).
///
/// 빈 slice 입력 시 즉시 return — read_mailbox/write_mailbox도 생략하여 불필요한
/// 직렬화 비용을 회피한다.
pub(crate) fn append_letters_to_store_locked<R: Runtime>(
    store: &tauri_plugin_store::Store<R>,
    letters: &[Letter],
) {
    if letters.is_empty() {
        return;
    }
    let mut existing = read_mailbox(store);
    for letter in letters {
        // Letter Clone derive로 단순 복제 (입력 slice는 호출자 소유, append_with_cap은 owned 요구).
        append_with_cap(&mut existing, letter.clone());
    }
    write_mailbox(store, &existing);
}

/// 편지 제목용 focus 시간 범위 계산. start_ms=0 시 fallback (now - focus_mins).
///
/// **Phase 27 FR-12 fallback 부정확성 메모**: start_ms=0 분기는 정상 흐름에서는 발생하지
/// 않는다 (record_session_letter 호출자가 FOCUS_START_AT_MS를 보장). 그러나 atomic이
/// 비정상 reset되었거나 race로 0 관측 시 폴백으로 (now - focus_mins, now)를 사용한다.
/// 이 폴백은 break_minutes만큼 시간이 어긋나 보일 수 있다 — Idle 전환 후 호출되므로 now
/// 시점에는 이미 break가 잠시 흘렀을 수 있고, 본래 focus 종료 시각과는 break 경과만큼
/// 차이가 발생. 정상 흐름에서는 항상 start_ms > 0 분기로 진입하므로 본 부정확성은
/// 사용자에게 노출되지 않을 것을 가정한다.
fn compute_session_title_range(
    now: chrono::DateTime<Local>,
    start_ms: u64,
    focus_mins: u32,
) -> (chrono::DateTime<Local>, chrono::DateTime<Local>) {
    use chrono::TimeZone;
    if start_ms > 0 {
        let s = Local
            .timestamp_millis_opt(start_ms as i64)
            .single()
            .unwrap_or(now);
        let e = s + chrono::Duration::minutes(focus_mins as i64);
        (s, e)
    } else {
        let e = now;
        let s = e - chrono::Duration::minutes(focus_mins as i64);
        (s, e)
    }
}

/// 점수 구간별 모하 멘트 후보. 사용자 피드백:
/// - 세션 완료 시 PomodoroCard 모하 대사가 즉시 사라져 읽을 시간이 없음 → 편지 상단에 prepend.
/// - Focus 중 노출되던 멘트(phrases.ts focusHigh/focusLow/focusBroken)를 그대로 mirror.
const COMPLETE_PHRASES_HIGH: &[&str] = &[
    ",, 반했심",
    "너가 체고야",
    "기여워죽겟슨",
    "가끔 너가 너무 좋아서\n어쩔 줄 모르겠는 순간이 있어",
    "사랑해",
    "정말 고생많았어 크크",
    "난 있잖아..\n너가 참 죠타,,",
    "아 왜 이렇게\n플러팅하심~~,,",
];
const COMPLETE_PHRASES_MID: &[&str] = &[
    "아 모하심~~",
    "딴 짓한 거 다 봣슨!!",
    "좀만 더 힘내서 해보아오",
];
const COMPLETE_PHRASES_LOW: &[&str] = &[
    "아 진짜 모하심!!!!!!",
    "도둑맞은 집중력 에바슨",
    "칵시 그냥",
];

/// score 기반 멘트 1개 선택 (BR: 결정성 미요구, 시드는 호출 시점 nanos).
///
/// - 80점 이상: HIGH 버킷
/// - 40~79점: MID 버킷
/// - 0~39점: LOW 버킷
fn pick_complete_phrase(score: u32, seed: u32) -> &'static str {
    let bucket: &[&str] = if score >= 80 {
        COMPLETE_PHRASES_HIGH
    } else if score >= 40 {
        COMPLETE_PHRASES_MID
    } else {
        COMPLETE_PHRASES_LOW
    };
    bucket[(seed as usize) % bucket.len()]
}

/// 점수 구간별 칭찬 라인 1개 선택 — 객관 수치 직전에 삽입되어 사용자 피드백 강화.
///
/// 캐릭터 헤더(`pick_complete_phrase`)와 역할 분담: 헤더는 친근체 인사,
/// 본 함수는 점수 성취도에 비례한 장난기+따듯함 톤의 칭찬/위로.
/// 기존 모하심 톤(친근 구어·오타 허용·캐릭터스러움)에 맞춰 작성.
fn pick_praise_line(score: u32) -> &'static str {
    if score >= 90 {
        "왁 완전 열심히 했네!! 크크"
    } else if score >= 75 {
        "키키 완전 고생했네"
    } else if score >= 50 {
        "이정도면 나쁘지 않움 크크"
    } else if score >= 25 {
        "ㅋㅋㅋㅋㅋㅋ아놔 점수 모심 근데 한 번 봐줄게~"
    } else {
        "아 징자 이건 못 참겠다 전화 한 번 해야겠다.."
    }
}

/// 세션 편지 본문 포맷 — 친근 구어체 + 핵심 수치 볼드 마커.
///
/// Phase 22+ 변경:
/// - `score`: 평균값 → 종료시점 work+noise 값 (timer.rs Break→Complete 전환에서 인계).
/// - `db`: 종료시점 db_ema 추가 (이전 하드코딩 0dB 버그 수정).
/// - `todos_done == 0`: 격려 멘트 분기 (다음 세션에선 할 일 완료도 같이 눌러주도록 유도).
/// - 새싹 표기 "+N개" → "N개 추가" 자연스러운 구어체.
/// - 점수 구간별 모하 멘트를 본문 첫 줄에 prepend (피드백: 평시 복귀 직전 멘트 가독성 보강).
/// - 태그 라인 멀티: "이번 세션에선 [장소]에서 [태그1], [태그2]을 했어!" 형식.
///   - work_tag_labels 빈 경우: "할 일" 폴백
///   - first_location_label None: "[장소]에서" 부분 제거
///   - 둘 다 비면 태그 라인 자체 생략
fn format_session_body(
    focus_mins: u32,
    score: u32,
    db: f32,
    todos_done: usize,
    earned: u32,
    work_tag_labels: &[String],
    first_location_label: Option<&str>,
    phrase_seed: u32,
) -> String {
    // dB 표시: raw dBFS(rms_to_db 반환값, 보통 음수)를 SPL로 변환.
    // FocusStartButton/NoiseMeter와 동일 convention: db + 94 offset 후 [0, 120] 클램프.
    // db == 0.0 (mic 미작동 / 측정 대기)이면 0 표시 유지.
    let db_int = if db.is_finite() && db != 0.0 {
        (db + 94.0).clamp(0.0, 120.0).round() as i32
    } else {
        0
    };
    let phrase = pick_complete_phrase(score, phrase_seed);
    // 3단 구성: phrase(친근체 헤더) → praise(점수 칭찬) → 객관 수치 + 격려(todos_done==0).
    let praise = pick_praise_line(score);
    let intro = if todos_done == 0 {
        format!(
            "{}\n\n{}\n\n[{}분] 집중에 [{}점] 받았어. 소음은 [{}dB]였고, 새싹 [{}개] 챙겨가~\n다음엔 할 일 완료도 같이 눌러주면 더 뿌듯할 거야!",
            phrase, praise, focus_mins, score, db_int, earned
        )
    } else {
        format!(
            "{}\n\n{}\n\n[{}분] 집중에 [{}점] 받았고, 소음 [{}dB] 환경에서 할 일 [{}개]도 끝냈어. 새싹 [{}개] 챙겨가~",
            phrase, praise, focus_mins, score, db_int, todos_done, earned
        )
    };
    // 태그 라인: "이번 세션에선 [{loc}]에서 [{t1}], [{t2}]을 했어!"
    // - work_tag_labels 비면 "할 일"로 폴백, 그래도 라인은 표시 (loc 있는 경우 한정).
    // - first_location_label None이면 "[장소]에서" 제거.
    // - 둘 다 비면 라인 자체 생략.
    let tag_part = if work_tag_labels.is_empty() {
        "할 일".to_string()
    } else {
        work_tag_labels
            .iter()
            .map(|t| format!("[{}]", t))
            .collect::<Vec<_>>()
            .join(", ")
    };
    // 한국어 조사 받침 문제(을/를) 회피: "을 했어!" → "했네. 고생해쓰!"로 통일 (캐주얼 톤).
    let tag_line = match (work_tag_labels.is_empty(), first_location_label) {
        (true, None) => None,
        (false, None) => Some(format!("이번 세션에선 {} 했네. 고생해쓰!", tag_part)),
        (_, Some(loc)) => Some(format!(
            "이번 세션에선 [{}]에서 {} 했네. 고생해쓰!",
            loc, tag_part
        )),
    };
    match tag_line {
        Some(line) => format!("{}\n\n{}", intro, line),
        None => intro,
    }
}

/// 세션 완료 편지 생성 + store persist + 알림 발화 + mailbox-updated emit (FR-3, FR-5, FR-7).
///
/// **호출 계약 (Phase 23 CRITICAL)**: 반드시 `store_phase(Phase::Idle)` +
/// `write_active_phase("idle")` 이후에 호출해야 한다. push_message 내부 phase 판정이
/// Idle로 통과하여 즉시 발화 분기로 진입한다. 순서 위반 시 세션 완료 알림이 보류 큐에
/// 들어가 drain 트리거가 손실된다.
///
/// `end_ms` (BR-3): on_complete_consumed의 end_ms 값. session_log id(`sl-{end_ms}-{avg}`)와
/// mailbox letter id(`ml-{end_ms}`)가 동일 시각 기준을 공유한다.
///
/// `start_ms` (FR-5): FOCUS_START_AT_MS 값 (focus 세션 시작 시각). 0이면 fallback으로
/// `now - focus_mins`를 사용 (break_minutes 오프셋 발생 가능 — 정상 흐름에서는 0이 아님).
pub fn record_session_letter<R: Runtime>(
    app: &AppHandle<R>,
    end_ms: u64,
    start_ms: u64,
    score: u32,
    db: f32,
    focus_mins: u32,
    todos_done: usize,
    session_tag: Option<&str>,
    work_tag_ids: &[String],
    first_location_id: Option<&str>,
) {
    let now = Local::now();
    // BR-3: id는 on_complete_consumed의 end_ms 기반 — session_log id와 시각 기준 동일.
    let id = format!("ml-{}", end_ms);

    // 편지 제목: "{M월 D일} {HH:MM}~{HH:MM} 집중 완료" — 사용자 피드백: 날짜 포함으로 정확성 강화.
    let (title_start, title_end) = compute_session_title_range(now, start_ms, focus_mins);
    let title = format!(
        "{} {}~{} 집중 완료",
        title_start.format("%-m월 %-d일"),
        title_start.format("%H:%M"),
        title_end.format("%H:%M")
    );

    // 🌱 보상 계산 (economy FR-14 임계값 동일).
    let earned = crate::economy::reward::compute_session_reward(score);
    // Phase 22+: 편지용 multi-tag/first-loc 라벨 해석 (사용자 피드백).
    // - work_tag_ids: 등장 순서 보존 + 중복 제거 + None 제외된 ID 목록 (timer.rs에서 산출).
    // - first_location_id: 첫 번째 할 일의 위치 ID.
    let work_tag_labels: Vec<String> = work_tag_ids
        .iter()
        .filter_map(|id| crate::storage::read_work_tag_label(app, id))
        .collect();
    let first_location_label = first_location_id
        .and_then(|id| crate::storage::read_location_label(app, id));
    // phrase 시드: 현재 시각 nanos. 결정성이 필요한 테스트는 format_session_body 직접 호출.
    let phrase_seed = now.timestamp_subsec_nanos();
    let body = format_session_body(
        focus_mins,
        score,
        db,
        todos_done,
        earned,
        &work_tag_labels,
        first_location_label.as_deref(),
        phrase_seed,
    );
    // Letter.session_tag 필드는 기존 dominant 단일 tag ID 유지 (storage/insight 호환).
    let _ = session_tag; // 보존을 위해 변수만 유지.

    let letter = Letter {
        id,
        kind: "SESSION".to_string(),
        title,
        body,
        created_at: now.to_rfc3339(),
        read: false,
        session_tag: session_tag.map(String::from),
    };

    append_letter_and_emit(app, letter);
}

/// 편지함 전체 조회 IPC (FR-10, AC-1).
#[tauri::command]
pub async fn get_mailbox<R: Runtime>(app: AppHandle<R>) -> Result<Vec<Letter>, String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    Ok(read_mailbox(&store))
}

/// 편지함 전체 읽음 처리 IPC (FR-9, AC-7 멱등, AC-20 즉시 뱃지 해제).
#[tauri::command]
pub async fn mark_all_mailbox_read<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    {
        let _guard = lock_mailbox();
        let store = app
            .store(STORE_FILE)
            .map_err(|e| format!("store open failed: {e}"))?;
        let mut letters = read_mailbox(&store);
        if mark_all_read_in_place(&mut letters) {
            write_mailbox(&store, &letters);
            store
                .save()
                .map_err(|e| format!("store save failed: {e}"))?;
        }
    }
    // AC-20: MailboxScreen 진입 후 mark_all_read 완료 시 MainScreen 뱃지 즉시 해제.
    // 멱등 no-op(이미 모두 read)인 경우에도 emit하여 일관성 유지 — 수신측이 read 카운트
    // 재계산을 통해 stale 뱃지를 항상 해제하도록 보장한다.
    if let Err(e) = app.emit("mailbox-updated", ()) {
        eprintln!("[mohashim] mark_all_mailbox_read emit failed: {e}");
    }
    Ok(())
}

/// 개별 편지 읽음 처리 IPC (FR-9 파생, AC-7).
#[tauri::command]
pub async fn mark_mailbox_letter_read<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<(), String> {
    let _guard = lock_mailbox();
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let mut letters = read_mailbox(&store);
    let mut changed = false;
    for l in letters.iter_mut() {
        if l.id == id && !l.read {
            l.read = true;
            changed = true;
            break;
        }
    }
    if changed {
        write_mailbox(&store, &letters);
        store
            .save()
            .map_err(|e| format!("store save failed: {e}"))?;
    }
    Ok(())
}

/// OS 알림 액션 타입 등록 (FR-8, Plugin actions API 인프라).
///
/// Phase 23 MVP: no-op. tauri-plugin-notification v2 Rust-side ActionType 등록은
/// 플랫폼별 JS 브릿지로 처리되며, Phase 24에서 deeplink 심화 구현 예정.
pub fn register_notification_actions<R: Runtime>(_app: &AppHandle<R>) -> Result<(), String> {
    Ok(())
}

/// LAST_NOTIF_AT_MS가 최근 발화 윈도우 내라면 mailbox-deeplink를 emit하고 atomic을 소비한다.
///
/// 호출 컨텍스트:
/// - 트레이 좌클릭으로 윈도우를 노출한 직후 (Windows에서 알림 클릭 후 트레이 진입 경로).
/// - `install_notification_action_handler`의 Focused 핸들러와 동시 호출되어도 swap(0)이
///   원자적 단일 소비를 보장 — 누가 먼저 호출되든 두 번째는 `last > 0` 가드에서 즉시 skip.
pub fn try_emit_deeplink_if_pending<R: Runtime>(app: &AppHandle<R>) {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_NOTIF_AT_MS.swap(0, Ordering::AcqRel);
    if last > 0 && now_ms.saturating_sub(last) < NOTIF_DEEPLINK_WINDOW_MS {
        if let Err(e) = app.emit("mailbox-deeplink", json!({})) {
            eprintln!("[mohashim] try_emit_deeplink_if_pending emit failed: {e}");
        }
    }
}

/// 앱 재활성화 시 메인 윈도우를 노출한다 (macOS dock 아이콘 클릭 / Reopen 이벤트).
///
/// 자동 mailbox-deeplink emit은 의도적으로 제거 — 사용자가 우상단 📬 아이콘을
/// 명시적으로 클릭해 편지함에 진입하는 단일 경로만 유지한다 (false positive 차단).
pub fn on_app_reactivation<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        if let Err(e) = win.show() {
            eprintln!("[mohashim] reactivation show failed: {e}");
        }
        if let Err(e) = win.unminimize() {
            eprintln!("[mohashim] reactivation unminimize failed: {e}");
        }
        if let Err(e) = win.set_focus() {
            eprintln!("[mohashim] reactivation set_focus failed: {e}");
        }
    }
}

/// OS 알림 클릭 핸들러 설치 (FR-8 minimal, BR-9).
///
/// Phase 23 minimal 휴리스틱:
/// - notifier::send_now 성공 시 `LAST_NOTIF_AT_MS`에 시각 기록.
/// - 메인 윈도우 focus 이벤트 수신 시 LAST_NOTIF_AT_MS와 비교하여 NOTIF_DEEPLINK_WINDOW_MS
///   (10초) 이내이면 알림 클릭으로 추정 → mailbox-deeplink emit + LAST_NOTIF_AT_MS swap(0).
///
/// **재시도**: setup 시점에 main window가 아직 생성되지 않을 수 있으므로
/// `lib.rs::install_main_window_close_guard` 패턴(100ms 후 1회 재시도)을 따른다.
///
/// **제약**: 사용자가 알림 발화 직후 트레이/dock 등으로 수동 focus 시에도 trigger 가능 (false positive).
///
/// **Phase 27 FR-19 deprecated 메모**: letter_id 전달은 본 Phase에서 비목표로 결정됨.
/// 사유는 design-critic 도전 + 사용자 결정으로, focused 윈도우 휴리스틱이 false positive를
/// 발생시킬 수 있고 그 부정확성이 letter_id 라우팅으로 가시화되면 UX 실수가 되는 점을 회피.
/// 향후 tauri-plugin-notification v2의 action API가 macOS/Windows 양쪽에서 안정 지원되면
/// 별도 Phase에서 letter_id payload + MailboxScreen 자동 포커스를 구현 예정 (PRD AC-17/18/19 이월).
/// 그 전까지 이 함수는 가장 최근 편지 휴리스틱(deeplink emit empty payload)을 유지한다.
pub fn install_notification_action_handler<R: Runtime>(app: &AppHandle<R>) {
    attempt_install_notification_handler(app.clone(), 1);
}

fn attempt_install_notification_handler<R: Runtime>(app: AppHandle<R>, retries_left: u32) {
    if let Some(window) = app.get_webview_window("main") {
        let app_clone = app.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(true) = event {
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                // swap(0) — 1회 사용 후 reset하여 동일 알림에 대한 중복 deeplink 차단.
                let last = LAST_NOTIF_AT_MS.swap(0, Ordering::AcqRel);
                if last > 0 && now_ms.saturating_sub(last) < NOTIF_DEEPLINK_WINDOW_MS {
                    // Phase 26 MA-1 / BR-6: 3단 윈도우 활성화 (FR-23, AC-15).
                    // hide 상태 윈도우 가시화 + minimize 복원 + 멀티모니터 최상위 + 키보드 포커스.
                    // 각 단계 실패는 eprintln 후 다음 단계 진행 (UX 비차단).
                    //
                    // **Self-loop 자연 차단**: swap(0) 호출 시점에 LAST_NOTIF_AT_MS는 이미 0으로
                    // reset된 상태. 자체 win.show() 호출이 추가 Focused(true) 이벤트를 발화시켜도
                    // LAST_NOTIF_AT_MS == 0이므로 `last > 0` 조건이 false → 분기 미진입.
                    // 별도 atomic flag 가드 불필요.
                    //
                    // 호출 순서: show → unminimize → set_focus.
                    // - show: NSWindow 가시화 (hide 상태 → 노출).
                    // - unminimize: minimize 복원 (정상 상태 → no-op).
                    // - set_focus: 멀티 모니터 최상위 + 키보드 포커스.
                    if let Some(win) = app_clone.get_webview_window("main") {
                        if let Err(e) = win.show() {
                            eprintln!("[mohashim] deeplink show failed: {e}");
                        }
                        if let Err(e) = win.unminimize() {
                            eprintln!("[mohashim] deeplink unminimize failed: {e}");
                        }
                        if let Err(e) = win.set_focus() {
                            eprintln!("[mohashim] deeplink set_focus failed: {e}");
                        }
                    }
                    if let Err(e) = app_clone.emit("mailbox-deeplink", json!({})) {
                        eprintln!("[mohashim] mailbox-deeplink emit failed: {e}");
                    }
                }
            }
        });
        return;
    }
    if retries_left == 0 {
        eprintln!(
            "[mohashim] install_notification_action_handler: main window unavailable after retry"
        );
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        attempt_install_notification_handler(app, retries_left - 1);
    });
}

#[cfg(test)]
mod tests {
    use super::{compute_session_title_range, format_session_body};
    use chrono::{Local, TimeZone};

    #[test]
    fn format_session_body_with_tags_and_location() {
        // raw dB -49 + 94 offset = 45dB SPL. 작업 태그 2개 + 위치 1개.
        let tags = vec!["공부".to_string(), "개발".to_string()];
        let body = format_session_body(25, 80, -49.0, 3, 5, &tags, Some("집"), 0);
        assert!(body.contains("[25분]"));
        assert!(body.contains("[80점]"));
        assert!(body.contains("[3개]"));
        assert!(body.contains("[5개]"));
        assert!(body.contains("[45dB]"));
        assert!(
            body.ends_with("이번 세션에선 [집]에서 [공부], [개발] 했네. 고생해쓰!"),
            "tag line should list all tags with location, got: {body}"
        );
    }

    #[test]
    fn format_session_body_no_tag_no_location() {
        let body = format_session_body(25, 80, 50.0, 3, 5, &[], None, 0);
        assert!(body.contains("[5개]"));
        assert!(
            !body.contains("이번 세션에선"),
            "no tag line when both tags and location are empty, got: {body}"
        );
    }

    #[test]
    fn format_session_body_tag_no_location() {
        let tags = vec!["공부".to_string()];
        let body = format_session_body(25, 80, -49.0, 3, 5, &tags, None, 0);
        assert!(
            body.ends_with("이번 세션에선 [공부] 했네. 고생해쓰!"),
            "tag-only line without location, got: {body}"
        );
    }

    #[test]
    fn format_session_body_location_no_tag_uses_fallback() {
        // 위치만 있고 작업 태그 없으면 "할 일" 폴백.
        let body = format_session_body(25, 80, -49.0, 3, 5, &[], Some("카페"), 0);
        assert!(
            body.ends_with("이번 세션에선 [카페]에서 할 일 했네. 고생해쓰!"),
            "location with fallback tag part, got: {body}"
        );
    }

    #[test]
    fn format_session_body_zero_todos_uses_encouragement_branch() {
        // todos_done == 0이면 격려 분기: "다음엔 할 일 완료도..." 멘트.
        let body = format_session_body(50, 70, 60.0, 0, 5, &[], None, 0);
        assert!(
            body.contains("다음엔 할 일 완료도"),
            "zero-todos branch should include encouragement, got: {body}"
        );
    }

    #[test]
    fn format_session_body_high_score_includes_perfect_praise() {
        // 90점 이상은 강한 칭찬 라인 포함.
        let body = format_session_body(25, 100, -56.0, 0, 5, &[], None, 0);
        assert!(
            body.contains("열심히 했네"),
            "high score (>=90) should include perfect praise, got: {body}"
        );
    }

    #[test]
    fn format_session_body_low_score_includes_consolation() {
        // 25점 미만은 위로 라인 포함.
        let body = format_session_body(25, 10, -56.0, 1, 1, &[], None, 0);
        assert!(
            body.contains("전화 한 번"),
            "low score (<25) should include consolation, got: {body}"
        );
    }

    #[test]
    fn format_session_body_db_zero_when_invalid() {
        // NaN / 음수 / 0 입력 시 0dB 표시.
        let body_nan = format_session_body(25, 80, f32::NAN, 1, 5, &[], None, 0);
        assert!(body_nan.contains("[0dB]"));
        let body_neg = format_session_body(25, 80, -200.0, 1, 5, &[], None, 0);
        assert!(body_neg.contains("[0dB]"));
    }

    #[test]
    fn compute_session_title_range_with_start_ms() {
        let now = Local::now();
        // 2024-01-01 09:00:00 KST 기준 임의 시각
        let start_ms = 1_704_067_200_000u64; // 2024-01-01 00:00:00 UTC
        let focus_mins = 25u32;
        let (s, e) = compute_session_title_range(now, start_ms, focus_mins);

        let expected_start = Local
            .timestamp_millis_opt(start_ms as i64)
            .single()
            .expect("valid millis");
        assert_eq!(s, expected_start);
        assert_eq!(e, expected_start + chrono::Duration::minutes(focus_mins as i64));
    }

    #[test]
    fn compute_session_title_range_zero_start_ms_fallback() {
        let now = Local::now();
        let focus_mins = 25u32;
        let (s, e) = compute_session_title_range(now, 0, focus_mins);

        assert_eq!(e, now);
        assert_eq!(s, now - chrono::Duration::minutes(focus_mins as i64));
    }
}
