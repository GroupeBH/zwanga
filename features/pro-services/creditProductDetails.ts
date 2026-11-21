import type { AssetKind, AssetProduct } from '@/store/api/assetCreditApi';

/** Category descriptions, not a promise about a model or equipment included in an offer. */
export const creditProductDetails: Record<AssetKind, { purpose: string; toConfirm: string }> = {
  phone: { purpose: 'Un téléphone pour recevoir vos commandes, suivre vos trajets et utiliser Zwanga.',
    toConfirm: 'Marque, modèle, mémoire, état du téléphone et accessoires : à préciser dans votre offre.' },
  helmet: { purpose: 'Un casque pour les déplacements à moto.',
    toConfirm: 'Type, taille, normes de protection et état : à préciser avant votre accord.' },
  gps_tracker: { purpose: 'Un traceur pour le suivi de votre véhicule.',
    toConfirm: 'Compatibilité, installation, carte SIM et éventuel abonnement : à préciser avant votre accord.' },
  delivery_equipment: { purpose: 'Du matériel pour transporter vos colis ou vos commandes de livraison.',
    toConfirm: 'Sac ou coffre, dimensions, capacité et accessoires inclus : à préciser avant votre accord.' },
  equipment: { purpose: 'Du matériel adapté à votre activité de conducteur.',
    toConfirm: 'Type de matériel, référence et caractéristiques : à préciser avant votre accord.' },
  vehicle: { purpose: 'Un véhicule pour exercer votre activité de conducteur sur Zwanga.',
    toConfirm: 'Marque, modèle, état, documents et conditions de remise : à préciser dans votre offre.' },
};

export function creditProductStatus(product: AssetProduct | undefined, canRequest: boolean | undefined, pending: boolean) {
  if (pending) return 'Dossier en cours';
  if (product?.comingSoon || (product && !['phone', 'vehicle'].includes(product.kind))) return 'À venir';
  if (!product) return 'Disponibilité à vérifier';
  if (product.kind === 'vehicle' && product.eligibility?.eligible !== true) return 'Sous conditions d’activité';
  if (!product.enabled) return 'Indisponible actuellement';
  if (!canRequest) return 'Réservé aux conducteurs actifs';
  return 'Disponible sur dossier';
}
