import type { ProOffering, ServiceCode } from '@/types/proServices';

export type DisplayServiceCode = ServiceCode | 'delivery' | 'schools' | 'health';
export type CatalogueState = 'ready' | 'loading' | 'error';
export type CatalogueEntry = {
  code: DisplayServiceCode;
  title: string;
  description: string;
  availability: ProOffering['availability'] | 'checking' | 'unavailable';
  offering?: ProOffering;
};

const descriptions: Record<DisplayServiceCode, { title: string; description: string }> = {
  documents: { title: 'Obtenir mes documents', description: 'Permis, assurance et papiers du véhicule.' },
  fleet: { title: 'Gérer ma flotte', description: 'Véhicules, conducteurs et versements.' },
  delivery: { title: 'Zwanga Livraison', description: 'Envoi et livraison de colis.' },
  schools: { title: 'Transport scolaire', description: 'Zwanga Schools · Trajets des élèves.' },
  health: { title: 'Transport santé', description: 'Zwanga Health · Déplacements pour les soins.' },
  vehicles: { title: 'Véhicules', description: 'Accès à un véhicule et financement.' },
  equipment: { title: 'Équipements', description: 'Matériel pour conducteurs et livreurs.' },
};
export const servicePresentation = (code: DisplayServiceCode) => descriptions[code];

/** Preview-only services never become application codes or override backend availability. */
export function buildServiceCatalogue(offerings: ProOffering[], state: CatalogueState) {
  const existing = (code: ServiceCode): CatalogueEntry => {
    const offering = offerings.find(item => item.code === code);
    return {
      code,
      ...descriptions[code],
      offering,
      availability: offering?.availability ?? (state === 'loading' ? 'checking' : 'unavailable'),
    };
  };
  const future = (code: 'delivery' | 'schools' | 'health'): CatalogueEntry => ({
    code, ...descriptions[code], availability: 'coming_soon',
  });
  return {
    primary: [existing('documents'), existing('fleet'), future('delivery'), future('schools'), future('health')],
    secondary: (['vehicles', 'equipment'] as const)
      .filter(code => offerings.some(item => item.code === code))
      .map(existing),
  };
}
