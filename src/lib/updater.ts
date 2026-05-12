export const APP_VERSION = "0.1.0";

const REPO = "rnqhstmd/mohashim";

export type UpdateInfo = {
  version: string;
  releaseUrl: string;
  body: string | null;
};

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
    const latest = data.tag_name.replace(/^v/, "");
    if (!isNewer(latest, APP_VERSION)) return null;
    return { version: latest, releaseUrl: data.html_url, body: data.body ?? null };
  } catch {
    return null;
  }
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const [lM, lm, lp] = parse(latest);
  const [cM, cm, cp] = parse(current);
  if (lM !== cM) return lM > cM;
  if (lm !== cm) return lm > cm;
  return lp > cp;
}
