/** A failed login/token refresh must not be mistaken for a duplicate signup. */
export function isPhoneAlreadyRegisteredError(error: any): boolean {
  if (![400, 401, 409].includes(Number(error?.status ?? error?.data?.statusCode))) return false;
  const code = error?.data?.code ?? error?.code;
  if (code === 'PHONE_ALREADY_REGISTERED') return true;
  if (code && !['BAD_REQUEST', 'AUTHENTICATION_REQUIRED', 'RESOURCE_CONFLICT'].includes(code)) return false;
  // Released backends used these messages without a dedicated business code.
  return ['Ce numéro de téléphone existe déjà', 'Ce numéro de téléphone est déjà utilisé']
    .includes(error?.data?.message);
}
