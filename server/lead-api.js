#!/usr/bin/env node
/*
 * Продакшен-обработчик POST /api/lead. Без зависимостей.
 *
 *   node server/lead-api.js
 *
 * Слушает только 127.0.0.1 — наружу его выставляет nginx (server/nginx-presend.conf).
 * Контракт тот же, что у мока в tools/dev-server.js и в разделе 4.2 BUSINESS-LOGIC.md:
 * тело с email + атрибуцией, ответ 200 {ok: true}. Фронт править не нужно.
 *
 * Лиды пишутся в JSONL: одна строка — один лид. Формат выбран не от бедности:
 * append никогда не теряет уже записанное, файл читается глазами, бэкапится обычным
 * cp и выгружается в рассыльщик одной командой (см. server/README.md).
 *
 * Настройки — через переменные окружения (см. presend-lead.service):
 *   PORT            порт, по умолчанию 8787
 *   HOST            интерфейс, по умолчанию 127.0.0.1
 *   LEADS_FILE      куда писать, по умолчанию /var/lib/presend/leads.jsonl
 *   ALLOWED_ORIGIN  CORS: нужен, только если лендинг живёт на другом домене
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const LEADS_FILE = process.env.LEADS_FILE || '/var/lib/presend/leads.jsonl';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';

/* Тело лида — несколько сотен байт. Всё, что больше, приходит не от формы. */
const MAX_BODY_BYTES = 4096;
const MAX_FIELD_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254; /* RFC 5321 */

/* Окно и лимит на один IP. Живой человек отправляет форму один-два раза. */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_HITS = 5;

/*
 * Список одноразовых доменов дублирует assets/js/config.js намеренно.
 * На клиенте это UX (сказать человеку сразу), здесь — единственная реальная
 * проверка: до эндпоинта можно достучаться и минуя форму. Списки не обязаны
 * совпадать строка в строку, серверный имеет право быть строже.
 */
const DISPOSABLE_EXACT = [
  'mailinator.com',
  'yopmail.com',
  'dispostable.com',
  'trashmail.com',
  'getnada.com',
  'maildrop.cc',
  'fakeinbox.com',
  '10minutemail.com',
  'throwawaymail.com',
  'sharklasers.com'
];
const DISPOSABLE_CONTAINS = [
  'tempmail',
  'temp-mail',
  'guerrillamail',
  'mailinator',
  'trashmail',
  'yopmail'
];

const ATTRIBUTION_FIELDS = ['gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term'];

const hits = new Map();

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (url.pathname === '/health') {
    return send(res, 200, { ok: true });
  }
  if (url.pathname !== '/api/lead') {
    return send(res, 404, { ok: false, error: 'Not found' });
  }
  if (req.method === 'OPTIONS') {
    return preflight(res);
  }
  if (req.method !== 'POST') {
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  handleLead(req, res);
});

function handleLead(req, res) {
  const ip = clientIp(req);

  if (rateLimited(ip)) {
    /* 429 фронт покажет как обычную ошибку сети: кнопка снова активна, конверсия не уходит. */
    log('rate-limited', ip);
    return send(res, 429, { ok: false, error: 'Too many requests' });
  }

  readBody(req, function (err, body) {
    if (err) {
      log('body rejected', ip, err.message);
      send(res, err.status || 400, { ok: false, error: err.message });
      /* Остаток тела нам не нужен, но ответ должен уйти раньше разрыва. */
      req.destroy();
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid JSON' });
    }

    if (!payload || typeof payload !== 'object') {
      return send(res, 400, { ok: false, error: 'Invalid payload' });
    }

    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    if (!validEmail(email)) {
      log('rejected email', ip, email.slice(0, 60));
      return send(res, 400, { ok: false, error: 'Invalid email' });
    }

    const record = buildRecord(payload, email, req, ip);

    /*
     * Пишем до ответа: если запись не удалась, клиент должен узнать об этом и повторить.
     * Отдать 200 и потерять лид — худший из возможных исходов, вся страница существует
     * ради этой строки.
     */
    fs.appendFile(LEADS_FILE, JSON.stringify(record) + '\n', function (writeErr) {
      if (writeErr) {
        console.error('[presend] запись лида не удалась:', writeErr.message);
        return send(res, 500, { ok: false, error: 'Storage error' });
      }
      log('lead', record.email, record.source, record.gclid ? 'gclid=' + record.gclid : '');
      send(res, 200, { ok: true });
    });
  });
}

/* --- Разбор запроса ---------------------------------------------------- */

