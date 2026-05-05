use std::sync::atomic::Ordering::Relaxed;

use rdev;

use crate::score::shared::{touch_input, LAST_INPUT_AT_MS};

/// 입력 후킹 스레드 기동 (FR-6, BR-3, MUST-1).
///
/// `mohashim-input` 스레드 안에서 rdev::listen을 호출한다.
/// listen Err 또는 패닉 → eprintln + LAST_INPUT_AT_MS=0 리셋 후 스레드만 종료.
/// atomic 0 유지로 seconds_idle=0 → work=80, grace=active 상태가 유지된다 (BR-7).
///
/// macOS rdev 0.5.x는 CGEventTap + CFRunLoop 기반이며, 임의 std::thread에서
/// 콜백 미발화 가능성이 있다 (§17). 본 Phase에서는 폴백 경로만 견고히 한다.
pub fn start() -> Result<(), String> {
    std::thread::Builder::new()
        .name("mohashim-input".into())
        .spawn(|| {
            // 이 스레드는 rdev::listen을 별도 스레드에서 실행한다.
            // 콜백은 BR-3 비수집 정책을 따른다 (아래 SAFETY 참조).
            let result = rdev::listen(|_| {
                // SAFETY: 비수집 영역 — rdev 콜백은 입력 발생 시각만 atomic 갱신한다.
                // 키코드/문자/마우스 좌표/휠 델타 등 입력 내용을 바인딩·읽기·전달하지 않는다.
                touch_input();
            });
            if let Err(e) = result {
                // BR-7 충실도: listen 중간 실패 시점에 LAST_INPUT_AT_MS가 직전 입력값을
                // 보유하고 있을 수 있다. 그대로 두면 seconds_idle()이 콜백 정지 시점부터
                // 무한 증가 → 자리 비움으로 오판된다. 0(미입력 센티넬)으로 리셋해
                // grace=active / work=80 폴백을 보장한다.
                LAST_INPUT_AT_MS.store(0, Relaxed);
                eprintln!("[mohashim] rdev::listen failed: {e:?}");
            }
        })
        .map(|_| ())
        .map_err(|e| format!("input thread spawn failed: {e}"))
}
