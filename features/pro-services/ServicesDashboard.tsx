import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';
import type { AssetCredit } from '@/store/api/assetCreditApi';
import { creditMoney } from './assetCreditModel';
import { creditDashboard, creditNextInstallment, serviceMatches } from './servicesDashboardModel';
import { dashboardStyles as d } from './ServicesDashboard.styles';

type Props = {
  driver: boolean; stacked?: boolean; documentStatus?: string; documentAction: string; documentsEnabled: boolean;
  credits: AssetCredit[]; creditDetail?: AssetCredit; creditsReady: boolean;
  enabled: boolean; search: string; onDocuments: () => void; onCredits: () => void;
  onBuy: () => void; onFleet: () => void; onCredit: (id: string) => void;
};
export function ServicesDashboard(p: Props) {
  const summary = creditDashboard(p.credits);
  const focus = summary.focus;
  const current = p.creditDetail?.id === focus?.id ? p.creditDetail : focus;
  const next = creditNextInstallment(current);
  const newDriver = p.driver && p.creditsReady && !p.credits.length && !p.documentStatus;
  const matches = (text: string) => serviceMatches(p.search, text);
  const button = (label: string, onPress: () => void, enabled = p.enabled) => <TouchableOpacity
    accessibilityRole="button" accessibilityState={{ disabled: !enabled }} disabled={!enabled}
    onPress={() => { if (enabled) onPress(); }} style={[d.action, !enabled && d.disabled]} activeOpacity={0.75}>
    <Text style={d.actionText}>{label}</Text>
  </TouchableOpacity>;
  const tile = (id: string, title: string, description: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void,
    dark = false, enabled = p.enabled) => <TouchableOpacity testID={id} accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`} disabled={!enabled} accessibilityState={{ disabled: !enabled }}
      style={[d.tile, p.stacked && { flexBasis: '100%' }, dark && d.dark, !enabled && d.disabled]} activeOpacity={0.75} onPress={() => { if (enabled) onPress(); }}>
      <View style={d.tileTop}><View style={[d.icon, dark && d.darkIcon]}><Ionicons name={icon} size={21} color={dark ? '#D9E65A' : '#0D2240'} /></View>
        {dark && <Text style={d.pro}>Pro</Text>}</View>
      <Text style={[d.title, dark && d.white]}>{title}</Text>
      <Text style={[d.body, dark && d.mutedWhite]}>{description}</Text>
    </TouchableOpacity>;
  return <View style={{ gap: 20 }} testID="services-dashboard">
    {!p.search && focus && <View style={d.group}>
      <Text style={d.title}>À traiter</Text>
      <View style={d.hero}>
        <View style={[d.row, p.stacked && { flexDirection: 'column', alignItems: 'stretch' }]}><View style={p.stacked ? { gap: 4 } : d.flex}>
          <Text style={d.body}>{next ? `Versement ${next.ordinal} sur ${current?.installmentCount ?? current?.installments?.length} · ` : ''}{focus.label}</Text>
          <Text style={d.amount}>{creditMoney(next?.remainingMinor ?? Math.max(0, Number(focus.principalMinor) - Number(focus.paidMinor)))}</Text>
          <Text style={d.eyebrow}>{focus.status === 'offered' ? 'Offre reçue · Votre accord est requis' : next
            ? `Échéance : ${new Date(next.dueAt!).toLocaleDateString('fr-FR')}` : 'Reste à rembourser'}</Text>
        </View>{button(focus.status === 'offered' ? 'Voir l’offre' : 'Payer', () => p.onCredit(focus.id))}</View>
        {focus.status === 'active' && <View style={d.track} accessibilityLabel={`${Math.round(Number(focus.paidMinor) / Math.max(1, Number(focus.principalMinor)) * 100)} % remboursés`}>
          <View style={[d.progress, { width: `${Math.min(100, Math.max(0, Number(focus.paidMinor) / Math.max(1, Number(focus.principalMinor)) * 100))}%` }]} /></View>}
        {p.documentStatus && <TouchableOpacity style={d.alertRow} accessibilityRole="button" disabled={!p.documentsEnabled}
          accessibilityLabel="Voir mon dossier de documents" onPress={() => { if (p.documentsEnabled) p.onDocuments(); }}>
          <Ionicons name="document-text-outline" color="#B83E08" size={18} /><Text style={[d.body, d.flex]}>Documents · {p.documentStatus}</Text>
          <Ionicons name="chevron-forward" size={18} color="#0D2240" />
        </TouchableOpacity>}
      </View>
    </View>}
    {!p.search && newDriver && <View style={d.hero} testID="services-onboarding">
      <Text style={d.eyebrow}>Première étape</Text><Text style={d.heroTitle}>Préparez votre dossier conducteur</Text>
      <Text style={d.body}>Obtenez les documents utiles à votre activité.</Text>
      <View style={d.chips}>{['① Permis', '② Assurance', '③ Carte grise'].map(label => <View style={d.chip} key={label}><Text style={d.chipText}>{label}</Text></View>)}</View>
      {button(p.documentAction, p.onDocuments, p.documentsEnabled)}
    </View>}
    <View style={d.group}>
      <Text style={d.title}>Mes services</Text>
      <View style={d.grid}>
        {(!newDriver || !!p.search) && matches('Mon dossier documents permis assurance carte grise') && tile('pro-service-documents', 'Mon dossier', p.documentStatus ?? 'Permis, assurance, carte grise', 'document-text-outline', p.onDocuments, false, p.documentsEnabled)}
        {(p.credits.length > 0 || !p.creditsReady || !!p.search) && matches('Mes crédits remboursements téléphone') && tile('credit-repayments-link', 'Mes crédits', !p.creditsReady ? 'Consulter mes remboursements' : summary.active.length
          ? `${summary.active.length} en cours · reste ${creditMoney(summary.remaining)}${summary.offered ? ' · Offre à consulter' : ''}` : 'Mes offres et contrats', 'card-outline', p.onCredits)}
        {matches('Acheter à crédit téléphone véhicule équipements') && tile('pro-service-credit', 'Acheter à crédit', 'Téléphone · autres équipements à venir', 'cart-outline', p.onBuy)}
        {matches('Gérer ma flotte véhicules conducteurs versements') && tile('pro-service-fleet', 'Gérer ma flotte', 'Véhicules, conducteurs, versements', 'car-sport-outline', p.onFleet, true)}
      </View>
    </View>
    {matches('Bientôt sur Zwanga livraison transport scolaire santé') && <View style={d.soon} testID="services-coming-soon">
      <View style={d.smallIcons}>{(['cube-outline', 'school-outline', 'medkit-outline'] as const).map(icon => <View style={d.soonIcon} key={icon}><Ionicons name={icon} size={16} color="#0D2240" /></View>)}</View>
      <View style={d.flex}><Text style={d.title}>Bientôt sur Zwanga</Text><Text style={d.body}>Livraison, transport scolaire, santé</Text></View>
    </View>}
  </View>;
}
