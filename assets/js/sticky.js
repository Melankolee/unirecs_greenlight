/*
 * Липкая полоса сбора email внизу вьюпорта.
 *
 * Правила показа (спека, раздел 10):
 *  - появляется после 40% скролла;
 *  - не одновременно с cookie-баннером, иначе внизу два элемента сразу; там, где баннера
 *    нет (всё, кроме Европы), это условие выполнено с самого начала;
 *  - не показывается, если закрыта в этой сессии или email уже отправлен;
 *  - прячется, пока открыта модалка, и возвращается после закрытия.
 *
 * Отправка идёт на тот же эндпоинт и с тем же телом, что у модалки: контракт
 * /api/lead из спеки не расширяется, источник различается только в аналитике.
 *
 * Инициализируется сам: app.js о полосе не знает. На privacy/terms разметки нет,
 * поэтому init() молча выходит.
 */

window.Sticky = (function () {
  var config = window.PRESEND_CONFIG;
  var track = window.Analytics.track;

  var SHOW_AT_PERCENT = 40;
  var CLOSED_KEY = 'presend_bar_closed';
  var SENT_KEY = 'presend_bar_sent';
  var THANKS_MS = 4000;

  var el = {};
  var state = {
    closed: false,
    sent: false,
    scrolledEnough: false,
    modalOpen: false,
    sending: false,
    visible: false
  };
  var timers = [];

  function init() {
    el.root = document.querySelector('[data-sticky]');
    if (!el.root) {
      return;
    }

    el.form = el.root.querySelector('[data-sticky-form]');
    el.input = el.root.querySelector('[data-sticky-email]');
    el.submit = el.root.querySelector('[data-sticky-submit]');
    el.error = el.root.querySelector('[data-sticky-error]');
    el.title = el.root.querySelector('[data-sticky-title]');
    el.close = el.root.querySelector('[data-sticky-close]');
    el.modal = document.querySelector('[data-modal]');
    el.doneView = document.querySelector('[data-view="done"]');

    state.closed = flag(CLOSED_KEY);
    state.sent = flag(SENT_KEY);
    state.modalOpen = !!(el.modal && !el.modal.hidden);

    el.form.addEventListener('submit', onSubmit);
    el.input.addEventListener('input', clearError);
    el.close.addEventListener('click', onClose);

    watchModal();
    watchConsent();
    initScrollGate();

    update();
  }

  /* --- Условия показа --------------------------------------------------- */

  function shouldShow() {
    return state.scrolledEnough &&
      !state.closed &&
      !state.sent &&
      !state.modalOpen &&
      !window.Analytics.consentPending();
  }

  /* Полоса выезжает трансформом, поэтому hidden снимается заранее, а класс — следующим кадром. */
  function update() {
    var show = shouldShow();
    if (show === state.visible) {
      return;
    }
    state.visible = show;

    if (show) {
      el.root.hidden = false;
      requestAnimationFrame(function () {
        el.root.classList.add('is-visible');
      });
    } else {
      el.root.classList.remove('is-visible');
    }
  }

  function initScrollGate() {
    var ticking = false;

    function measure() {
      ticking = false;
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      var percent = scrollable > 0
        ? (window.scrollY / scrollable) * 100
        : 100;

      if (percent >= SHOW_AT_PERCENT) {
        state.scrolledEnough = true;
        update();
      }
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(measure);
      }
    }, { passive: true });

    measure();
  }

  /*
   * Модалку слушаем через атрибут hidden: lead.js о полосе не знает и событий не шлёт.
   * Тот же наблюдатель ловит появление экрана подтверждения — значит email уже отправлен
   * и полоса в этой сессии больше не нужна.
   */
  function watchModal() {
    if (!el.modal || typeof MutationObserver !== 'function') {
      return;
    }

    new MutationObserver(function () {
      state.modalOpen = !el.modal.hidden;
      if (el.doneView && !el.doneView.hidden) {
        markSent();
      }
      update();
    }).observe(el.modal, {
      attributes: true,
      attributeFilter: ['hidden'],
      subtree: true
    });
  }

  /* Решение по cookie принимается кликом уже после загрузки — пересчитываем сразу. */
  function watchConsent() {
    document.querySelectorAll('[data-consent]').forEach(function (button) {
      button.addEventListener('click', function () {
        update();
      });
    });
  }

  /* --- Отправка --------------------------------------------------------- */

  function onSubmit(event) {
    event.preventDefault();
    if (state.sending) {
      return;
    }

    var email = el.input.value.trim();
    /* Валидация одна на весь лендинг — правила не дублируем. */
    var error = window.Lead.validateEmail(email);
    if (error) {
      showError(error);
      return;
    }

    clearError();
    setSending(true);

    fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(email))
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json().catch(function () { return { ok: true }; });
      })
      .then(function (data) {
        if (!data || data.ok !== true) {
          throw new Error('Unexpected response');
        }
        onSuccess();
      })
      .catch(function (err) {
        if (config.debug) {
          console.warn('[sticky] submit failed', err);
        }
        /* Ошибка сети не должна попадать в конверсии — событие не отправляем. */
        showError('Something went wrong on our side. Try again.');
        setSending(false);
      });
  }

  function onSuccess() {
    /* Та же конверсия, что из модалки: имя события не меняем, различаем параметром. */
    track('email_submit', { source: 'sticky_bar' });

    markSent();
    el.root.classList.add('is-sent');
    el.title.textContent = "You're on the list. We'll email you before launch.";
    el.input.value = '';
    setSending(false);

    /* Дочитать одну строку и уехать: висеть после отправки полосе незачем. */
    defer(function () {
      el.root.classList.remove('is-visible');
      state.visible = false;
      defer(function () { el.root.hidden = true; }, 400);
    }, THANKS_MS);
  }

  /*
   * В debug-режиме параметр ?fail= из URL прокидывается в запрос — тот же приём,
   * что в lead.js, чтобы ветку ошибки можно было прогнать на dev-сервере.
   */
  function endpoint() {
    if (!config.debug) {
      return config.apiEndpoint;
    }
    var fail = new URLSearchParams(location.search).get('fail');
    return fail
      ? config.apiEndpoint + '?fail=' + encodeURIComponent(fail)
      : config.apiEndpoint;
  }

  function buildPayload(email) {
    var attribution = window.Analytics.readAttribution();

    return {
      email: email,
      product: config.product,
      gclid: attribution.gclid || '',
      utm_source: attribution.utm_source || '',
      utm_medium: attribution.utm_medium || '',
      utm_campaign: attribution.utm_campaign || '',
      utm_term: attribution.utm_term || '',
      landing_path: location.pathname,
      ts: new Date().toISOString()
    };
  }

  function setSending(value) {
    state.sending = value;
    el.submit.disabled = value;
    el.submit.textContent = value ? 'Sending…' : 'Get early access';
  }

  /* --- Закрытие и состояние -------------------------------------------- */

  function onClose() {
    state.closed = true;
    setFlag(CLOSED_KEY);
    clearTimers();
    update();
  }

  function markSent() {
    state.sent = true;
    setFlag(SENT_KEY);
  }

  function showError(message) {
    el.error.textContent = message;
    el.error.hidden = false;
    el.input.setAttribute('aria-invalid', 'true');
    el.input.focus();
  }

  function clearError() {
    el.error.hidden = true;
    el.error.textContent = '';
    el.input.removeAttribute('aria-invalid');
  }

  /* --- Утилиты ---------------------------------------------------------- */

  /* Решения живут в сессии: закрыл — не всплывает до нового захода. */
  function flag(key) {
    try {
      return sessionStorage.getItem(key) === '1';
    } catch (e) {
      return false;
    }
  }

  function setFlag(key) {
    try {
      sessionStorage.setItem(key, '1');
    } catch (e) {
      /* приватный режим — решение действует до перезагрузки */
    }
  }

  function defer(fn, delay) {
    timers.push(setTimeout(fn, delay));
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init: init };
})();
