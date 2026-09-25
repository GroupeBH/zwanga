const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join(' ') : words(node?.props?.children ?? '');
const summary = { account: { userId: 'user', balance: 100, withdrawableBalance: 60, reservedWithdrawalBalance: 5 },
  withdrawal: { enabled: true, blocked: false, currency: 'CDF', availableMoney: 6000, moneyPerToken: 100, minimumTokens: 1, nonWithdrawableTokens: 40 } };
const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } };
function fixture() {
  const hooks = hookHarness(); const calls = [];
  const load = loader({ react: { ...React, ...hooks.react }, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-linking': { createURL: () => 'unused' }, './WalletSheetModal': { WalletSheetModal: 'Sheet' },
  });
  const { WalletOverview, WalletRelatedLinks } = load('features/wallet/WalletOverview.tsx');
  const { WalletWithdrawalSection, WalletWithdrawalModal } = load('features/wallet/WalletWithdrawalSection.tsx');
  const wallet = { walletSummary: summary, currency: 'PTS', setActiveModal: value => calls.push(value), router: { push: path => calls.push(path) } };
  const withdrawal = { canSubmit: true, busy: false, activeIntent: null, withdrawals: [],
    confirm: () => calls.push('confirm'), checkStatus: value => calls.push(['status', value.id]) };
  const overview = () => hooks.render(() => WalletOverview({ wallet, withdrawal }));
  const history = () => hooks.render(() => WalletWithdrawalSection({ summary: wallet.walletSummary, withdrawal }));
  return { hooks, calls, wallet, withdrawal, overview, history, WalletWithdrawalModal, WalletRelatedLinks };
}
const button = (tree, label) => all(tree).find(n => n.type === 'Button' && n.props.accessibilityLabel === label);

test('wallet overview puts balance and three explicit actions first, hiding long explanations', () => {
  const f = fixture(); let tree = f.overview();
  assert.match(words(tree), /Solde disponible.*100 jetons.*Retirable.*6.?000 CDF/);
  assert.doesNotMatch(words(tree), /fidélité|abonnements|Achetés, y compris/);
  assert.deepEqual(f.calls, [], 'no automatic payment from mounting');
  for (const label of ['Recharger', 'Partager', 'Retirer']) button(tree, `${label} des jetons`).props.onPress();
  assert.deepEqual(f.calls, ['top_up', 'transfer', 'withdrawal']);
  const details = button(tree, 'Détails des jetons'); assert.equal(details.props.accessibilityState.expanded, false);
  details.props.onPress(); tree = f.overview();
  assert.equal(button(tree, 'Détails des jetons').props.accessibilityState.expanded, true);
  assert.match(words(tree), /fidélité.*en premier.*sans retrait.*achetés.*partage.*retirables/);
  const rows = all(tree).filter(n => n.props?.label && n.props?.value);
  assert.deepEqual(rows.map(n => [n.props.label, n.props.value]), [
    ['Retirables', '60 jetons'], ['Pour payer uniquement', '40 jetons'], ['Retraits en cours', '5 jetons'],
  ]);
  button(tree, 'Détails des jetons').props.onPress(); assert.doesNotMatch(words(f.overview()), /fidélité/);
  f.hooks.unmount();
});

test('withdrawal eligibility and a previous uncertain intent keep their original controls', () => {
  const f = fixture(); f.withdrawal.canSubmit = false;
  let tree = f.overview(); assert.equal(button(tree, 'Retirer des jetons').props.disabled, true);
  assert.equal(button(tree, 'Recharger des jetons').props.disabled, false);
  f.withdrawal.activeIntent = { tokens: 40 }; f.withdrawal.canSubmit = true;
  tree = f.overview(); assert.equal(button(tree, 'Retirer des jetons'), undefined);
  button(tree, 'Vérifier le retrait').props.onPress(); assert.deepEqual(f.calls, ['withdrawal']);
  f.wallet.walletSummary = { account: summary.account }; tree = f.overview();
  assert.equal(button(tree, 'Vérifier le retrait'), undefined, 'old backend must not offer an unsupported withdrawal');
  f.hooks.unmount();
});

