/* global __dirname */
// Actual mobile components rendered through RN Web; synthetic fixtures, no native or API claims.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const web = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement;
function fixture({form=false,scale=1}={}) {
  const assignment={id:'assignment-test',status:'ACTIVE',brand:'Véhicule',model:'de démonstration',plate:'TEST',organizationName:'Flotte de test',periodicAmountMinor:'500000',paymentPeriod:'WEEKLY',terms:'Conditions de test'};
  const native={...web,Text:({style,...props})=>{
    const flat=web.StyleSheet.flatten(style)||{};
    return h(web.Text,{...props,style:[style,{...(flat.fontSize?{fontSize:flat.fontSize*scale}:{}),...(flat.lineHeight?{lineHeight:flat.lineHeight*scale}:{})}]});
  }};
  const {default:Screen}=loader({
    react:{...React,useState:initial=>React.useState(form && initial===false ? true : initial)},
    'react-native':native,
    'react-native-safe-area-context':{SafeAreaView:({edges:_e,style,...props})=>h(web.View,{...props,style:[style,{paddingTop:24,paddingBottom:24}]})},
    'expo-router':{router:{},Stack:{Screen:()=>null},useLocalSearchParams:()=>({id:assignment.id})},
    '@expo/vector-icons':{Ionicons:()=>h('span',{'aria-hidden':true},'←')},
    '@/hooks/useAppIsActive':{useScreenIsActive:()=>true},
    '@/store/hooks':{useAppSelector:select=>select()},
    '@/store/selectors':{selectUser:()=>({id:'test-driver'})},
    '@/hooks/fleet/useFleetPaymentDeclaration':{useFleetPaymentDeclaration:()=>({ready:true,busy:false,intent:null,message:'',submit:async()=>true}),validFleetDeclaration:()=>false},
    '@/store/api/fleetPaymentsApi':{useGetFleetPaymentsQuery:()=>({currentData:{assignment,confirmedMinor:'300000',declaredMinor:'200000',nextCursor:null,
      items:[{id:'payment-test',status:'DECLARED',amountMinor:'200000',paidOn:'2026-11-13',periodLabel:'Semaine du 9 au 15 novembre',reference:'Reçu cash de démonstration',decisionNote:null}]},refetch:()=>{}})},
  })('app/services/fleet-payments/[id].tsx');
  const markup=renderToStaticMarkup(h(Screen));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${web.StyleSheet.getSheet().textContent}html,body{height:100%;margin:0;font-family:Arial,sans-serif}#root{display:flex;height:100%;flex-direction:column}</style><main id="root">${markup}</main></html>`;
}
async function main() {
  const executable=process.argv[2];
  if(!executable || !fs.existsSync(executable))throw Error('Provide local Chromium path');
  const dir=path.resolve(__dirname,'../.expo/fleet-payments-preview');
  fs.mkdirSync(dir,{recursive:true});
  const browser=await chromium(executable,fs.mkdtempSync(path.join(dir,'session-')));
  const reports=[];
  try {
    for(const scenario of [{name:'history',width:390,height:844,form:false,scale:1},{name:'form-small',width:320,height:568,form:true,scale:1},{name:'large-text',width:320,height:568,form:true,scale:1.6}]) {
      const file=path.join(dir,scenario.name+'.html');fs.writeFileSync(file,fixture(scenario));
      const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});
      const {sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true});
      const send=(m,p)=>browser.send(m,p,sessionId);
      await send('Emulation.setDeviceMetricsOverride',{width:scenario.width,height:scenario.height,deviceScaleFactor:1,mobile:true});
      await send('Page.navigate',{url:pathToFileURL(file).href});
      let report;
      for(let i=0;i<100;i++) {
        const result=await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{if(!document.querySelector('[role="button"]'))return null;const scroll=[...document.querySelectorAll('div')].find(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY));if(!scroll)return null;const actions=[...document.querySelectorAll('[role="button"],input')];const reachable=actions.every(e=>{if(scroll.contains(e))e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.height>=44});scroll.scrollTop=0;return{horizontalOverflow:Math.max(document.documentElement.scrollWidth-innerWidth,scroll.scrollWidth-scroll.clientWidth),actions:actions.length,reachable}})()`});
        report=result.result?.value;if(report)break;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      if(!report || !report.reachable || report.horizontalOverflow>1)throw Error(scenario.name+': '+JSON.stringify(report));
      reports.push({...scenario,...report});console.log(scenario.name,report);
      const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(dir,scenario.name+'.png'),Buffer.from(screenshot.data,'base64'));
      await browser.send('Target.closeTarget',{targetId});
    }
  } finally {await browser.close();}
  fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(reports,null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture};
