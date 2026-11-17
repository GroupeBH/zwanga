export type PickupPosition = { latitude: number; longitude: number; updatedAt?: string };
export type RequestPickupSummary = {
  requestId: string; generatedAt: string; expiresAt: string; viewerRole: 'driver' | 'passenger';
  departureAt: string; tripId: string | null; status: 'estimated' | 'paused' | 'waiting_location' | 'unavailable';
  pickup: { location: string; reference: string | null; coordinates: PickupPosition | null };
  driver: { id: string; name: string; position: PickupPosition | null };
  passenger: { id: string; name: string; position: PickupPosition | null };
  vehicle: { brand: string | null; model: string | null; color: string | null; licensePlate: string } | null;
  estimate: { distanceMeters: number; durationSeconds: number; source: 'google_maps'; calculatedAt: string } | null;
};

export function pickupSummaryPresentation(data: RequestPickupSummary | undefined, requestId: string, userId: string | undefined, now: number) {
  if (!data || data.requestId !== requestId || !userId || !['driver', 'passenger'].includes(data.viewerRole) ||
      data[data.viewerRole]?.id !== userId || !(Date.parse(data.expiresAt) > now) ||
      !(now - Date.parse(data.generatedAt) >= -30_000 && now - Date.parse(data.generatedAt) < 30_000)) return null;
  const person = data.viewerRole === 'driver' ? data.passenger : data.driver;
  const estimate = data.estimate;
  const valid = data.status === 'estimated' && estimate && Number.isFinite(estimate.distanceMeters) && estimate.distanceMeters >= 0 &&
    Number.isFinite(estimate.durationSeconds) && estimate.durationSeconds >= 0;
  const distance = valid ? (estimate.distanceMeters < 1000 ? `${Math.round(estimate.distanceMeters)} m`
    : `${(estimate.distanceMeters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`) : null;
  const minutes = valid ? Math.max(1, Math.ceil(estimate.durationSeconds / 60)) : null;
  const time = minutes === null ? null : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return { person, distance, time, status: valid ? 'estimated' : data.status,
    message: valid ? `${distance} · environ ${time}` : data.status === 'paused' ? 'Trajet en pause'
      : data.status === 'waiting_location' ? 'Position du conducteur en attente' : 'Estimation indisponible',
    vehicle: data.viewerRole === 'passenger' && data.vehicle ? [data.vehicle.brand, data.vehicle.model, data.vehicle.color, data.vehicle.licensePlate].filter(Boolean).join(' · ') : null,
  };
}

export function pickupMapUrl(point: PickupPosition | null | undefined) {
  return point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
    ? `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}` : null;
}
