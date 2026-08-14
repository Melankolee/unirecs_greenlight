# Proposal Pre-Send Check — лендинг

Статический лендинг для проверки спроса на Chrome-расширение. HTML + CSS + vanilla JS,
без сборщиков и зависимостей.

- Бизнес-логика и правила: [BUSINESS-LOGIC.md](BUSINESS-LOGIC.md) — рабочий документ, из него пишется код
- Исходная спецификация заказчика (`presend-landing-spec.md`) в репозиторий не положена — при
  расхождении со BUSINESS-LOGIC.md прав заказчик, расхождения фиксировать в BUSINESS-LOGIC.md

## Запуск локально

```sh
node tools/dev-server.js        # → http://localhost:8000
```

Сервер раздаёт статику и мокает `POST /api/lead` → `200 {ok:true}`, лиды пишет в
`tools/leads.log`. Без этого эндпоинта воронку не прогнать: submit падает в ветку ошибки, и
событие `email_submit` не проверить.

Ветка ошибки проверяется параметром в URL страницы (работает только при `config.debug`):

```
http://localhost:8000/?fail=500    submit получает 500 → сообщение об ошибке, конверсия не уходит
http://localhost:8000/?fail=slow   ответ через 3 с → состояние «Sending…»
```

Атрибуция проверяется так же через URL:
`http://localhost:8000/?gclid=test123&utm_source=google&utm_campaign=presend` — метки должны
попасть в тело запроса (видно в консоли сервера и в `tools/leads.log`), в том числе после
перехода на privacy.html и обратно.

На `localhost` включается `config.debug`: события аналитики пишутся в консоль, демо-данные
проверяются на инварианты (`validateDemoData`).

## Прогон текста предложения

```sh
node tools/check.js examples/rushed-proposal.txt        # отчёт: светофор + проблемы + контекст
node tools/check.js examples/clean-proposal.txt         # зелёный, ничего не найдено
cat draft.txt | node tools/check.js                     # из stdin
node tools/check.js examples/my-proposal.txt --json     # готовый объект для demo-data.js
```

Код возврата: `0` green, `1` yellow, `2` red.

**Важно:** [tools/rules.js](tools/rules.js) — инструмент разработки, а не часть лендинга.
В демо детекции нет, там захардкоженные `issues` (так решено в спеке). Правила нужны, чтобы
проверить на живом тексте, что продукт должен ловить, и чтобы быстро собрать новый пример:
`--json` печатает объект с уже посчитанными `match` и `occurrence` — его можно вставить в
[assets/js/demo-data.js](assets/js/demo-data.js).

## Структура

```
index.html              лендинг: hero, демо, категории, как работает, для кого, CTA, футер
privacy.html            каркас, юридический текст — TODO
terms.html              каркас, юридический текст — TODO
robots.txt              открыт весь сайт + ссылка на карту
sitemap.xml             одна запись: индексируемая страница ровно одна
assets/favicon.svg      иконка вкладки — светофор, горит зелёная
assets/apple-touch-icon.png  то же 180×180 для iOS, собирается из favicon.svg
assets/og.svg, og.png   картинка для шаринга, 1200×630
assets/css/main.css     токены + все компоненты
assets/js/config.js     API_ENDPOINT, GA ID, одноразовые домены, тайминги
assets/js/analytics.js  consent, gtag, track(), utm/gclid, scroll_depth
assets/js/demo-data.js  три примера предложений + самопроверка
assets/js/demo.js       демо: состояния, подсветка по match, светофор, исправления по кнопке
assets/js/lead.js       модалка, валидация, POST /api/lead, экран подтверждения
assets/js/app.js        сборка и инициализация

assets/js/sticky.js     липкая полоса сбора email внизу вьюпорта

server/lead-api.js      прод-обработчик POST /api/lead (Node, без зависимостей)
server/*.service, *.conf systemd + nginx, установка — server/README.md

tools/dev-server.js     статика + мок POST /api/lead
tools/render-images.js  og.png и apple-touch-icon.png из svg-исходников
tools/check.js          CLI-прогон текста предложения
tools/rules.js          правила детекции — только для инструментов, не для лендинга
examples/*.txt          тексты для прогона
```

## Прод

