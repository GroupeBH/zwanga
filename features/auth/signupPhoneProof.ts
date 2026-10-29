export interface PhoneOtpVerification {
  valid: boolean;
  verificationToken?: string;
  expiresInSeconds?: number;
}

export class SignupPhoneProofError extends Error {
  readonly code = 'PHONE_VERIFICATION_REQUIRED';
  constructor() { super('Vérifiez à nouveau votre numéro par SMS pour continuer.'); }
}

/** Memory only: neither OTP nor proof belongs in auth drafts, Redux or logs. */
export function createSignupPhoneProof() {
  let scope = '', generation = 0, busy: number | null = null;
  let startedAt = 0;
  let proof: { phone: string; token?: string; expiresAt: number } | null = null;
  const clear = () => { generation++; busy = null; proof = null; };
  return {
    clear,
    setScope(next: string) { if (scope !== next) { scope = next; clear(); } },
    begin(): number | null {
      if (busy !== null) return null;
      proof = null; startedAt = Date.now(); busy = ++generation;
      return busy;
    },
    current(ticket: number) { return ticket === generation; },
    finish(ticket: number) { if (busy === ticket) busy = null; },
    capture(phone: string, result: PhoneOtpVerification, ticket: number): boolean {
      if (ticket !== generation) return false;
      if (result?.valid !== true) throw new Error('Code OTP invalide ou expiré.');
      const token = result.verificationToken;
      if (token !== undefined && (!/^[A-Za-z0-9_-]{43}$/.test(token) ||
        !Number.isFinite(result.expiresInSeconds) || !(result.expiresInSeconds! > 0))) {
        throw new SignupPhoneProofError();
      }
      // Older Keccel responses have no proof: preserve their optional flow,
      // but never claim that the server will mark the created account verified.
      const seconds = token ? Math.min(result.expiresInSeconds!, 900) : 300;
      proof = { phone: phone.trim(), token, expiresAt: startedAt + seconds * 1000 };
      return true;
    },
    take(phone: string): string | undefined {
      const value = proof;
      clear();
      if (!value || value.phone !== phone.trim() || Date.now() >= value.expiresAt) {
        throw new SignupPhoneProofError();
      }
      return value.token;
    },
  };
}

export type SignupPhoneProof = ReturnType<typeof createSignupPhoneProof>;
