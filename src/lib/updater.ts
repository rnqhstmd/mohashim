export const APP_VERSION = __APP_VERSION__;

const REPO = "rnqhstmd/mohashim";

export type UpdateInfo = {
  version: string;
  releaseUrl: string;
  body: string | null;
};

/** semver `M.m.p` 형식 검증 (선택 `v` 접두사 허용). 비semver 태그는 비교 불가 → null 반환 경로로 안전 폴백. */
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tag_name: string;
      html_url: string;
      body: string | null;
      draft: boolean;
      prerelease: boolean;
    };
    if (data.draft || data.prerelease) return null;
    const latest = parseSemver(data.tag_name);
    const current = parseSemver(APP_VERSION);
    if (!latest || !current) return null; // 비semver 태그는 silent 무시 (회귀 방지).
    if (!isNewer(latest, current)) return null;
    return {
      version: data.tag_name.replace(/^v/, ""),
      releaseUrl: data.html_url,
      body: data.body ?? null,
    };
  } catch {
    return null;
  }
}

function parseSemver(s: string): [number, number, number] | null {
  const m = SEMVER_RE.exec(s);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isNewer(latest: [number, number, number], current: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (latest[i] !== current[i]) return latest[i] > current[i];
  }
  return false;
}
