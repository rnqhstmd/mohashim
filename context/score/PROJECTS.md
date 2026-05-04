# score 관련 프로젝트

| 레포 | 역할 | 담당 |
|------|------|------|
| `mohashim` (현재 모노레포) | `src-tauri/src/score/` 점수 엔진 + `src-tauri/src/audio.rs` 마이크 캡처 | bonseung |

## 외부 크레이트

- `rdev` — 글로벌 키보드/마우스 후킹 (입력 발생 timestamp만 사용)
- `cpal` — 크로스 플랫폼 마이크 입력 스트림
