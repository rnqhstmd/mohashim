# 모하심 (Mohashim)

키보드/마우스 + 마이크 dB 하이브리드 집중도 측정과 감자 캐릭터 '모하'로 동기부여하는 macOS/Windows 데스크탑 생산성 앱.

## 진행 상황

- **Phase 0** — Foundation Scaffold (빌드 가능한 빈 골격) ✅
- **Phase 1** — lifecycle 도메인 (온보딩 / 권한 / 스토어 / Pretendard 번들) — 본 브랜치

## 빌드 / 실행

```bash
npm install
npm run tauri dev
```

테스트:

```bash
npm test          # vitest run
npm run test:watch
```

## 플랫폼 지원

- **macOS** — 1차 타겟. 마이크/접근성 권한 다이얼로그 + 시스템 환경설정 deep link 모두 동작.
- **Windows** — MVP 단계에서는 권한 stub. `mic_status()`/`accessibility_status()`가 항상 `Granted`를 반환하여 OnboardingScreen은 동일하게 통과한다. 실제 마이크 capture 시점에는 OS가 사용자 선택을 직접 요구한다. 후속 Phase에서 실제 권한 API 연동 예정.
- Linux 등 기타 OS — 미지원. Windows와 동일한 stub 사용.

## 자산 안내

- `src/assets/fonts/Pretendard-{Regular,Medium,Bold,ExtraBold}.woff2` — Pretendard v1.3.9 (SIL OFL 1.1, `LICENSE.txt` 동봉). CDN 미사용, 오프라인 보장 (DEC-1).
- `src-tauri/icons/` — 앱 아이콘 / 트레이 아이콘 자산은 placeholder PNG. 실제 감자 캐릭터 아이콘 5단계는 후속 Phase에서 동봉.

## 기술 스택

- Tauri v2 + React 18 + TypeScript (strict) + Tailwind CSS
- Rust 플러그인: `tauri-plugin-store` / `tauri-plugin-notification` / `tauri-plugin-clipboard-manager` / `tauri-plugin-opener`
- macOS native: `objc2` / `objc2-av-foundation` (마이크 권한) / `core-foundation` + `AXIsProcessTrusted` FFI (접근성)
- 테스트: Vitest + React Testing Library + jsdom
- 라이트 모드 only (DEC-13)

## 컨텍스트 / 명세

- `requirements/` — MVP 기능 명세
- `context/` — 도메인별 아키텍처 / 용어
- `.dev/{branch}/` — 브랜치별 PRD / 설계서 / 코드맵 / 자기점검 / Trust Ledger
