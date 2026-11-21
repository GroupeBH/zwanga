import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { ServiceLayout, ServiceButton } from '@/features/pro-services/ServiceLayout';
import { useCommerceCategoriesQuery, useCommerceProductsQuery } from '@/store/api/commerceApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { CatalogueProductCard, CatalogueVehicleLink, catalogueCategoryLabel, catalogueIcon } from '@/features/pro-services/CommerceCatalogueParts';
import { c, catalogueColors as color } from '@/features/pro-services/CommerceCatalogue.styles';
export default function Catalogue() {
  const enabled = useDisplayReadsEnabled(useScreenIsActive());
  const { width, fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.2;
  const columns = fontScale > 1.6 ? 1 : width < 360 || fontScale > 1.2 ? 2 : 3;
  const categoryBasis = columns === 1 ? '100%' : columns === 2 ? '46%' : '30%';
  const [categoryId, setCategory] = useState<string>(), [after, setAfter] = useState<string>();
  const categories = useCommerceCategoriesQuery(undefined, displayReadOptions(enabled));
  const products = useCommerceProductsQuery({ categoryId, after }, displayReadOptions(enabled));
  const failed = products.isError || categories.isError;
  const empty = products.currentData?.items.length === 0 && !products.isFetching && !failed;
  const purchasesLink = <TouchableOpacity style={largeText ? [c.row, { minHeight: 48, paddingVertical: 8 }] : c.headerAction} accessibilityRole="button" accessibilityLabel="Mes achats et remboursements"
      onPress={() => router.push('/services/purchases' as Href)} activeOpacity={0.7}>
      <Ionicons name="receipt-outline" size={22} color={color.orange} accessible={false} />
      {largeText && <Text style={c.actionText}>Mes achats</Text>}
    </TouchableOpacity>;
  return <ServiceLayout title={largeText ? 'Catalogue' : 'Équipements et documents'} compact headerActions={largeText ? undefined : purchasesLink}>
    {largeText && purchasesLink}
    <View style={c.introduction}>
      <Text style={c.eyebrow}>LE CATALOGUE ZWANGA</Text>
      <Text style={c.title}>Comptant <Text style={c.accent}>ou à crédit.</Text></Text>
      <Text style={c.text}>Comparez les prix. Choisissez votre formule.</Text>
    </View>
    <View style={c.categoryGrid} testID="catalogue-categories">
      {[{ id: '', name: 'Tout', code: '', kind: '' }, ...(categories.currentData?.items ?? [])].map(category => {
        const selected = (categoryId ?? '') === category.id;
        return <TouchableOpacity key={category.id} testID={`catalogue-category-${category.id || 'all'}`} accessibilityRole="button"
          accessibilityLabel={category.name} accessibilityState={{ selected }} activeOpacity={0.75}
          style={[c.category, { flexBasis: categoryBasis, flexGrow: 1 }, selected && c.categorySelected]}
          onPress={() => { setCategory(category.id || undefined); setAfter(undefined); }}>
          <View style={c.categoryIcon}><Ionicons name={catalogueIcon(category.kind)} size={21} color={color.orange} accessible={false} /></View>
          <Text style={[c.categoryText, selected && c.white]}>{catalogueCategoryLabel(category)}</Text>
        </TouchableOpacity>;
      })}
    </View>
    <View style={c.row}><Text style={[c.sectionTitle, c.flex]}>Les produits</Text>{products.isFetching && <ActivityIndicator color={color.orange} accessibilityLabel="Chargement du catalogue" />}</View>
    {failed && <View style={c.state} testID="catalogue-error">
      <Ionicons name="cloud-offline-outline" size={32} color={color.orange} accessible={false} />
      <Text style={c.stateTitle}>Le catalogue est indisponible</Text><Text style={[c.text, c.centered]}>Réessayez dans un instant.</Text>
      <TouchableOpacity style={[c.retry, !enabled && c.disabled]} accessibilityRole="button" accessibilityState={{ disabled: !enabled }} disabled={!enabled}
        onPress={() => { if (enabled) { void products.refetch(); void categories.refetch(); } }}><Text style={c.retryText}>Réessayer</Text></TouchableOpacity>
    </View>}
    {products.currentData?.items.map(p => <CatalogueProductCard key={p.id} product={p} stacked={width < 360 || fontScale > 1.2}
      onPress={() => router.push((`/services/catalogue/${p.id}`) as Href)} />)}
    {empty && <View style={c.state} testID="catalogue-empty">
      <View style={c.stateIcon}><Ionicons name="bag-handle-outline" size={34} color={color.orange} accessible={false} /></View>
      <Text style={c.stateTitle}>Pas encore de produit ici</Text><Text style={[c.text, c.centered]}>Les offres disponibles s’afficheront dans cette catégorie.</Text>
    </View>}
    {!enabled && !failed && <Text style={c.text}>Catalogue en pause. Reconnectez-vous pour actualiser les offres.</Text>}
    {!!products.currentData?.nextCursor && <ServiceButton secondary title="Produits suivants" onPress={() => setAfter(products.currentData?.nextCursor ?? undefined)} />}
    {!!after && <ServiceButton secondary title="Revenir au début" onPress={() => setAfter(undefined)} />}
    <CatalogueVehicleLink stacked={largeText} onPress={() => router.push('/services/credit/product/vehicle')} />
  </ServiceLayout>;
}
