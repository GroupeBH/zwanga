// Mechanical, declaration-preserving split; the public @/types barrel is retained.
const fs = require('node:fs');
const ts = require('typescript');
const file = 'types/index.ts';
const text = fs.readFileSync(file, 'utf8');
const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const domains = [
  ['common', 'UserRole', 'SubscriptionStatus'],
  ['users', 'User', 'TripDriverInfo'],
  ['subscriptions', 'SubscriptionPlanSummary', 'SubscribeToProPayload'],
  ['trips', 'GeoPoint', 'Booking'],
  ['interruptions', 'PassengerTripInterruptionRequest', 'DriverTripInterruptionRequest'],
  ['wallet', 'BookingPayment', 'WalletTransferResponse'],
  ['referrals', 'ReferralRewardStatus', 'ReferralWithdrawal'],
  ['earnings', 'DriverEarningStatus', 'DriverTripRevenueSummary'],
  ['messaging', 'BasicUserInfo', 'Conversation'],
  ['identity', 'KycStatus', 'Review'],
  ['tripRequests', 'TripRequestStatus', 'DriverOfferWithTripRequest'],
  ['safety', 'EmergencyContact', 'TripSafetyTripHistory'],
  ['places', 'FavoriteLocationType', 'FavoriteLocation'],
  ['support', 'SupportFaqEntry', 'SupportTicketListResponse'],
  ['alerts', 'SafetyAlertType', 'UserReport'],
  ['notifications', 'WhatsAppNotificationData', 'MarkNotificationsResponse'],
];
const owners = new Map();
const grouped = domains.map(([domain, first, last]) => {
  const start = source.statements.findIndex(statement => statement.name?.text === first);
  const end = source.statements.findIndex(statement => statement.name?.text === last);
  if (start < 0 || end < start) throw new Error(`Missing range: ${domain}`);
  const statements = source.statements.slice(start, end + 1);
  for (const statement of statements) {
    if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement) && !ts.isEnumDeclaration(statement)) throw new Error('Only domain declarations supported');
    if (owners.has(statement.name.text)) throw new Error('Duplicate declaration');
    owners.set(statement.name.text, domain);
  }
  return { domain, statements };
});
if (owners.size !== source.statements.length) throw new Error('Unassigned declarations');
const writes = grouped.map(({ domain, statements }) => {
  const references = new Map();
  function visit(node) {
    const name = ts.isTypeReferenceNode(node) ? node.typeName.getText(source) :
      ts.isExpressionWithTypeArguments(node) ? node.expression.getText(source) : null;
    const owner = owners.get(name);
    if (owner && owner !== domain) {
      if (!references.has(owner)) references.set(owner, new Set());
      references.get(owner).add(name);
    }
    ts.forEachChild(node, visit);
  }
  statements.forEach(visit);
  const imports = [...references].map(([owner, names]) => `import type { ${[...names].sort().join(', ')} } from './${owner}';`).join('\n');
  const content = `${imports}${imports ? '\n\n' : ''}${statements.map(statement => statement.getFullText(source).trim()).join('\n\n')}\n`;
  if (content.split('\n').length > 400) throw new Error(`Domain too large: ${domain}`);
  return { file: `types/${domain}.ts`, content };
});
for (const write of writes) if (fs.existsSync(write.file)) throw new Error(`Refusing to overwrite ${write.file}`);
if (process.argv.includes('--write')) {
  for (const write of writes) fs.writeFileSync(write.file, write.content);
  fs.writeFileSync(file, '// Public type entry point. Domain modules use type-only imports to avoid runtime cycles.\n' +
    domains.map(([domain]) => `export ${domain === 'notifications' ? '' : 'type '}* from './${domain}';`).join('\n') + '\n');
}
console.log(writes.map(write => `${write.file}: ${write.content.split('\n').length} lignes`).join('\n'));