Деплой и проверка эндпоинта — [server/README.md](server/README.md). Схема: nginx отдаёт статику и
проксирует единственный маршрут `/api/lead` на локальный node-процесс, лиды пишутся в
`/var/lib/presend/leads.jsonl`. API на том же домене, поэтому `apiEndpoint` в конфиге остаётся
`/api/lead` и фронт для прода не правится.

Выкатка автоматическая: push в `main` → [GitHub Actions](.github/workflows/deploy.yml) обновляет
код на сервере. Руками остаются только nginx-конфиг и systemd-юнит — почему, написано там же.

Забрать собранные адреса: `sudo node /opt/presend/server/export-leads.js` — кладёт рядом
`emails.txt` (уникальные адреса для рассыльщика) и `leads.csv` (с атрибуцией).

## Перед запуском рекламы

- [ ] `assets/js/config.js`: заполнить `gaMeasurementId` (`apiEndpoint` менять не нужно)
- [x] `/api/lead` на бэкенде, отвечает `200 {ok: true}` — [server/](server/), развернуть по инструкции
- [x] Consent Mode v2 в `analytics.js` — тег грузится всегда, флаги `denied` до согласия
- [ ] Юридические тексты в `privacy.html` и `terms.html`
- [x] favicon, `og:image`, canonical, `robots.txt`, `sitemap.xml`, schema.org — см. «SEO»
- [ ] Отдать `sitemap.xml` в Google Search Console
- [ ] `email_submit` заведён как конверсия в Google Ads
- [ ] Финальный копирайт (места помечены `TODO copy`)

## SEO

Домен — `presend.anytoolai.store`. Он прописан целиком в четырёх местах: `canonical`,
`og:url` и `og:image` в [index.html](index.html) (там же внутри schema.org), `Sitemap:` в
[robots.txt](robots.txt), `<loc>` в [sitemap.xml](sitemap.xml), `server_name` и пути к
сертификату в [nginx-presend.conf](server/nginx-presend.conf). Сменится домен — править все
четыре:

```sh
grep -rl presend.anytoolai.store index.html robots.txt sitemap.xml server/nginx-presend.conf \
  | xargs perl -pi -e 's/presend\.anytoolai\.store/новый-домен/g'
```

Относительные URL здесь не годятся: `canonical`, `og:url`, `og:image` и `<loc>` в карте
краулеры принимают только абсолютными.

Адрес у сайта ровно один — `www`-записи у поддомена нет, склеивать нечего. Появится второй
адрес — он обязан отдавать 301 на этот, а не копию сайта, иначе поисковик увидит два
одинаковых сайта, а клики с рекламы поделятся между ними.

**nginx-конфиг деплой не переносит**, его копируют руками ([server/README.md](server/README.md)) —
на сервере он уже настроен, файл в репозитории с ним просто сверяется.

`privacy.html` и `terms.html` закрыты `noindex` и в карту не входят: юридический текст в
выдаче не нужен. Открытыми и залинкованными они при этом обязаны остаться — иначе
модерация Google Ads их не увидит.

Картинку для шаринга и иконку перерисовывать так (исходник — `assets/og.svg`, Chrome берётся
как рендерер, потому что зависимостей в проекте нет):

```sh
node tools/render-images.js
```

## Правка демо-примеров

Тексты и проблемы — в [assets/js/demo-data.js](assets/js/demo-data.js). Подсветка строится
программно по полю `match`, разметку в текст не вставлять. Цвет светофора считается из
`issues`, поле `verdict` — только самопроверка: расхождение печатается в консоль на localhost.

Исправления: у issue либо `replacement` (текст, на который меняется `match` по кнопке), либо
`manual` (строка о том, почему кнопки нет) — ровно одно из двух. Граница простая: **клише и увод
с площадки чиним, плейсхолдеры не трогаем.** Настоящее имя клиента и настоящую цифру знает только
автор; подставить туда правдоподобное значение — соврать за него в письме, которое уйдёт клиенту.
Поэтому у `category: "placeholder"` `replacement` быть не может, и `rushed` после кнопки
`Fix 2 errors` остаётся красным — это ожидаемый итог, он зашит полем `verdictAfterFixes`.

`validateDemoData()` проверяет всё перечисленное плюс то, что `replacement` не втягивает в текст
`match` другой issue. Подробности — раздел 2.6 [BUSINESS-LOGIC.md](BUSINESS-LOGIC.md).
