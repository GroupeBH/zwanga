// Report the current suite even when it stalls before producing a test result.
const path = require('node:path');
module.exports = class AuditProgress {
  onTestFileStart(test) { process.stdout.write(`[audit-suite-start] ${path.relative(test.context.config.rootDir, test.path)}\n`); }
};
