export function formatRequestTime(value: string | number) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
}

export function formatRequestDay(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date à confirmer';
  return date.toDateString() === new Date().toDateString() ? 'Aujourd’hui' : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
