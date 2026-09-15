

export const formatNumber = (value?: number | string | null) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '0';
  return number % 1 === 0
    ? Math.round(number).toLocaleString('fr-FR')
    : number.toFixed(2).replace('.', ',');
};

export const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const rewardLabel = (sourceType: string) =>
  sourceType === 'subscription_payment' ? 'Abonnement payé' : 'Trajet payé';
