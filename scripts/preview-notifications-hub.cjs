/* global __dirname */
// Actual RN-Web inbox components with synthetic data. No backend, push or real messages.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement, noop = () => {};

function fixture(section, fontScale) {
  const now = new Date().toISOString();
  const notifications = [
    { id: '1', title: 'Votre commande est acceptée', body: 'Votre conducteur se prépare à vous rejoindre.', data: { type: 'booking' }, isRead: false },
    { id: '2', title: 'Paiement confirmé', body: 'Le paiement de votre dernier trajet a bien été reçu.', data: { type: 'driver_booking_payment_confirmed' }, isRead: false },
    { id: '3', title: 'Bienvenue sur Zwanga', body: 'Retrouvez ici les nouvelles de vos trajets et de votre compte.', data: {}, isRead: true },
  ].map(n => ({ ...n, createdAt: now }));
  const conversations = ['Camille M.', 'Alex B.'].map((name, i) => ({ id: `chat-${i}`, title: name, unreadCount: i ? 0 : 2,
    lastMessage: { content: i ? 'Merci, à bientôt !' : 'Je vous attends au point de départ.', createdAt: now } }));
  const native = { ...web, useWindowDimensions: () => ({ width: 390, height: 844, fontScale }),
    Text: props => {
      const style = web.StyleSheet.flatten(props.style) ?? {};
      const ratio = Math.min(fontScale, props.maxFontSizeMultiplier ?? fontScale) / fontScale;
      return h(web.Text, { ...props, style: [props.style, { fontSize: (style.fontSize ?? 14 * fontScale) * ratio,
        ...(style.lineHeight ? { lineHeight: style.lineHeight * ratio } : {}) }] });
    },
    StyleSheet: { ...web.StyleSheet, create: styles => web.StyleSheet.create(Object.fromEntries(Object.entries(styles).map(([k, s]) => [k, {
      ...s, ...(s.fontSize ? { fontSize: s.fontSize * fontScale } : {}), ...(s.lineHeight ? { lineHeight: s.lineHeight * fontScale } : {}),
    }]))) },
  };
  const mutation = () => ({ unwrap: async () => ({}) });
  const paging = { isLoading: false, isFetching: false, isError: false, hasPreviousPage: false, hasNextPage: false, refetch: noop };
  const load = loader({ 'react-native': native,
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true, style: { color, fontSize: size, width: size, textAlign: 'center' } },
      ({ 'arrow-back': '←', 'car-outline': '◇', 'notifications-outline': '♧', 'checkmark-circle-outline': '✓', 'checkmark-done': '✓', refresh: '↻', 'trash-outline': '⌫', search: '⌕', 'person-add': '+', 'headset-outline': '◉', 'chevron-forward': '›' })[name] ?? '○') },
    'react-native-safe-area-context': { SafeAreaView: ({ children, style }) => h(web.View, { style }, children) },
    'expo-router': { useRouter: () => ({ canGoBack: () => true, back: noop, setParams: noop, push: noop }), useLocalSearchParams: () => ({ section }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/features/navigation/RideModal': { RideModal: () => null },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: noop }) },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: 'preview' } }, messages: { conversations, unreadCount: 2 } }), useAppDispatch: () => noop },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: { id: 'preview', role: 'passenger' } }) },
    '@/store/api/notificationApi': {
      useGetNotificationsQuery: () => ({ data: { unreadCount: 2 } }),
      useGetNotificationPagesInfiniteQuery: () => ({ ...paging, data: { pages: [{ notifications, unreadCount: 2 }] } }),
      useMarkAllNotificationsAsReadMutation: () => [mutation], useMarkNotificationsAsReadMutation: () => [mutation], useDisableNotificationsMutation: () => [mutation],
    },
    '@/store/api/messageApi': { useDeleteConversationMutation: () => [mutation], useListConversationPagesInfiniteQuery: () => ({ ...paging, data: { pages: [{ data: conversations }] } }) },
    '@/store/api/supportApi': { useGetMySupportTicketsQuery: () => ({ isFetching: false, isError: false, currentData: { meta: { total: 2 }, data: [
      { id: 'support-1', subject: 'Question sur un paiement', status: 'in_progress', updatedAt: now },
      { id: 'support-2', subject: 'Mise à jour de mon profil', status: 'resolved', updatedAt: now, resolutionSummary: 'Votre profil est à jour.' },
    ] } }) },
  });
  const markup = renderToStaticMarkup(h(load('app/notifications.tsx').default));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${web.StyleSheet.getSheet().textContent}
    html,body{margin:0;height:100%;font-family:Arial,sans-serif}#root{height:100%;display:flex;flex-direction:column;background:white}</style><main id="root">${markup}</main></html>`;
}

async function run() {
  const directory = path.resolve(__dirname, '../.expo/notifications-preview'); fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'browser-')));
  try {
    for (const section of ['activity', 'support', 'messages']) for (const [width, height, scale] of [[390, 844, 1], [320, 568, 2]]) {
      const name = `${section}-${width}-${scale}`, file = path.join(directory, `${name}.html`);
      fs.writeFileSync(file, fixture(section, scale));
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      for (let n = 0; n < 50; n++) {
        if ((await send('Runtime.evaluate', { expression: "document.readyState==='complete' && !!document.querySelector('[role=tab]')", returnByValue: true })).result?.value) break;
        await new Promise(r => setTimeout(r, 50));
      }
      const report = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const clipped=[];
        for(const el of document.querySelectorAll('[role=button],[role=tab]')){
          el.scrollIntoView({block:'nearest',inline:'nearest'}); const b=el.getBoundingClientRect();
          if(b.left < -1||b.right>innerWidth+1||b.top < -1||b.bottom>innerHeight+1)clipped.push(el.textContent);
        }
        const horizontal=document.documentElement.scrollWidth>innerWidth;
        document.querySelectorAll('*').forEach(el=>{el.scrollTop=0;el.scrollLeft=0;});
        return {clipped,horizontal,tabs:document.querySelectorAll('[role=tab]').length};})()` })).result.value;
      fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
      console.log(name, JSON.stringify(report));
      if (report.clipped.length || report.horizontal || report.tabs !== 3) process.exitCode = 1;
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.stack); process.exitCode = 1; });
