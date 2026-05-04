# lifecycle 관련 프로젝트

| 레포 | 역할 | 담당 |
|------|------|------|
| `mohashim` (현재 모노레포) | `src/components/popup/OnboardingScreen.tsx` + `SettingsScreen.tsx` 초기화 + `src-tauri/src/storage.rs` + `src/assets/fonts/Pretendard-*.woff2` | bonseung |

## 외부 플러그인

- `tauri-plugin-store` — JSON 로컬 저장소
- `tauri-plugin-notification` — 휴식 시작/완료 OS 알림 (timer 도메인이 호출)
- `tauri-plugin-clipboard-manager` — 공유 카드 복사 (grass 도메인이 호출)

## 폰트

- Pretendard v1.3.9 (`https://github.com/orioncactus/pretendard`)
- 라이선스: SIL Open Font License 1.1 (재배포 가능)
