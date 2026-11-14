import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/styles';

/** Content-sized auth layouts: scrolling remains available for large text/keyboards. */
export const authSimpleStyles = StyleSheet.create({
  step: { flex: 0, gap: 16, paddingTop: 16, paddingBottom: 16 },
  heading: { gap: 4 },
  brand: { fontSize: 20, fontWeight: '700', color: Colors.primaryDark },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: Colors.gray[900] },
  subtitle: { fontSize: 14, lineHeight: 20, color: Colors.gray[700] },
  form: { gap: 8 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.gray[800] },
  inputWrapper: { height: 'auto', minHeight: 52, paddingHorizontal: 12, marginBottom: 0 },
  input: { height: 'auto', minHeight: 50, paddingVertical: 10, minWidth: 0 },
  button: { height: 'auto', minHeight: 52, paddingHorizontal: 12, paddingVertical: 12, shadowOpacity: 0, elevation: 0 },
  buttonText: { flexShrink: 1, textAlign: 'center', fontSize: 16, lineHeight: 22 },
  divider: { marginVertical: 4 },
  legal: { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 },
  identity: { gap: 6, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.gray[200] },
  identityName: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: Colors.gray[900] },
  edit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
