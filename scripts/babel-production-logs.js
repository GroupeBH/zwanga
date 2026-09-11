/** Only included in release bundles. Keep warnings/errors and their diagnostics. */
module.exports = function ({ types: t }) {
  return {
    name: 'zwanga-production-logs',
    visitor: {
      CallExpression(path) {
        const callee = path.node.callee;
        if (!t.isMemberExpression(callee) || callee.computed ||
            !t.isIdentifier(callee.object, { name: 'console' }) ||
            !t.isIdentifier(callee.property) ||
            !['log', 'info', 'debug'].includes(callee.property.name) ||
            path.scope.getBinding('console')) return;
        // Preserve side effects of arguments (e.g. an awaited function call).
        const args = path.get('arguments').filter((arg) => !arg.isPure()).map((arg) =>
          t.isSpreadElement(arg.node) ? t.arrayExpression([arg.node]) : arg.node);
        path.replaceWith(t.sequenceExpression([...args, t.unaryExpression('void', t.numericLiteral(0))]));
      },
    },
  };
};
