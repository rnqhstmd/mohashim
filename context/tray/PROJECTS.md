# tray 관련 프로젝트

| 레포 | 역할 | 담당 |
|------|------|------|
| `mohashim` (현재 모노레포) | `src/assets/tray-master/*.svg` (마스터 5장) → 빌드 시 `src-tauri/icons/tray/{mac,win}/` 자동 생성. `src-tauri/src/tray.rs` 런타임 갱신 | bonseung |

## 빌드 도구

- Node 스크립트 또는 Rust `build.rs`에서 SVG → PNG/ICO 변환
- 후보 라이브러리: `sharp`(Node), `image-rs`(Rust)
