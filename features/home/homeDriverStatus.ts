import type { DriverDispatchStatus } from '@/store/api/driverDispatchApi';

/** Same 30-minute boundary as the server's sequential ranking of recent positions. */
export const RECENT_DRIVER_POSITION_MS = 30 * 60_000;

export type HomeDriverStatusView = { tone: 'ok' | 'warn' | 'off'; title: string; detail: string | null };

function elapsedLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

/** Display only: never a lease, a permission or a location request. Null hides the indicator. */
export function homeDriverStatusView({ online, data, isError, now = Date.now() }: {
  online: boolean; data?: DriverDispatchStatus; isError?: boolean; now?: number;
}): HomeDriverStatusView | null {
  if (!online) return { tone: 'off', title: 'Hors ligne', detail: 'Les demandes reprendront à la reconnexion' };
  if (isError) return { tone: 'off', title: 'Statut à vérifier', detail: 'Touchez pour vérifier' };
  if (!data) return null;
  if (!data.enabled) return null;
  if (data.presence?.discoveryEnabled === false)
    return { tone: 'off', title: 'Demandes désactivées', detail: 'Touchez pour les activer' };
  if (!data.available) return { tone: 'off', title: 'Disponibilité à vérifier', detail: 'Touchez pour voir pourquoi' };
  // Durable positions deliberately do not expire; old lease-based rows do.
  if (data.presence?.discoveryEnabled !== true && !(Date.parse(data.presence?.expiresAt ?? '') > now))
    return { tone: 'warn', title: 'Position à actualiser', detail: 'Touchez pour vérifier' };
  const updatedAt = Date.parse(data.presence?.updatedAt ?? '');
  if (!Number.isFinite(updatedAt)) return { tone: 'warn', title: 'Position à vérifier', detail: 'Touchez pour vérifier' };
  const age = Math.max(0, now - updatedAt);
  if (age > RECENT_DRIVER_POSITION_MS) {
    return { tone: 'warn', title: 'Position ancienne', detail: `Dernière position ${elapsedLabel(age)}` };
  }
  return { tone: 'ok', title: 'Demandes possibles', detail: `Position à jour ${elapsedLabel(age)}` };
}