function readBody(req, callback) {
  let size = 0;
  const chunks = [];
  let done = false;

  function finish(err, value) {
    if (done) {
      return;
    }
    done = true;
    callback(err, value);
  }

  req.on('data', function (chunk) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      /* Не рвём сокет сразу: сначала пусть уйдёт 413, иначе клиент увидит просто обрыв. */
      req.pause();
      const err = new Error('Payload too large');
      err.status = 413;
      return finish(err);
    }
    chunks.push(chunk);
  });

  req.on('end', function () {
    finish(null, Buffer.concat(chunks).toString('utf8'));
  });

  req.on('error', function (err) {
    finish(err);
  });
}

/*
 * Формат тот же, что на клиенте (assets/js/lead.js), плюс верхняя граница длины:
 * адрес длиннее 254 символов не примет ни один почтовый сервер.
 */
function validEmail(email) {
  if (!email || email.length > MAX_EMAIL_LENGTH) {
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return false;
  }
  return !isDisposable(email);
}

function isDisposable(email) {
  const domain = email.split('@').pop().toLowerCase();

  const exact = DISPOSABLE_EXACT.some(function (blocked) {
    return domain === blocked || domain.endsWith('.' + blocked);
  });
  if (exact) {
    return true;
  }
  return DISPOSABLE_CONTAINS.some(function (needle) {
    return domain.indexOf(needle) !== -1;
  });
}

/*
 * Всё, кроме email, — справочные поля: обрезаем и приводим к строке, но не отбраковываем
 * из-за них лид. Потерять адрес из-за кривой utm-метки было бы обидно.
 */
function buildRecord(payload, email, req, ip) {
  const record = {
    email: email.toLowerCase(),
    product: str(payload.product) || 'presend',
    /*
     * Фронт source не шлёт: по разделу 4.2 контракт /api/lead одинаков для модалки
     * и липкой полосы, источник различается только в аналитике. Поле оставлено на случай,
     * если решим делить источники и на сервере — тогда его добавляют в оба buildPayload
     * и фиксируют в спеке, а не втихую здесь.
     */
    source: str(payload.source),
    landing_path: str(payload.landing_path),
    /* ts клиента оставляем как есть, но полагаемся на своё время: часы браузера врут. */
    client_ts: str(payload.ts),
    received_at: new Date().toISOString(),
    ip: ip,
    user_agent: str(req.headers['user-agent'])
  };

  ATTRIBUTION_FIELDS.forEach(function (field) {
    record[field] = str(payload[field]);
  });

  return record;
}

function str(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

/* --- Rate limit --------------------------------------------------------- */

/* За nginx настоящий адрес приходит в X-Forwarded-For, сокет всегда покажет 127.0.0.1. */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim().slice(0, 45);
  }
  return req.socket.remoteAddress || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(function (time) {
    return now - time < RATE_WINDOW_MS;
  });

  recent.push(now);
  hits.set(ip, recent);

  return recent.length > RATE_MAX_HITS;
}

/* Без уборки Map растёт всю жизнь процесса. */
const sweep = setInterval(function () {
  const now = Date.now();
  hits.forEach(function (times, ip) {
    const recent = times.filter(function (time) {
      return now - time < RATE_WINDOW_MS;
    });
    if (recent.length) {
      hits.set(ip, recent);
    } else {
      hits.delete(ip);
    }
  });
}, RATE_WINDOW_MS);
sweep.unref();

/* --- Ответы ------------------------------------------------------------- */

function preflight(res) {
  if (!ALLOWED_ORIGIN) {
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }
  res.writeHead(204, corsHeaders());
  res.end();
}

function corsHeaders() {
  if (!ALLOWED_ORIGIN) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  }, corsHeaders()));
  res.end(body);
}

function log() {
  const parts = Array.prototype.slice.call(arguments).filter(Boolean);
  console.log('[presend] ' + parts.join('  '));
}

/* --- Запуск ------------------------------------------------------------- */

/* Каталог создаём сами: иначе первый же лид упадёт на ENOENT. */
try {
  fs.mkdirSync(path.dirname(LEADS_FILE), { recursive: true });
} catch (e) {
  console.error('[presend] не создать каталог для ' + LEADS_FILE + ':', e.message);
  process.exit(1);
}

/* Проверяем право на запись сразу, а не в момент первого лида. */
try {
  fs.appendFileSync(LEADS_FILE, '');
} catch (e) {
  console.error('[presend] нет доступа на запись в ' + LEADS_FILE + ':', e.message);
  process.exit(1);
}

server.listen(PORT, HOST, function () {
  log('слушает http://' + HOST + ':' + PORT + '/api/lead');
  log('лиды:', LEADS_FILE);
  if (ALLOWED_ORIGIN) {
    log('CORS разрешён для', ALLOWED_ORIGIN);
  }
});

/* systemd шлёт SIGTERM при restart/stop — дописываем текущие запросы и выходим. */
['SIGTERM', 'SIGINT'].forEach(function (signal) {
  process.on(signal, function () {
    log('останов по ' + signal);
    server.close(function () {
      process.exit(0);
    });
  });
});
