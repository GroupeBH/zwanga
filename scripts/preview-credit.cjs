/* global __dirname */
// Actual RN screen via RN Web, synthetic API fixtures only. Not a native/device test.
const fs = require("node:fs"),
  path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Buffer } = require("node:buffer");
const React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server"),
  web = require("react-native-web");
const { loader } = require("../tests/helpers/loadTypeScript.cjs");
const { chromium } = require("./preview-arrival-payment.cjs");
const h = React.createElement;
function fixture(status = "active", scale = 1) {
  let simulationState = 0;
  const native = {
    ...web,
    Text: ({ style, ...props }) => {
      const flat = web.StyleSheet.flatten(style) || {};
      return h(web.Text, {
        ...props,
        style: [
          style,
          {
            ...(flat.fontSize ? { fontSize: flat.fontSize * scale } : {}),
            ...(flat.lineHeight ? { lineHeight: flat.lineHeight * scale } : {}),
          },
        ],
      });
    },
  };
  const noop = () => ({ unwrap: async () => ({}) });
  const credit = {
    id: "11111111-1111-4111-8111-111111111111",
    label: "Véhicule pour votre activité",
    status,
    principalMinor: "18000000",
    cashPriceMinor: '16000000', creditFeeMinor: '2000000', costDisclosureVersion: 'asset-credit-cost-v1',
    installmentCount: 12, installmentPeriod: 'month', minimumDueMinor: 0,
    installments: Array.from({ length: 12 }, (_, i) => ({ ordinal: i + 1, amountMinor: 1500000,
      remainingMinor: status === 'offered' ? 1500000 : Math.min(1500000, Math.max(0, (i + 1) * 1500000 - 6500000)),
      dueAt: status === 'offered' ? null : new Date(Date.UTC(2026, 11 + i, 15)).toISOString() })),
    paidMinor: status === "offered" ? "0" : "6500000",
    dueMinor: status === "offered" ? "0" : "150000",
    assetKind: 'vehicle',
    repaymentBps: 1500,
    totalRepaymentBps: 2000,
    commissionBps: 500,
    policyVersion: "asset-credit-v2",
    policyText:
      "Les pourcentages de vos crédits s’additionnent. Pour le cash, le remboursement vient du solde rechargé ; le reliquat reste dû.",
    terms:
      "Offre fictive pour vérifier l’interface : remise après accord. Prix et accessoires inclus dans ce contrat de démonstration. Aucun prélèvement avant la remise.",
    entries: [],
  };
  const load = loader({
    react: status === 'simulation' ? { ...React, useState: () => {
      const values = ['100000', '1000', true];
      return [values[simulationState++], () => {}];
    } } : React,
    "react-native": native,
    "react-native-safe-area-context": {
      SafeAreaView: ({ edges: _e, style, ...props }) =>
        h(web.View, {
          ...props,
          style: [style, { paddingTop: 24, paddingBottom: 24 }],
        }),
    },
    "expo-router": {
      router: {},
      Stack: { Screen: () => null },
      useLocalSearchParams: () => ({ id: credit.id }),
    },
    "@react-native-async-storage/async-storage": { getItem: async () => null },
    "@expo/vector-icons": {
      Ionicons: () => h("span", { "aria-hidden": true }, "←"),
    },
    "@/hooks/useAppIsActive": { useScreenIsActive: () => true },
    "@/store/hooks": { useAppSelector: (select) => select({ zwangaApi: { config: { online: true } } }) },
    "@/store/selectors": { selectUser: () => ({ id: "preview-driver" }) },
    "@/services/tokenSession": { getTokenSessionVersion: () => 1 },
    "@/store/api/assetCreditApi": {
      useGetAssetCreditProductsQuery: () => ({ currentData: { canRequest: true, items:
        ['phone', 'helmet', 'gps_tracker', 'delivery_equipment', 'equipment', 'vehicle'].map(kind => ({ kind, enabled: true })) } }),
      useGetAssetCreditsQuery: () => ({ currentData: { items: [] } }),
      useGetAssetCreditRequestsQuery: () => ({ currentData: { items: [] } }),
      useRequestAssetCreditMutation: () => [noop, { isLoading: false }],
      useGetAssetCreditQuery: () => ({ data: credit }),
      useDecideAssetCreditMutation: () => [noop, { isLoading: false }],
      useRepayAssetCreditMutation: () => [noop, { isLoading: false }],
    },
  });
  const Screen = status === 'simulation' ? () => {
    simulationState = 0;
    const { ServiceLayout } = load('features/pro-services/ServiceLayout.tsx');
    const { CreditCostPreview } = load('features/pro-services/CreditCostPreview.tsx');
    return h(ServiceLayout, { title: 'Mon crédit' }, h(CreditCostPreview, { credit }));
  } : load(status === 'catalogue' ? "app/services/credit/index.tsx" : "app/services/credit/[id].tsx").default;
  const markup = renderToStaticMarkup(h(Screen));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${web.StyleSheet.getSheet().textContent}html,body{height:100%;margin:0;font-family:Arial,sans-serif}#root{display:flex;height:100%;flex-direction:column}</style><main id="root">${markup}</main></html>`;
}
async function main() {
  const executable = process.argv[2];
  if (!executable || !fs.existsSync(executable))
    throw Error("Provide local Chromium path");
  const dir = path.resolve(__dirname, "../.expo/credit-preview");
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium(
    executable,
    fs.mkdtempSync(path.join(dir, "session-")),
  );
  const reports = [];
  try {
    for (const scenario of [
      { name: "catalogue", width: 390, height: 844, status: "catalogue", scale: 1 },
      { name: "catalogue-small", width: 320, height: 568, status: "catalogue", scale: 1 },
      { name: "catalogue-large-text", width: 320, height: 568, status: "catalogue", scale: 1.6 },
      { name: "active", width: 390, height: 844, status: "active", scale: 1 },
      { name: 'simulation-small', width: 320, height: 568, status: 'simulation', scale: 1 },
      { name: 'simulation-large-text', width: 320, height: 568, status: 'simulation', scale: 1.6 },
      {
        name: "offer-small",
        width: 320,
        height: 568,
        status: "offered",
        scale: 1,
      },
      {
        name: "large-text",
        width: 320,
        height: 568,
        status: "active",
        scale: 1.6,
      },
    ]) {
      const file = path.join(dir, `${scenario.name}.html`);
      fs.writeFileSync(file, fixture(scenario.status, scenario.scale));
      const { targetId } = await browser.send("Target.createTarget", {
        url: "about:blank",
      });
      const { sessionId } = await browser.send("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      const send = (m, p) => browser.send(m, p, sessionId);
      await send("Emulation.setDeviceMetricsOverride", {
        width: scenario.width,
        height: scenario.height,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await send("Page.navigate", { url: pathToFileURL(file).href });
      let report;
      for (let i = 0; i < 100; i++) {
        const evaluated = await send("Runtime.evaluate", {
          returnByValue: true,
          expression: `(()=>{if(!document.querySelector('[role="button"]'))return null;const scroll=[...document.querySelectorAll('div')].find(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY));if(!scroll)return null;const box=scroll.getBoundingClientRect();const actions=[...document.querySelectorAll('[role="button"],[role="radio"],[role="checkbox"],input')];const reachable=actions.every(e=>{if(scroll.contains(e))e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.height>=44});scroll.scrollTop=0;return{horizontalOverflow:Math.max(document.documentElement.scrollWidth-innerWidth,scroll.scrollWidth-scroll.clientWidth),actions:actions.length,reachable,scrollHeight:scroll.scrollHeight,visibleHeight:box.height}})()`,
        });
        report = evaluated.result?.value;
        if (report) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!report || !report.reachable || report.horizontalOverflow > 1)
        throw Error(`${scenario.name}: ${JSON.stringify(report)}`);
      reports.push({ ...scenario, ...report });
      console.log(scenario.name, report);
      const screenshot = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      fs.writeFileSync(
        path.join(dir, `${scenario.name}.png`),
        Buffer.from(screenshot.data, "base64"),
      );
      await browser.send("Target.closeTarget", { targetId });
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    path.join(dir, "measurements.json"),
    JSON.stringify(reports, null, 2),
  );
}
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = { fixture };
