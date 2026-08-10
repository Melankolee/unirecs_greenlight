#!/usr/bin/env node
/*
 * Прогон текста предложения через правила детекции. Инструмент разработки.
 *
 *   node tools/check.js examples/rushed-proposal.txt
 *   node tools/check.js examples/rushed-proposal.txt --json   # объект для demo-data.js
 *   cat draft.txt | node tools/check.js
 *
 * Зачем: проверить на живом тексте, что продукт должен поймать, и получить готовый
 * объект примера при добавлении четвёртого примера в демо.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const rules = require('./rules');

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  red: function (s) { return COLOR ? '[31m' + s + '[0m' : s; },
  yellow: function (s) { return COLOR ? '[33m' + s + '[0m' : s; },
  green: function (s) { return COLOR ? '[32m' + s + '[0m' : s; },
  dim: function (s) { return COLOR ? '[2m' + s + '[0m' : s; },
  bold: function (s) { return COLOR ? '[1m' + s + '[0m' : s; }
};

const LIGHT = { red: '● ○ ○', yellow: '○ ● ○', green: '○ ○ ●' };
const SEVERITY_MARK = { critical: c.red('critical'), warning: c.yellow('warning'), note: c.green('note') };
const CATEGORY_LABEL = {
  placeholder: 'Placeholder',
  ai_cliche: 'AI cliché',
  tos_risk: 'Platform rules'
};

function main() {
  const args = process.argv.slice(2);
  const asJson = args.indexOf('--json') !== -1;
  const file = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];

  readInput(file, function (text) {
    if (!text.trim()) {
      console.error('Пустой ввод. Использование: node tools/check.js examples/rushed-proposal.txt');
      process.exit(1);
    }

    const issues = rules.analyze(text);
    const verdict = rules.verdictFromIssues(issues);

    if (asJson) {
      printJson(file, text, verdict, issues);
    } else {
      printReport(file, text, verdict, issues);
    }

    /* Код возврата удобен для будущего CI: red = 2, yellow = 1, green = 0. */
    process.exit(verdict === 'red' ? 2 : verdict === 'yellow' ? 1 : 0);
  });
}

function readInput(file, done) {
  if (file) {
    done(fs.readFileSync(file, 'utf8'));
    return;
  }
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) { buffer += chunk; });
  process.stdin.on('end', function () { done(buffer); });
}

function printReport(file, text, verdict, issues) {
  const paint = verdict === 'red' ? c.red : verdict === 'yellow' ? c.yellow : c.green;

  console.log('');
  console.log(c.dim('  file    ') + (file ? path.relative(process.cwd(), file) : '<stdin>'));
  console.log(c.dim('  length  ') + text.length + ' chars, ' + text.split(/\s+/).length + ' words');
  console.log('');
  console.log('  ' + paint(LIGHT[verdict]) + '  ' + c.bold(paint(rules.captionFor(verdict, issues))));
  console.log('');

  if (!issues.length) {
    console.log(c.dim('  Ничего не найдено.'));
    console.log('');
    return;
  }

  issues.forEach(function (issue, index) {
    console.log('  ' + c.bold(String(index + 1) + '. ' + issue.title) +
      '  ' + c.dim('[' + CATEGORY_LABEL[issue.category] + ' · ') + SEVERITY_MARK[issue.severity] + c.dim(']'));
    console.log('     ' + c.dim('match     ') + JSON.stringify(issue.match) +
      (issue.occurrence > 1 ? c.dim(' (occurrence ' + issue.occurrence + ')') : ''));
    console.log('     ' + c.dim('context   ') + contextFor(text, issue));
    console.log('     ' + c.dim('detail    ') + issue.detail);
    console.log('     ' + c.dim('fix       ') + issue.fix);
    console.log('');
  });

  const counts = { critical: 0, warning: 0, note: 0 };
  issues.forEach(function (i) { counts[i.severity]++; });
  console.log(c.dim('  итого: ') +
    counts.critical + ' critical, ' + counts.warning + ' warning, ' + counts.note + ' note');
  console.log('');
}

/* Строка вокруг совпадения — чтобы было видно, что именно поймалось. */
function contextFor(text, issue) {
  let index = -1;
  for (let i = 0; i < issue.occurrence; i++) {
    index = text.indexOf(issue.match, index + 1);
  }
  const from = Math.max(0, index - 30);
  const to = Math.min(text.length, index + issue.match.length + 30);

  const before = text.slice(from, index).replace(/\s+/g, ' ');
  const hit = text.slice(index, index + issue.match.length).replace(/\s+/g, ' ');
  const after = text.slice(index + issue.match.length, to).replace(/\s+/g, ' ');

  return (from > 0 ? '…' : '') + c.dim(before) + c.bold(hit) + c.dim(after) +
    (to < text.length ? '…' : '');
}

/* Готовый объект для вставки в assets/js/demo-data.js. */
function printJson(file, text, verdict, issues) {
  const id = file
    ? path.basename(file).replace(/\.[^.]+$/, '')
    : 'new-example';

  console.log(JSON.stringify({
    id: id,
    label: id.replace(/[-_]/g, ' ').replace(/^./, function (s) { return s.toUpperCase(); }),
    verdict: verdict,
    text: text.replace(/\r\n/g, '\n').trim(),
    issues: issues
  }, null, 2));
}

main();
