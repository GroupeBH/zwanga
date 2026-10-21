// The API does not expose the actual delivery channel. WhatsApp is preferred
// with Didit, but SMS remains possible: do not claim confirmed WhatsApp delivery.
export const otpDeliveryCopy = {
  title: 'WhatsApp via Didit',
  beforeSend: 'Le code sera envoyé en priorité sur WhatsApp par Didit, notre service de vérification.',
  enterCode: 'Consultez WhatsApp, puis revenez saisir le code ici.',
  fallback: 'Pas de message WhatsApp ? Vérifiez aussi vos SMS.',
  sent: 'Consultez WhatsApp pour le code de vérification envoyé via Didit. Si aucun message n’arrive, vérifiez aussi vos SMS.',
  pinResetRequested: 'Si ce numéro correspond à un compte éligible, vous recevrez un code en priorité sur WhatsApp via Didit, ou par SMS en secours.',
  forgotPinHint: 'Pour choisir un nouveau mot de passe, recevez un code sur WhatsApp ou par SMS.',
  resetNotConfirmed: 'Demandez un code de vérification pour réessayer, puis consultez WhatsApp ou vos SMS. Si le mot de passe a déjà été changé, connectez-vous avec le nouveau.',
  verificationExpired: 'La vérification a expiré. Demandez un code, puis consultez WhatsApp ou vos SMS.',
} as const;
