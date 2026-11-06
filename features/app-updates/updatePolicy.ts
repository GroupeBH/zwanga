export type AppPlatform = 'ios' | 'android';
export interface InstalledApp { platform: AppPlatform; version: string; build: string }
export interface AppRelease extends InstalledApp { id: string; notes: string; available: boolean; publishedAt: string; comparison?: 'version_build' | 'native_build' }
export interface AppUpdateResponse { enabled: boolean; release: AppRelease | null }
export const STORE_URLS: Record<AppPlatform, string> = {
  ios: 'https://apps.apple.com/app/id6756211830',
  android: 'https://play.google.com/store/apps/details?id=com.zwanga',
};

export function versionParts(value: unknown): number[] | null {
  if (typeof value !== 'string' || !/^\d{1,10}(\.\d{1,10}){0,2}$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  if (parts.some(part => !Number.isSafeInteger(part) || part > 2147483647)) return null;
  while (parts.length < 3) parts.push(0);
  return parts;
}
export function compareVersions(a: string, b: string): number | null {
  const left = versionParts(a), right = versionParts(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
export function isNewerRelease(release: AppRelease | null | undefined, installed: InstalledApp | null): release is AppRelease {
  if (!installed || !release || release.available !== true || release.platform !== installed.platform ||
    typeof release.id !== 'string' || !/^\d{1,18}$/.test(release.id)) return false;
  if (release.comparison === 'native_build') return release.platform === 'android' && compareVersions(release.build, installed.build) === 1;
  if (release.comparison !== undefined && release.comparison !== 'version_build') return false;
  const version = compareVersions(release.version, installed.version);
  return version === 1 || (version === 0 && compareVersions(release.build, installed.build) === 1);
}
