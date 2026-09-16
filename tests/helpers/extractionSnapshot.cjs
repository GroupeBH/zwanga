const ts = require('typescript');
const { createHash } = require('node:crypto');
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function properties(file, text, category) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const result = {};
  function record(node) {
    const key = node.name.getText(source);
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate ${category}: ${key} in ${file}`);
    result[key] = printer.printNode(ts.EmitHint.Unspecified, node, source);
  }
  function visit(node) {
    if (category === 'styles' && ts.isCallExpression(node) && node.expression.getText(source) === 'StyleSheet.create') {
      if (ts.isObjectLiteralExpression(node.arguments[0])) node.arguments[0].properties.forEach(record);
    }
    if (category === 'endpoints' && ts.isPropertyAssignment(node) && ts.isCallExpression(node.initializer) &&
        /^builder\.(query|mutation)$/.test(node.initializer.expression.getText(source))) record(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}
const stylesHash = values => ({ keys: Object.keys(values).length, sha256: hash(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) });
const endpointHashes = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, hash(value)]));
module.exports = { properties, stylesHash, endpointHashes };
