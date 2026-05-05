#!/usr/bin/env bash
# 입력 비수집 정적 검증 (MUST-6, AC-7).
#
# Tier 1: input.rs 콜백 위반 키워드 grep.
# Tier 2: input.rs 외부에서 rdev 심볼 import 금지.
#
# 스크립트는 cwd와 무관하게 자기 위치를 기준으로 프로젝트 루트를 찾는다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CALLBACK_FILE="$PROJECT_ROOT/src-tauri/src/input.rs"
RUST_DIR="$PROJECT_ROOT/src-tauri/src"

if [ ! -f "$CALLBACK_FILE" ]; then
  echo "[privacy] FAIL — callback file not found: $CALLBACK_FILE" >&2
  exit 1
fi
if [ ! -d "$RUST_DIR" ]; then
  echo "[privacy] FAIL — rust source dir not found: $RUST_DIR" >&2
  exit 1
fi

# Tier 1: 입력 내용 수집 키워드 (FR-6, BR-3).
# `\.event_type`로 통일 — 단독 'event_type'은 false positive 위험(주석/식별자).
CB_PATTERNS=(
  '\.event_type'
  'key\.code'
  'KeyPress'
  'ButtonPress'
  'MouseMove'
  'Wheel'
  '\.button'
  '\.delta'
  '\.code'
)

fail=0

for p in "${CB_PATTERNS[@]}"; do
  if grep -nE "$p" "$CALLBACK_FILE" >/dev/null 2>&1; then
    echo "[privacy] forbidden pattern '$p' in $CALLBACK_FILE" >&2
    grep -nE "$p" "$CALLBACK_FILE" >&2
    fail=1
  fi
done

# Tier 2: input.rs 외부의 rdev 심볼 import 금지.
IMPORT_PATTERN='use[[:space:]]+rdev::(Event|EventType|Key|Button)'

while IFS= read -r f; do
  if [ "$f" = "$CALLBACK_FILE" ]; then
    continue
  fi
  if grep -nE "$IMPORT_PATTERN" "$f" >/dev/null 2>&1; then
    echo "[privacy] forbidden rdev symbol import in $f" >&2
    grep -nE "$IMPORT_PATTERN" "$f" >&2
    fail=1
  fi
done < <(find "$RUST_DIR" -type f -name '*.rs')

if [ $fail -ne 0 ]; then
  echo "[privacy] FAIL" >&2
  exit 1
fi

echo "[privacy] OK"
