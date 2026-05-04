# 모하심 (Mohashim)

키보드/마우스 + 마이크 dB 하이브리드 집중도 측정과 감자 캐릭터 '모하'로 동기부여하는 macOS/Windows 데스크탑 생산성 앱.

## Phase 0 — Foundation Scaffold

이 브랜치는 빌드 가능한 빈 골격만 포함합니다. 비즈니스 로직(점수 엔진, 마이크, 투두, 잔디, 트레이 표정 갱신 등)은 후속 Phase에서 구현됩니다.

## 빌드 / 실행

```bash
npm install
npm run tauri dev
```

## 자산 안내

- `src/assets/fonts/` — Pretendard woff2 4종(Regular/Medium/Bold/ExtraBold)은 후속 작업으로 동봉됩니다. Phase 0 dev 빌드에서는 시스템 fallback 폰트로 표시될 수 있습니다.
- `src-tauri/icons/` — 앱 아이콘 / 트레이 아이콘 자산은 후속 작업에서 추가됩니다.

## 기술 스택

- Tauri v2 + React 18 + TypeScript + Tailwind CSS
- Rust 플러그인: `tauri-plugin-store`, `tauri-plugin-notification`, `tauri-plugin-clipboard-manager`
- 폰트: Pretendard (앱 번들 동봉, CDN 미사용 — DEC-1)
- 라이트 모드 only (DEC-13)

## 컨텍스트 / 명세

- `requirements/` — MVP 기능 명세
- `context/` — 도메인별 아키텍처 / 용어
