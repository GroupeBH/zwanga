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
    label: "Téléphone pour votre activité",
    status,
    principalMinor: "18000000",
    paidMinor: status === "offered" ? "0" : "6500000",
    dueMinor: status === "offered" ? "0" : "150000",
    policyVersion: "asset-credit-v1",
    policyText:
      "5 % de vos revenus remboursent le matériel, en plus de la commission habituelle. Pour le cash, cette part est prélevée sur le solde rechargé. Un montant non prélevé reste dû.",
    terms:
      "Offre de démonstration : le téléphone est remis après votre accord. Le montant total à rembourser est de 180 000 FC. Aucun prélèvement avant la remise.",
    entries: [],
  };
  const { default: Screen } = loader({
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
    "@/store/hooks": { useAppSelector: (select) => select() },
    "@/store/selectors": { selectUser: () => ({ id: "preview-driver" }) },
    "@/services/tokenSession": { getTokenSessionVersion: () => 1 },
    "@/store/api/assetCreditApi": {
      useGetAssetCreditQuery: () => ({ data: credit }),
      useDecideAssetCreditMutation: () => [noop, { isLoading: false }],
      useRepayAssetCreditMutation: () => [noop, { isLoading: false }],
    },
  })("app/services/credit/[id].tsx");
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
      { name: "active", width: 390, height: 844, status: "active", scale: 1 },
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
          expression: `(()=>{if(!document.querySelector('[role="button"]'))return null;const scroll=[...document.querySelectorAll('div')].find(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY));if(!scroll)return null;const box=scroll.getBoundingClientRect();const actions=[...document.querySelectorAll('[role="button"],[role="checkbox"],input')];const reachable=actions.every(e=>{if(scroll.contains(e))e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.height>=44});scroll.scrollTop=0;return{horizontalOverflow:Math.max(document.documentElement.scrollWidth-innerWidth,scroll.scrollWidth-scroll.clientWidth),actions:actions.length,reachable,scrollHeight:scroll.scrollHeight,visibleHeight:box.height}})()`,
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
