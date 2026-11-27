/* global __dirname */
// Static reachability inventory, not interaction coverage or a test result.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const rel = p => path.relative(root, p).replaceAll('\\', '/');
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(d =>
  d.isDirectory() ? walk(path.join(dir,d.name)) : [path.join(dir,d.name)]);
const resolve = (from, name) => {
  if (!name.startsWith('.') && !name.startsWith('@/')) return;
  const base = name.startsWith('@/') ? path.join(root,name.slice(2)) : path.resolve(path.dirname(from), name);
  return [base,...['.tsx','.ts','.js','.cjs','/index.tsx','/index.ts'].map(e=>base+e)]
    .find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
};
const cache = new Map();
function moduleInfo(file) {
  if (cache.has(file)) return cache.get(file);
  const source=fs.readFileSync(file,'utf8');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const info={file:rel(file),imports:[],actions:[],apiHooks:new Set(),lines:source.split('\n').length};
  cache.set(file,info);
  const visit = node => {
    if ((ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const target=resolve(file,node.moduleSpecifier.text);
      if(target && /^(app|components|features|hooks)\//.test(rel(target))) info.imports.push(target);
      if (/store\/api/.test(node.moduleSpecifier.text) && ts.isImportDeclaration(node))
        node.importClause?.namedBindings?.elements?.forEach(e=>info.apiHooks.add(e.name.text));
    }
    if (ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
      const attrs=node.attributes.properties.filter(ts.isJsxAttribute);
      const label=attrs.find(a=>['accessibilityLabel','title','label','placeholder','testID'].includes(a.name.getText(ast)));
      const disabled=attrs.find(a=>a.name.getText(ast)==='disabled');
      for(const a of attrs) if(/^on(Press|Submit|Confirm|Cancel|Accept|Reject|Retry|Send|Save|Delete|Select|Change|ValueChange|ChangeText|Refresh|Close|Back)$/.test(a.name.getText(ast))) {
        info.actions.push({file:info.file,line:ast.getLineAndCharacterOfPosition(a.pos).line+1,
          component:node.tagName.getText(ast),event:a.name.getText(ast),
          handler:(a.initializer?.getText(ast)||'').replace(/\s+/g,' ').slice(0,220),
          label:(label?.initializer?.getText(ast)||'').replace(/\s+/g,' ').slice(0,120),
          disabled:(disabled?.initializer?.getText(ast)||'').replace(/\s+/g,' ').slice(0,120)});
      }
    }
    ts.forEachChild(node,visit);
  }; visit(ast); return info;
}
const screens=walk(path.join(root,'app')).filter(f=>f.endsWith('.tsx')&&!path.basename(f).startsWith('_'));
const tests=walk(path.join(root,'tests')).filter(f=>/\.test\.(js|cjs)$/.test(f));
const testReferences=new Map();
for(const test of tests){
  const source=fs.readFileSync(test,'utf8');
  for(const match of source.matchAll(/['"`]((?:\.\.\/|@\/|app\/|components\/|features\/|hooks\/)[^'"`\r\n]+)['"`]/g)){
    const candidate=match[1].startsWith('../')||match[1].startsWith('@/')?resolve(test,match[1]):resolve(path.join(root,'index.ts'),'./'+match[1]);
    if(candidate){ const refs=testReferences.get(candidate)||new Set();refs.add(rel(test));testReferences.set(candidate,refs); }
  }
}
const inventory=screens.sort().map(screen=>{
  const visited=new Set(), queue=[screen];
  while(queue.length){const file=queue.pop();if(visited.has(file))continue;visited.add(file);queue.push(...moduleInfo(file).imports);}
  const modules=[...visited].map(moduleInfo);
  return {screen:rel(screen), sourceModules:modules.length,
    actions:modules.flatMap(m=>m.actions), apiHooks:[...new Set(modules.flatMap(m=>[...m.apiHooks]))].sort(),
    referencedTests:[...new Set([...visited].flatMap(f=>[...(testReferences.get(f)||[])]))].sort()};
});
const directory=path.join(root,'.expo');fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'screen-action-inventory-2026-11-27.json'),JSON.stringify({
  scope:'Static JSX actions reachable through local screen/component/hook imports. References are not execution proof; render props and runtime branches require manual review.',inventory
},null,2));
const unique=new Map(inventory.flatMap(s=>s.actions.map(a=>[a.file+':'+a.line+':'+a.event,a])));
const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
fs.writeFileSync(path.join(directory,'screen-action-inventory-2026-11-27.csv'),
  ['Fichier;Ligne;Composant;Evenement;Libelle source;Garde disabled;Action source',...[...unique.values()].map(a=>[a.file,a.line,a.component,a.event,a.label,a.disabled,a.handler].map(quote).join(';'))].join('\n'));
console.log(JSON.stringify({screens:inventory.length,reachableModules:cache.size,uniqueJsxActions:unique.size,withoutDirectTestReferences:inventory.filter(s=>!s.referencedTests.length).map(s=>s.screen)}));
