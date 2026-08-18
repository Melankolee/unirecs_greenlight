/* Единственное место с настройками окружения. Заполнить перед запуском рекламы. */

window.PRESEND_CONFIG = {
  product: 'presend',

  // Backend endpoint для сбора email. Ожидается 200 {ok: true}.
  apiEndpoint: '/api/lead',

  // GA4 measurement ID. Если пусто — gtag не грузится, track() пишет в консоль.
  gaMeasurementId: 'G-23SD0FS9D6',

  // Ключ, под которым хранится решение по cookie-баннеру.
  consentKey: 'presend_consent',

  // Пауза перед выдачей результата в демо. Меньше — результат читается как записанный заранее.
  scanDurationMs: 1200,

  // Сколько держится одно состояние карточки в hero. Меньше — текст не успевают дочитать.
  heroCycleMs: 3400,

  // Пауза после ручного переключения, прежде чем карточка снова пойдёт сама.
  // Заметно больше heroCycleMs: иначе выбор пользователя перебивается почти сразу.
  heroResumeMs: 9000,

  // Задержка между появлением карточек проблем.
  issueStaggerMs: 150,

  // Пауза между заменами при «Fix errors»: разом меняющийся текст читается как подмена примера.
  fixStaggerMs: 320,

  // Одноразовые почты. exact — точное совпадение домена, contains — вхождение (ловит зеркала).
  disposableDomains: {
    exact: [
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
    ],
    contains: ['tempmail', 'temp-mail', 'guerrillamail', 'mailinator', 'trashmail', 'yopmail']
  },

  // Локальная разработка: подробные логи и самопроверка демо-данных.
  debug: ['localhost', '127.0.0.1', ''].indexOf(location.hostname) !== -1
};
