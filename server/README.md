# Бэкенд лендинга: POST /api/lead

Единственный серверный компонент проекта. Принимает email из модалки и из липкой полосы,
пишет в JSONL, отвечает `200 {ok: true}`. Контракт — раздел 4.2 [BUSINESS-LOGIC.md](../BUSINESS-LOGIC.md),
он же реализован моком в [tools/dev-server.js](../tools/dev-server.js) для локальной разработки.

```
lead-api.js            обработчик, чистый Node, без зависимостей
export-leads.js        выгрузка лидов в emails.txt и leads.csv
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
sudo certbot --nginx -d presend.anytoolai.store
```

Требуется Node 18+ (используется только стандартная библиотека). Проверить: `node --version`.

## Автодеплой

[.github/workflows/deploy.yml](../.github/workflows/deploy.yml): на каждый push в `main` GitHub
заходит по SSH и приводит `/opt/presend` к состоянию `origin/main`. Собирать нечего — статика
и обработчик едут как есть. Статику nginx подхватывает с диска сам; `presend-lead`
перезапускается, только если в этом пуше менялся `lead-api.js`.

На сервере — отдельный пользователь, которому можно ровно две вещи: владеть каталогом с кодом
и перезапускать один сервис.

```sh
# 1. Пользователь и права на каталог с кодом
sudo adduser --disabled-password --gecos '' deploy
sudo chown -R deploy:deploy /opt/presend      # иначе git ругается на dubious ownership

# 2. Право на один-единственный рестарт, без пароля
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart presend-lead' \
  | sudo tee /etc/sudoers.d/deploy
sudo chmod 440 /etc/sudoers.d/deploy
sudo visudo -c                                # проверка синтаксиса

# 3. Ключ только для деплоя (без парольной фразы — его будет использовать робот)
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N '' -C 'github-actions'
sudo mkdir -p /home/deploy/.ssh
cat ~/.ssh/deploy_key.pub | sudo tee -a /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh && sudo chmod 700 /home/deploy/.ssh
```

Секреты репозитория (**Settings → Secrets and variables → Actions**):

| Секрет | Чем заполнить |
| --- | --- |
| `SSH_KEY` | приватный ключ целиком: `cat ~/.ssh/deploy_key` |
| `SSH_HOST` | домен или IP сервера |
| `SSH_USER` | `deploy` |
| `SSH_KNOWN_HOSTS` | `ssh-keyscan ваш-домен` — чтобы workflow не доверял первому встречному |

Порт SSH, если он не 22, — переменной `SSH_PORT` на той же странице, во вкладке *Variables*.

После настройки первый прогон удобно запустить руками: вкладка **Actions → Deploy → Run
workflow**. В логе видно, какой коммит был и какой стал.

Чего автодеплой намеренно не делает — **nginx и systemd-юнит**. Рабочие копии лежат в
`/etc/nginx/sites-available/presend` и `/etc/systemd/system/`, а не в репозитории, и правки
в [nginx-presend.conf](nginx-presend.conf) или [presend-lead.service](presend-lead.service)
переносятся руками:

```sh
sudo diff /etc/nginx/sites-available/presend /opt/presend/server/nginx-presend.conf
sudo nginx -t && sudo systemctl reload nginx
```

Так и задумано: в рабочем конфиге стоят ваш домен и пути к сертификатам, которых в репозитории
нет, а раздать роботу право писать в `/etc` и перезагружать nginx — слишком много власти за
слишком редкую операцию.

Ещё одно следствие `reset --hard`: рабочая копия на сервере не редактируется. Любая правка
файла в `/opt/presend` будет молча снесена следующим пушем — менять только через репозиторий.

## Проверка после деплоя

```sh
# локально на сервере — минуя nginx
curl -s -X POST localhost:8787/api/lead \
  -H 'Content-Type: application/json' \
  -d '{"email":"check@example.com","product":"presend","landing_path":"/"}'
# → {"ok":true}

# снаружи — через nginx и TLS
curl -s -X POST https://presend.anytoolai.store/api/lead \
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

## Выгрузка

```sh
cd /tmp && sudo node /opt/presend/server/export-leads.js
```

Кладёт рядом два файла и печатает, сколько получилось:

```
412 уникальных адресов, дубликатов отброшено: 125
  /tmp/emails.txt
  /tmp/leads.csv  (412 строк)
```

* `emails.txt` — по адресу на строку, уникальные, в нижнем регистре: готовый список для рассыльщика.
* `leads.csv` — email плюс атрибуция (`utm_*`, `gclid`, `landing_path`, `received_at`), открывается
  в Excel и Google Sheets. `ip` и `user_agent` в CSV не попадают намеренно: для рассылки и разбора
  кампаний они не нужны, а таблица расходится по почте легче, чем файл на сервере. Понадобятся —
  они на месте в `leads.jsonl`.

Ключи: `--out DIR` (куда писать), `--since YYYY-MM-DD` (только лиды с этой даты — сравнить
кампании до и после), `--all` (не схлопывать дубликаты в CSV), `--file PATH` (читать не
`$LEADS_FILE`). Битые строки пропускаются со счётчиком, а не роняют выгрузку.

Забрать к себе:

```sh
scp you@example.com:/tmp/leads.csv .
```

Проверить выгрузку локально, не заходя на сервер, — dev-лог со своим форматом строки скрипт тоже
понимает:

```sh
node server/export-leads.js --file tools/leads.log --out /tmp
```

Скрипт на Node, а не на shell, потому что `jq` на сервере может не стоять, а Node стоит всегда —
на нём работает сам сервис. Файлы создаются с правами `600`: в них адреса живых людей, а `/tmp` общий.

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
