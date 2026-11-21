import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import type { CommerceCategory, CommerceProduct } from '@/types/commerce';
import { commerceMoney } from './commerceModel';
import { c, catalogueColors as color } from './CommerceCatalogue.styles';

export function catalogueIcon(kind: string): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'phone': return 'phone-portrait-outline';
    case 'equipment': return 'bag-handle-outline';
    case 'accessories': return 'headset-outline';
    case 'document': return 'document-text-outline';
    case 'vehicle': return 'car-sport-outline';
    default: return 'grid-outline';
  }
}
export function catalogueCategoryLabel(category: CommerceCategory) {
  if (category.name === 'Équipements conducteur et livreur') return 'Conducteur & livreur';
  if (category.name === 'Autres accessoires') return 'Accessoires';
  return category.name;
}

export function CatalogueProductCard({ product: p, stacked, onPress }: {
  product: CommerceProduct; stacked: boolean; onPress: () => void;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const image = p.details.imageUrl;
  const category = ({ phone: 'Téléphone', equipment: 'Équipement', document: 'Document', vehicle: 'Véhicule' } as Record<string, string>)[p.kind] ?? 'Accessoire';
  const Shell = stacked ? View : TouchableOpacity;
  const Action = stacked ? TouchableOpacity : View;
  const label = `${p.name}. ${commerceMoney(p.prices.cashTotalMinor)} comptant. ${commerceMoney(p.prices.creditTotalMinor)} au total à crédit. Voir le produit.`;
  return <Shell testID={`catalogue-product-${p.id}`} style={c.product} onPress={stacked ? undefined : onPress}
    activeOpacity={0.82} accessibilityRole={stacked ? undefined : 'button'} accessibilityLabel={stacked ? undefined : label}>
    {image && image !== failedImage
      ? <Image testID="catalogue-product-image" source={{ uri: image }} style={c.photo} resizeMode="contain" accessibilityIgnoresInvertColors
          onError={() => setFailedImage(image)} accessible={false} />
      : <View style={c.photoPlaceholder} testID="catalogue-product-placeholder">
          <Ionicons name={catalogueIcon(p.kind)} size={46} color={color.orange} accessible={false} />
          <Text style={c.placeholderLabel}>{category} · Photo non disponible</Text>
        </View>}
    <View style={c.productBody}>
      <View style={{ gap: 4 }}><Text style={c.productTitle}>{p.name}</Text><Text style={c.text} numberOfLines={stacked ? undefined : 2}>{p.description}</Text></View>
      <View style={[c.prices, stacked && { flexDirection: 'column' }]}>
        <View style={[c.priceGroup, stacked && { flex: undefined }]}><Text style={c.priceLabel}>En une fois</Text><Text style={c.price}>{commerceMoney(p.prices.cashTotalMinor)}</Text></View>
        <View style={[c.priceGroup, stacked && { flex: undefined }]}><Text style={c.priceLabel}>Total à crédit</Text><Text style={c.creditPrice}>{commerceMoney(p.prices.creditTotalMinor)}</Text></View>
      </View>
      {BigInt(p.prices.cashSavingMinor) > 0n && <View style={c.saving}><Text style={c.savingText}>{commerceMoney(p.prices.cashSavingMinor)} économisés en une fois</Text></View>}
      <Action style={c.productAction} onPress={stacked ? onPress : undefined} accessibilityRole={stacked ? 'button' : undefined}
        accessibilityLabel={stacked ? label : undefined} activeOpacity={0.75}>
        <Text style={c.actionText}>Voir le produit et les formules</Text><Ionicons name="arrow-forward" size={20} color={color.orange} accessible={false} />
      </Action>
    </View>
  </Shell>;
}

export function CatalogueVehicleLink({ onPress, stacked = false }: { onPress: () => void; stacked?: boolean }) {
  const Shell = stacked ? View : TouchableOpacity;
  const Action = stacked ? TouchableOpacity : View;
  const label = 'Un véhicule avec Zwanga. Financement sous conditions, dont neuf mois d’activité réelle. Voir les conditions.';
  return <Shell style={c.vehicle} onPress={stacked ? undefined : onPress} activeOpacity={0.82} accessibilityRole={stacked ? undefined : 'button'}
    accessibilityLabel={stacked ? undefined : label}>
    <View style={c.row}>
      <View style={c.vehicleIcon}><Ionicons name="car-sport-outline" size={27} color="#FFC3A1" accessible={false} /></View>
      <View style={[c.flex, { gap: 4 }]}><Text style={c.vehicleLabel}>FINANCEMENT VÉHICULE</Text><Text style={c.vehicleTitle}>Un véhicule avec Zwanga</Text></View>
    </View>
    <Action style={c.vehicleFooter} onPress={stacked ? onPress : undefined} activeOpacity={0.75} accessibilityRole={stacked ? 'button' : undefined}
      accessibilityLabel={stacked ? label : undefined}>
      <View style={c.flex}><Text style={c.vehicleText}>9 mois d’activité minimum · Sous conditions</Text><Text style={[c.vehicleText, { color: '#FFF', fontWeight: '700' }]}>Découvrir les conditions</Text></View><Ionicons name="arrow-forward" size={22} color="#FFC3A1" accessible={false} />
    </Action>
  </Shell>;
}
