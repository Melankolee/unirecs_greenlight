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
события `email_submit` / `price_cta_click` не проверить.

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
assets/css/main.css     токены + все компоненты
assets/js/config.js     API_ENDPOINT, GA ID, одноразовые домены, тайминги
assets/js/analytics.js  consent, gtag, track(), utm/gclid, scroll_depth
assets/js/demo-data.js  три примера предложений + самопроверка
assets/js/demo.js       демо: состояния, подсветка по match, светофор
assets/js/lead.js       модалка, валидация, POST /api/lead, экран цены
assets/js/app.js        сборка и инициализация

tools/dev-server.js     статика + мок POST /api/lead
tools/check.js          CLI-прогон текста предложения
tools/rules.js          правила детекции — только для инструментов, не для лендинга
examples/*.txt          тексты для прогона
```

## Перед запуском рекламы

- [ ] `assets/js/config.js`: заполнить `gaMeasurementId` и `apiEndpoint`
- [ ] `/api/lead` на бэкенде, отвечает `200 {ok: true}`
- [ ] Юридические тексты в `privacy.html` и `terms.html`
- [ ] favicon, `og:image`, `og:url` в `index.html`
- [ ] `email_submit` и `price_cta_click` заведены как конверсии в Google Ads
- [ ] Финальный копирайт (места помечены `TODO copy`)

## Правка демо-примеров

Тексты и проблемы — в [assets/js/demo-data.js](assets/js/demo-data.js). Подсветка строится
программно по полю `match`, разметку в текст не вставлять. Цвет светофора считается из
`issues`, поле `verdict` — только самопроверка: расхождение печатается в консоль на localhost.
