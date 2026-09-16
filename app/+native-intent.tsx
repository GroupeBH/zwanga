import { chottuLinkReferralConfig } from '@/config/env';
import { handleIncomingChottuLink } from '@/services/chottuLinkReferral';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path);
    if (
      chottuLinkReferralConfig.enabled &&
      url.hostname === chottuLinkReferralConfig.domain
    ) {
      handleIncomingChottuLink(url.toString());
      return '/';
    }
  } catch {
    return path;
  }
  return path;
}
