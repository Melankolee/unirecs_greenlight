#!/usr/bin/env node
'use strict';

/* Растеризация двух картинок из svg-исходников:
 *
 *   assets/og.svg      → assets/og.png             1200×630, картинка для шаринга
 *   assets/favicon.svg → assets/apple-touch-icon.png 180×180, иконка для iOS
 *
 * Зачем PNG, если SVG уже есть: og:image в svg не понимает ни один крупный шарер
 * (Facebook, LinkedIn, Slack, Telegram), а apple-touch-icon в svg не берёт Safari.
 * Сам favicon остаётся svg — там он работает и весит меньше.
 *
 * Рендерер — headless Chrome, потому что в проекте нет зависимостей и ставить пакет
 * ради двух картинок в год незачем. Скрипт нужен только при правке исходников;
 * результат лежит в репозитории, сборки на выкатке нет.
 *
 * Chrome отрисовывает svg-файл в его собственный размер и кладёт в угол окна, поэтому
 * рисуем не сам файл, а html-обёртку: она растягивает картинку ровно на окно, и снимок
 * выходит попиксельно нужного размера без обрезки и полей.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(p => fs.existsSync(p));

const JOBS = [
  { src: 'assets/og.svg',      out: 'assets/og.png',              w: 1200, h: 630 },
  { src: 'assets/favicon.svg', out: 'assets/apple-touch-icon.png', w: 180,  h: 180 },
];

if (!CHROME) {
  console.error('Не найден Chrome или Chromium — рендерить нечем.');
  console.error('Пути, которые проверялись, перечислены в начале tools/render-images.js.');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'presend-render-'));

try {
  for (const job of JOBS) {
    const svg = fs.readFileSync(path.join(ROOT, job.src), 'utf8');
    // Фон под картинкой тёмный, а не белый: у svg скруглены углы, и на белом
    // они дали бы светлую кайму по краю снимка.
    const html =
      '<!doctype html><meta charset="utf-8">' +
      '<style>html,body{margin:0;padding:0;background:#111827}' +
      `svg{display:block;width:${job.w}px;height:${job.h}px}</style>` +
      svg;

    const page = path.join(tmp, path.basename(job.out) + '.html');
    fs.writeFileSync(page, html);

    execFileSync(CHROME, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      // Без этого на ретине снимок выходит вдвое крупнее заказанного.
      '--force-device-scale-factor=1',
      `--window-size=${job.w},${job.h}`,
      `--screenshot=${path.join(ROOT, job.out)}`,
      'file://' + page,
    ], { stdio: ['ignore', 'ignore', 'ignore'] });

    const size = fs.statSync(path.join(ROOT, job.out)).size;
    console.log(`${job.out}  ${job.w}×${job.h}  ${Math.round(size / 1024)} КБ`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
