/*
 * Карточка показа продукта в hero: три состояния светофора, по кругу или руками.
 *
 * Тексты всех состояний лежат в разметке — здесь только переключение активного.
 * Причина: карточка не должна знать содержимое, иначе строки расползутся ещё и по JS
 * (см. задачу про русскую версию — там это уже болит).
 *
 * Порядок red → yellow → green намеренный: заканчивается на зелёном, то есть на том,
 * что обещает заголовок страницы.
 *
 * Автопрокрутка приостанавливается на время наведения и фокуса, а после клика по лампе —
 * на heroResumeMs, после чего идёт дальше от выбранного состояния. Пауза заметно длиннее
 * шага именно поэтому: на обычных 3.4 с выбор пользователя перебивался бы почти сразу.
 * При prefers-reduced-motion прокрутка не запускается вовсе, но лампы остаются рабочими —
 * отключено движение, а не управление.
 */

window.Hero = (function () {
  var config = window.PRESEND_CONFIG;

  var root = null;
  var states = [];
  var buttons = [];
  var index = 0;
  var timer = null;
  /* Пауза после ручного выбора. Пока она тикает, start() не поднимает прокрутку. */
  var resumeTimer = null;
  var reduced = false;

  function show(next) {
    states[index].classList.remove('is-active');
    index = next;
    states[index].classList.add('is-active');

    var verdict = states[index].getAttribute('data-state');
    /* Цвет вердикта и горящая лампа висят на этом атрибуте — как в демо. */
    root.setAttribute('data-verdict', verdict);

    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-pick') === verdict));
    });
  }

  /* Курсор на карточке или фокус внутри неё — прокрутку не поднимаем. Проверяется и при
     возврате из паузы: за девять секунд пользователь мог просто увести мышь обратно. */
  function busy() {
    return root.matches(':hover') || root.contains(document.activeElement);
  }

  function start() {
    if (timer || resumeTimer || reduced || busy() || states.length < 2) {
      return;
    }
    timer = setInterval(function () {
      show((index + 1) % states.length);
    }, config.heroCycleMs);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  function pick(verdict) {
    for (var i = 0; i < states.length; i++) {
      if (states[i].getAttribute('data-state') !== verdict) {
        continue;
      }

      stop();
      show(i);

      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () {
        resumeTimer = null;
        start();
      }, config.heroResumeMs);
      return;
    }
  }

  function init() {
    root = document.querySelector('[data-showcase]');
    if (!root) {
      return;
    }

    states = Array.prototype.slice.call(root.querySelectorAll('[data-state]'));
    if (!states.length) {
      return;
    }

    buttons = Array.prototype.slice.call(root.querySelectorAll('[data-pick]'));
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        pick(button.getAttribute('data-pick'));
      });
    });

    show(0);

    /* Управление подключено выше: reduced-motion выключает только движение. */
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      return;
    }

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);

    start();
  }

  return { init: init };
})();
