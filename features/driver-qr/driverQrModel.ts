export type PublicDriverCredit = {
  assetKind: 'phone' | 'helmet' | 'gps_tracker' | 'delivery_equipment' | 'equipment' | 'vehicle';
  status: 'active' | 'settled';
};
export type PublicDriverCard = {
  id: string; firstName: string; lastName: string; profilePicture: string | null;
  driverCategory: 'private' | 'transport' | 'intercity' | null;
  isPhoneVerified: boolean; completedTrips: number; averageRating: number | null; totalRatings: number;
  vehicles: { type: string; brand: string; model: string; color: string; licensePlate: string }[];
  credits: PublicDriverCredit[];
};

export const DRIVER_CREDIT_LABELS: Record<PublicDriverCredit['assetKind'], string> = {
  phone: 'Téléphone', helmet: 'Casque', gps_tracker: 'Traceur GPS',
  delivery_equipment: 'Matériel de livraison', equipment: 'Autre équipement', vehicle: 'Véhicule',
};
export const isDriverQrId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

/** The QR only carries a stable public URL, never tokens or a private credit payload. */
export function driverQrLink(apiBase: string, id: string, allowLocalHttp = false): string | null {
  if (!isDriverQrId(id)) return null;
  try {
    const base = new URL(apiBase);
    const local = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(base.hostname);
    if (base.username || base.password || base.search || base.hash ||
        (base.protocol !== 'https:' && !(allowLocalHttp && local && base.protocol === 'http:'))) return null;
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/public/drivers/${id.toLowerCase()}/card`;
    return base.toString();
  } catch { return null; }
}

export function normalizeDriverQrLink(value: string): string | null {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^(.*)\/public\/drivers\/([^/]+)\/card$/);
    if (!match || url.search || url.hash) return null;
    const base = new URL(url); base.pathname = match[1];
    return driverQrLink(base.toString(), match[2]);
  } catch { return null; }
}