test('compact links preserve referral navigation and restrict the driver earnings entry', () => {
  const f = fixture();
  let tree = f.WalletRelatedLinks({ wallet: f.wallet, isDriver: false });
  let links = all(tree).filter(n => n.props?.label);
  assert.deepEqual(links.map(n => n.props.label), ['Parrainage']); links[0].props.onPress();
  tree = f.WalletRelatedLinks({ wallet: f.wallet, isDriver: true });
  links = all(tree).filter(n => n.props?.label); links[1].props.onPress();
  assert.deepEqual(f.calls, ['/referrals', '/driver-earnings']); f.hooks.unmount();
});

test('withdrawal history is collapsed, bounded, and only checks an explicitly selected request', () => {
  const f = fixture();
  f.withdrawal.withdrawals = Array.from({ length: 12 }, (_, i) => ({ id: `w-${i}`, amount: 300, tokens: 3,
    currency: 'CDF', status: i === 0 ? 'initiated' : 'succeeded', message: `Statut ${i}`, createdAt: '2026-09-25T08:00:00Z' }));
  let tree = f.history(); assert.match(words(tree), /Retraits.*1 à suivre/);
  assert.doesNotMatch(words(tree), /Statut/); assert.deepEqual(f.calls, []);
  button(tree, 'Historique des retraits').props.onPress(); tree = f.history();
  const rows = all(tree).filter(n => n.type === 'Button' && n.props.accessibilityLabel?.startsWith('Vérifier le retrait'));
  assert.equal(rows.length, 10); rows[1].props.onPress(); assert.deepEqual(f.calls, [['status', 'w-1']]);
  f.withdrawal.busy = true; tree = f.history();
  assert.ok(all(tree).filter(n => n.props.accessibilityLabel?.startsWith('Vérifier le retrait')).every(n => n.props.disabled));
  button(tree, 'Historique des retraits').props.onPress(); assert.doesNotMatch(words(f.history()), /Statut/);
  f.hooks.unmount();
});

test('errors and unresolved withdrawals stay visible even when history is collapsed', () => {
  const f = fixture(); assert.equal(f.history(), null);
  f.wallet.walletSummary = { ...summary, withdrawal: { ...summary.withdrawal, enabled: false, blocked: true } };
  Object.assign(f.withdrawal, { storageError: true, historyError: true, activeIntent: { tokens: 5 } });
  const text = words(f.history());
  assert.match(text, /temporairement indisponibles/); assert.match(text, /Portefeuille à vérifier/);
  assert.match(text, /impossible à restaurer/); assert.match(text, /sans créer une autre demande/);
  assert.match(text, /Actualisez avant toute nouvelle demande/); assert.deepEqual(f.calls, []);
  f.hooks.unmount();
});

test('withdrawal form keeps amount, phone, conversion and eligibility before confirmation', () => {
  const f = fixture(); const updates = [];
  Object.assign(f.withdrawal, { tokens: '5', phone: '+243999000111', setTokens: x => updates.push(['tokens', x]), setPhone: x => updates.push(['phone', x]) });
  const tree = f.WalletWithdrawalModal({ summary, withdrawal: f.withdrawal, visible: true, onClose() {} });
  assert.match(words(tree), /Retirable.*60 jetons.*Minimum.*1 jeton.*Identité vérifiée requise.*achetés/);
  assert.match(words(tree), /1 jeton =.*100.*CDF.*numéro avant de confirmer/);
  assert.doesNotMatch(words(tree), /KYC/);
  const inputs = all(tree).filter(n => n.type === 'Input');
  assert.deepEqual(inputs.map(n => n.props.value), ['5', '+243999000111']);
  inputs[0].props.onChangeText('6'); inputs[1].props.onChangeText('+243999000222');
  assert.deepEqual(updates, [['tokens', '6'], ['phone', '+243999000222']]);
  all(tree).find(n => n.type === 'Button').props.onPress(); assert.deepEqual(f.calls, ['confirm']);
  f.hooks.unmount();
});
