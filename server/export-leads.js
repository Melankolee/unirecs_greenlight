#!/usr/bin/env node
/*
 * Выгрузка лидов из JSONL в два файла: список адресов для рассыльщика и CSV с атрибуцией.
 *
 *   sudo node /opt/presend/server/export-leads.js
 *   sudo node /opt/presend/server/export-leads.js --out /tmp --since 2026-08-01
 *
 * Заменяет связку jq + sort -u из server/README.md. Написано на Node, а не на shell,
 * по одной причине: jq на сервере может не стоять, Node стоит всегда — на нём работает
 * lead-api.js. Зависимостей нет.
 *
 * Ключи:
 *   --file PATH   что читать, по умолчанию $LEADS_FILE или /var/lib/presend/leads.jsonl
 *   --out DIR     куда писать, по умолчанию текущий каталог
 *   --since DATE  только лиды с этой даты (YYYY-MM-DD, по received_at, UTC)
 *   --all         не схлопывать дубликаты в CSV (в emails.txt адреса уникальны всегда)
 *
 * На выходе:
 *   emails.txt    по адресу на строку, уникальные — это и есть список для рассылки
 *   leads.csv     email + атрибуция, открывается в Excel и Google Sheets
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = process.env.LEADS_FILE || '/var/lib/presend/leads.jsonl';

/*
 * ip и user_agent сознательно не выгружаются. В рассылке и в разборе кампаний они не нужны,
 * а CSV расходится по почте и облачным таблицам заметно легче, чем лежит файл на сервере.
 * Понадобятся для разбора мусора — они на месте в исходном leads.jsonl.
 */
const COLUMNS = [
  'email',
  'received_at',
  'product',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'gclid',
  'landing_path'
];

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const dim = function (s) { return COLOR ? '[2m' + s + '[0m' : s; };
const bold = function (s) { return COLOR ? '[1m' + s + '[0m' : s; };

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    console.error('Ключи: --file PATH --out DIR --since YYYY-MM-DD --all');
    process.exit(1);
  }

  let raw;
  try {
    raw = fs.readFileSync(options.file, 'utf8');
  } catch (e) {
    console.error('Не прочитать ' + options.file + ': ' + e.message);
    if (e.code === 'EACCES') {
      console.error('Каталог с лидами закрыт правами 750 — запускать через sudo.');
    }
    process.exit(1);
  }

  const parsed = parseLeads(raw, options.since);

  if (!parsed.records.length) {
    console.error('В ' + options.file + ' нет подходящих записей' +
      (options.since ? ' с ' + options.since : '') + ' — файлы не тронуты.');
    process.exit(1);
  }

  const unique = dedupe(parsed.records);
  const rows = options.all ? parsed.records : unique;

  const emailsPath = path.join(options.out, 'emails.txt');
  const csvPath = path.join(options.out, 'leads.csv');

  writePrivate(emailsPath, unique.map(function (record) { return record.email; }).join('\n') + '\n');
  writePrivate(csvPath, toCsv(rows));

  report(parsed, unique, rows, options, emailsPath, csvPath);
}

/* --- Разбор ------------------------------------------------------------- */

function parseArgs(argv) {
  const options = { file: DEFAULT_FILE, out: process.cwd(), since: null, all: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--file' || arg === '--out') {
      const value = argv[++i];
      if (!value) {
        throw new Error(arg + ' требует значение');
      }
      options[arg.slice(2)] = value;
    } else if (arg === '--since') {
      const value = argv[++i];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
        throw new Error('--since ждёт дату в виде YYYY-MM-DD');
      }
      options.since = value;
    } else {
      throw new Error('Неизвестный ключ: ' + arg);
    }
  }

  return options;
}

/*
 * Битая строка не должна ронять выгрузку: в append-лог может попасть обрывок, если на диске
 * кончилось место посреди записи. Считаем такие строки и говорим о них в конце.
 */
function parseLeads(raw, since) {
  const records = [];
  let skipped = 0;

  raw.split('\n').forEach(function (line) {
    if (!line.trim()) {
      return;
    }

    let record;
    try {
      record = JSON.parse(stripLogPrefix(line));
    } catch (e) {
      skipped++;
      return;
    }

    if (!record || typeof record.email !== 'string' || !record.email.trim()) {
      skipped++;
      return;
    }

    /*
     * lead-api.js кладёт адрес уже в нижнем регистре, но приводим ещё раз: в файл могли попасть
     * строки постарше или правленые руками, а дедупликация без регистра и выгрузка с регистром
     * дали бы в списке два «разных» адреса одного человека.
     */
    record.email = record.email.trim().toLowerCase();
    /* Сравнение строк работает: received_at пишется в ISO-8601 UTC, он лексикографически упорядочен. */
    if (since && String(record.received_at || '') < since) {
      return;
    }

    records.push(record);
  });

  return { records: records, skipped: skipped };
}

/*
 * tools/dev-server.js пишет лид как «<время> {json}» — это другой формат, и без этого
 * выгрузку не прогнать локально: весь dev-лог уехал бы в «нечитаемые строки».
 * В боевом leads.jsonl строка начинается с «{», и до подмены дело не доходит.
 */
function stripLogPrefix(line) {
  const trimmed = line.trim();
  if (trimmed.charAt(0) === '{') {
    return trimmed;
  }

  const match = /^\S+\s+(\{.*)$/.exec(trimmed);
  return match ? match[1] : trimmed;
}

/* Первое вхождение, а не последнее: файл дописывается по времени, первая строка — самая ранняя. */
function dedupe(records) {
  const seen = new Set();

  return records.filter(function (record) {
    if (seen.has(record.email)) {
      return false;
    }
    seen.add(record.email);
    return true;
  });
}

/* --- CSV ---------------------------------------------------------------- */

function toCsv(records) {
  const lines = [COLUMNS.join(',')];

  records.forEach(function (record) {
    lines.push(COLUMNS.map(function (column) {
      return csvCell(record[column]);
    }).join(','));
  });

  /* BOM: без него Excel читает кириллицу в utm-метках как кракозябры. */
  return '﻿' + lines.join('\n') + '\n';
}

/*
 * Экранируем дважды. Кавычки — требование формата. Ведущие = + - @ — защита от того,
 * что Excel и Sheets считают такую ячейку формулой: utm-метку в объявление пишет кто угодно,
 * а CSV потом открывают двойным щелчком.
 */
function csvCell(value) {
  let text = typeof value === 'string' ? value : (value == null ? '' : String(value));

  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}

/* --- Вывод -------------------------------------------------------------- */

/* 0600: в файлах лежат адреса живых людей, а выгрузка обычно делается в общий /tmp. */
function writePrivate(file, content) {
  try {
    fs.writeFileSync(file, content, { mode: 0o600 });
  } catch (e) {
    console.error('Не записать ' + file + ': ' + e.message);
    process.exit(1);
  }
}

function report(parsed, unique, rows, options, emailsPath, csvPath) {
  const duplicates = parsed.records.length - unique.length;

  console.log(bold(String(unique.length)) + ' уникальных адресов' +
    (duplicates ? dim(', дубликатов отброшено: ' + duplicates) : ''));
  console.log('  ' + emailsPath);
  console.log('  ' + csvPath + dim('  (' + rows.length + ' строк' + (options.all ? ', --all' : '') + ')'));

  if (options.since) {
    console.log(dim('  фильтр: с ' + options.since));
  }
  if (parsed.skipped) {
    console.log(dim('  пропущено нечитаемых строк: ' + parsed.skipped));
  }
}

main();
