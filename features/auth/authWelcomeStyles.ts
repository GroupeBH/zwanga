import { StyleSheet } from 'react-native';

// Local to the public welcome screen: do not recolor the signed-in application.
export const WELCOME_COLORS = {
  orange: '#D3440D',
  orangeText: '#B93409',
  peach: '#FFF1E8',
  ink: '#141B2B',
  muted: '#535F73',
  surface: '#F5F6F8',
  border: '#DCE1E8',
  green: '#078637',
  white: '#FFFFFF',
};

const c = WELCOME_COLORS;
export const welcomeStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.white },
  scroll: { flex: 1 },
  content: { flexGrow: 1 },
  body: { width: '100%', maxWidth: 528, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 12 },
  compactBody: { paddingHorizontal: 20, paddingTop: 20 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6, color: c.ink },
  subtitle: { marginTop: 14, fontSize: 16, lineHeight: 22, color: c.muted },
  benefits: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  benefit: { width: '48%', flexGrow: 1, minHeight: 55, borderRadius: 16, backgroundColor: c.surface, padding: 10, gap: 10, flexDirection: 'row', alignItems: 'center' },
  stackedBenefit: { width: '100%' },
  benefitIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: c.peach, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '500', color: c.ink },
  location: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 10, marginTop: 2 },
  locationText: { flex: 1, fontSize: 12, lineHeight: 18, color: c.muted },
  locationDetail: { fontSize: 13, lineHeight: 20, color: c.muted, marginBottom: 14 },
  actions: { gap: 9, paddingTop: 9 },
  primary: { minHeight: 55, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 28, backgroundColor: c.orange, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  primaryText: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: c.white, flexShrink: 1, textAlign: 'center' },
  secondary: { minHeight: 50, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 28, borderWidth: 1, borderColor: c.border, justifyContent: 'center', alignItems: 'center', backgroundColor: c.white },
  secondaryText: { fontSize: 16, lineHeight: 22, color: c.ink, textAlign: 'center' },
  emphasis: { fontWeight: '700' },
  legalLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, marginTop: 1 },
  legal: { fontSize: 12, lineHeight: 18, textAlign: 'center', color: c.muted },
  legalEmphasis: { color: c.orangeText, textDecorationLine: 'underline' },
  disabled: { opacity: 0.65 },
  error: { fontSize: 13, lineHeight: 18, color: '#B42318' },
});
