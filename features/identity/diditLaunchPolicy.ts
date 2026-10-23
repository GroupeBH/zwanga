export function isSafeDiditHostedUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'verify.didit.me' &&
      !url.username && !url.password && (!url.port || url.port === '443') &&
      /^\/(?:[a-z]{2}\/)?session\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  } catch { return false; }
}
