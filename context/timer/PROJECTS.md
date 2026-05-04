# timer 관련 프로젝트

| 레포 | 역할 | 담당 |
|------|------|------|
| `mohashim` (현재 모노레포) | `src-tauri/src/score/phase.rs` 모드 머신 + `src-tauri/src/power.rs` 슬립 hook + `src/components/popup/PomodoroRunning.tsx` | bonseung |

## 외부 의존성

- `tauri-plugin-notification` — 휴식 시작/완료 OS 알림
- macOS NSWorkspace / Windows WM_POWERBROADCAST — 슬립/깨어남 hook
