// Public copy describes the delivery channel, never the technical SMS provider.
export const otpDeliveryCopy = {
  title: 'Code par SMS',
  beforeSend: 'Vous recevrez un code par SMS pour réinitialiser votre PIN.',
  enterCode: 'Saisissez le code reçu par SMS.',
  sent: 'Consultez vos SMS pour retrouver votre code.',
  pinResetRequested: 'Si ce numéro correspond à un compte éligible, vous recevrez un code par SMS pour réinitialiser votre PIN.',
  forgotPinHint: 'Réinitialisez votre PIN avec un code reçu par SMS.',
  resetNotConfirmed: 'Demandez un code par SMS pour réessayer. Si le PIN a déjà été changé, connectez-vous avec le nouveau PIN.',
  verificationExpired: 'Le code a expiré. Demandez un nouveau code par SMS.',
} as const;
