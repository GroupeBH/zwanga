/** Only this explicit conflict is recoverable as an existing approval. */
export function isKycAlreadyApprovedError(error: any): boolean {
  if (Number(error?.status ?? error?.data?.statusCode) !== 409) return false;
  const code = error?.data?.code ?? error?.code;
  if (code === 'KYC_ALREADY_APPROVED') return true;
  if (code && code !== 'RESOURCE_CONFLICT') return false;
  // Compatibility with servers that preceded the stable business error code.
  return error?.data?.message ===
    'Votre identité est déjà vérifiée. Contactez le support si une nouvelle vérification est nécessaire.';
}
