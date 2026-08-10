#!/usr/bin/env node
/*
 * Локальный dev-сервер. Без зависимостей.
 *
 *   node tools/dev-server.js [port]
 *
 * Делает две вещи:
 *  1. раздаёт статику из корня проекта;
 *  2. отвечает на POST /api/lead → 200 {ok: true} и пишет лид в tools/leads.log.
 *
 * Второе нужно, чтобы прогнать воронку целиком: без эндпоинта submit падает в ветку ошибки
 * и события email_submit / price_cta_click не проверить.
 *
 * Мок-режимы для проверки обработки ошибок:
 *   ?fail=500     эндпоинт отвечает 500
 *   ?fail=slow    отвечает через 3 секунды
 * (передаются в URL страницы, сервер читает их из query самого запроса /api/lead)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LEADS_LOG = path.join(__dirname, 'leads.log');
const PORT = Number(process.argv[2]) || 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (url.pathname === '/api/lead') {
    handleLead(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

function handleLead(req, res, url) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', function (chunk) {
    body += chunk;
    if (body.length > 10000) {
      req.destroy();
    }
  });

  req.on('end', function () {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      return send(res, 400, { error: 'Invalid JSON' });
    }

    const fail = url.searchParams.get('fail');
    const line = new Date().toISOString() + ' ' + JSON.stringify(payload) + '\n';
    fs.appendFileSync(LEADS_LOG, line);
    console.log('  lead  ' + (payload.email || '?') +
      (payload.gclid ? '  gclid=' + payload.gclid : '') +
      (payload.utm_source ? '  utm_source=' + payload.utm_source : '') +
      (fail ? '  (mock fail=' + fail + ')' : ''));

    if (fail === '500') {
      return send(res, 500, { ok: false, error: 'Mock failure' });
    }
    if (fail === 'slow') {
      return setTimeout(function () { send(res, 200, { ok: true }); }, 3000);
    }
    send(res, 200, { ok: true });
  });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(ROOT, pathname);
  /* Не отдаём ничего выше корня проекта. */
  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, { error: 'Forbidden' });
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 ' + pathname);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

server.listen(PORT, function () {
  console.log('');
  console.log('  Pre-Send Check — dev server');
  console.log('  http://localhost:' + PORT + '/');
  console.log('  POST /api/lead → 200 {ok:true},  лиды: tools/leads.log');
  console.log('  проверка ошибки: http://localhost:' + PORT + '/?fail=500');
  console.log('');
});
