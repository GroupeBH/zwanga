// Remove only immediately repeated leading comments left by the old import printer.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const files = [...new Set(execFileSync('git', ['ls-files', '--modified', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'))]
  .filter(file => /^(app|components|features|hooks|types|store)\//.test(file) && /\.tsx?$/.test(file));
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const first = source.statements[0]?.getStart(source) ?? 0;
  const prefix = text.slice(0, first);
  const comments = ts.getLeadingCommentRanges(prefix, 0) || [];
  let last = null;
  const duplicates = [];
  for (const comment of comments) {
    const normalized = prefix.slice(comment.pos, comment.end).replace(/\s+/g, ' ');
    if (normalized === last) duplicates.push(comment);
    last = normalized;
  }
  if (!duplicates.length) continue;
  let updated = text;
  for (const comment of duplicates.reverse()) updated = updated.slice(0, comment.pos) + updated.slice(comment.end);
  const remainingPrefix = updated.slice(0, first - duplicates.reduce((total, item) => total + item.end - item.pos, 0));
  updated = remainingPrefix.trimEnd() + '\n' + updated.slice(remainingPrefix.length);
  fs.writeFileSync(file, updated);
  console.log(`${file}: removed ${duplicates.length} repeated header(s)`);
}
