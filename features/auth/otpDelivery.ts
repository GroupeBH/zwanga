// Phone verification uses SMS (Mobishastra/legacy Keccel); PIN reset uses Keccel.
// Do not expose provider names or promise an expiry shared by both flows.
export const otpDeliveryCopy = {
  title: 'Code par SMS',
  beforeSend: 'Vous recevrez un code par SMS pour vérifier votre numéro.',
  enterCode: 'Consultez vos SMS, puis saisissez le code ici.',
  fallback: 'Ne partagez ce code avec personne.',
  sent: 'Consultez vos SMS et saisissez le code reçu.',
  pinResetRequested: 'Si ce numéro correspond à un compte éligible, vous recevrez un code par SMS.',
  forgotPinHint: 'Pour choisir un nouveau mot de passe, recevez un code par SMS.',
  resetNotConfirmed: 'Demandez un code par SMS pour réessayer. Si le mot de passe a déjà été changé, connectez-vous avec le nouveau.',
  verificationExpired: 'La vérification a expiré. Demandez un nouveau code par SMS.',
} as const;
