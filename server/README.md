# Бэкенд лендинга: POST /api/lead

Единственный серверный компонент проекта. Принимает email из модалки и из липкой полосы,
пишет в JSONL, отвечает `200 {ok: true}`. Контракт — раздел 4.2 [BUSINESS-LOGIC.md](../BUSINESS-LOGIC.md),
он же реализован моком в [tools/dev-server.js](../tools/dev-server.js) для локальной разработки.

```
lead-api.js            обработчик, чистый Node, без зависимостей
presend-lead.service   юнит systemd
nginx-presend.conf     пример конфига nginx: статика + проксирование /api/lead
```

Схема: nginx отдаёт статику с того же домена и проксирует единственный маршрут `/api/lead`
на localhost:8787. API на том же домене — поэтому `apiEndpoint` в
[assets/js/config.js](../assets/js/config.js) остаётся `/api/lead`, CORS не нужен, фронт не трогаем.

## Установка

```sh
# 1. Пользователь без прав и каталоги
sudo useradd --system --no-create-home --shell /usr/sbin/nologin presend
sudo mkdir -p /opt/presend /var/lib/presend
sudo chown presend:presend /var/lib/presend
sudo chmod 750 /var/lib/presend          # список email не должен читаться всеми

# 2. Код (репозиторий целиком: статика и обработчик лежат вместе)
sudo git clone <repo-url> /opt/presend
# обновление потом: sudo git -C /opt/presend pull && sudo systemctl restart presend-lead

# 3. Сервис
sudo cp /opt/presend/server/presend-lead.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now presend-lead
systemctl status presend-lead

# 4. nginx: подставить свой домен и пути к сертификату
sudo cp /opt/presend/server/nginx-presend.conf /etc/nginx/sites-available/presend
sudo ln -s /etc/nginx/sites-available/presend /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. Сертификат
sudo certbot --nginx -d example.com -d www.example.com
```

Требуется Node 18+ (используется только стандартная библиотека). Проверить: `node --version`.

## Проверка после деплоя

```sh
# локально на сервере — минуя nginx
curl -s -X POST localhost:8787/api/lead \
  -H 'Content-Type: application/json' \
  -d '{"email":"check@example.com","product":"presend","landing_path":"/"}'
# → {"ok":true}

# снаружи — через nginx и TLS
curl -s -X POST https://example.com/api/lead \
  -H 'Content-Type: application/json' \
  -d '{"email":"check@example.com","product":"presend","landing_path":"/"}'

sudo tail -n 3 /var/lib/presend/leads.jsonl
sudo journalctl -u presend-lead -f
```

Главная проверка — не curl, а живая форма: открыть страницу, отправить email, убедиться, что
появился экран цены. Если вместо него сообщение об ошибке, смотреть в journalctl и в консоль
браузера: там видно, дошёл ли запрос вообще.

## Что лежит в файле лидов

Одна строка — один лид, `/var/lib/presend/leads.jsonl`:

```json
{"email":"a@b.com","product":"presend","source":"","landing_path":"/","client_ts":"…","received_at":"…","ip":"…","user_agent":"…","gclid":"","utm_source":"","utm_medium":"","utm_campaign":"","utm_term":""}
```

Дубликаты не отсекаются: один человек может отправить адрес и из модалки, и из полосы.
Это осознанно — append-лог не должен ничего решать, дедупликация делается при выгрузке.

Выгрузка списка для рассылки:

```sh
# уникальные адреса
sudo jq -r .email /var/lib/presend/leads.jsonl | sort -u > leads.txt

# с разбивкой по кампании — понять, какое объявление привело людей
sudo jq -r '[.email, .utm_campaign, .received_at] | @csv' /var/lib/presend/leads.jsonl > leads.csv
```

Бэкап — обычный `cp`, файл только дописывается:

```sh
sudo crontab -e
0 4 * * * cp /var/lib/presend/leads.jsonl /var/backups/leads-$(date +\%F).jsonl
```

## Защита от мусора

Встроено: лимит 5 запросов с одного IP за 10 минут, тело не больше 4 КБ, проверка формата
email и списка одноразовых доменов на сервере (клиентская проверка в `lead.js` — это UX,
до эндпоинта можно достучаться и мимо формы).

Список одноразовых доменов намеренно продублирован в `lead-api.js`: серверный список имеет
право быть строже клиентского, синхронизировать их построчно не нужно.

Чего нет: honeypot-поля. Оно требует лишнего поля в теле запроса, а раздел 4.2 фиксирует
контракт `/api/lead` как общий для модалки и полосы — если мусор пойдёт, добавляем поле сразу
в оба `buildPayload` и правим спеку.

## Персональные данные

В файле лежат email, IP и user-agent — это персональные данные, и privacy-текст должен их
называть. Права `750` на каталог, доступ по SSH только вам. Срок хранения из privacy-текста
надо будет реально соблюдать: после запуска и рассылки лог чистится или архивируется.
