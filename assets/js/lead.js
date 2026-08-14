/*
 * Модалка сбора email → экран подтверждения.
 *
 * Целевая метрика email_submit живёт здесь.
 * Подтверждение показывается в той же модалке вместо формы — переход на новую страницу теряет людей.
 */

window.Lead = (function () {
  var config = window.PRESEND_CONFIG;
  var track = window.Analytics.track;

  var el = {};
  var lastFocused = null;
  var sending = false;

  function init() {
    el.modal = document.querySelector('[data-modal]');
    if (!el.modal) {
      return;
    }

    el.dialog = el.modal.querySelector('[data-modal-dialog]');
    el.form = el.modal.querySelector('[data-lead-form]');
    el.input = el.modal.querySelector('[data-lead-email]');
    el.error = el.modal.querySelector('[data-lead-error]');
    el.submit = el.modal.querySelector('[data-lead-submit]');
    el.formView = el.modal.querySelector('[data-view="form"]');
    el.doneView = el.modal.querySelector('[data-view="done"]');
    el.close = el.modal.querySelector('button[data-modal-close]');

    el.form.addEventListener('submit', onSubmit);
    el.input.addEventListener('input', clearError);

    el.modal.addEventListener('click', function (event) {
      if (event.target.hasAttribute('data-modal-close') || event.target === el.modal) {
        close();
      }
    });
    document.addEventListener('keydown', onKeydown);

    document.querySelectorAll('[data-open-modal]').forEach(function (button) {
      button.addEventListener('click', function () {
        track('cta_click', { location: button.dataset.openModal });
        open(button);
      });
    });
  }

  function open(trigger) {
    lastFocused = trigger || document.activeElement;
    el.modal.hidden = false;
    document.body.classList.add('is-locked');
    showView('form');
    el.input.focus();
  }

  function close() {
    el.modal.hidden = true;
    document.body.classList.remove('is-locked');
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus();
    }
  }

  function onKeydown(event) {
    if (el.modal.hidden) {
      return;
    }
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key === 'Tab') {
      trapFocus(event);
    }
  }

  function trapFocus(event) {
    var focusable = el.dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), a[href]'
    );
    var visible = Array.prototype.filter.call(focusable, function (node) {
      return node.offsetParent !== null;
    });
    if (!visible.length) {
      return;
    }

    var first = visible[0];
    var last = visible[visible.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function showView(name) {
    el.formView.hidden = name !== 'form';
    el.doneView.hidden = name !== 'done';
  }

  /* --- Валидация -------------------------------------------------------- */

  function validateEmail(raw) {
    var email = raw.trim();

    if (!email) {
      return 'Enter your email so we can let you know at launch.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return 'That does not look like an email address.';
    }
    if (isDisposable(email)) {
      return 'Please use an address you actually read — we only email you at launch.';
    }
    return null;
  }

  function isDisposable(email) {
    var domain = email.split('@').pop().toLowerCase();
    var list = config.disposableDomains;

    var exact = list.exact.some(function (blocked) {
      return domain === blocked || domain.endsWith('.' + blocked);
    });
    if (exact) {
      return true;
    }
    return list.contains.some(function (needle) {
      return domain.indexOf(needle) !== -1;
    });
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

  /* --- Отправка --------------------------------------------------------- */

  function onSubmit(event) {
    event.preventDefault();
    if (sending) {
      return;
    }

    var email = el.input.value.trim();
    var error = validateEmail(email);
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
        /* Событие только на успехе: ошибка сети не должна попадать в конверсии. */
        track('email_submit');
        showView('done');
        track('success_screen_view');
        /* Кнопок на экране больше нет — фокус уводим на крестик, чтобы Tab не улетал из модалки. */
        el.close.focus();
      })
      .catch(function (err) {
        if (config.debug) {
          console.warn('[lead] submit failed', err);
        }
        showError('Something went wrong on our side. Try again.');
      })
      .then(function () {
        setSending(false);
      });
  }

  /*
   * В debug-режиме параметр ?fail= из URL страницы прокидывается в запрос — так локальный
   * dev-сервер умеет отвечать 500 или медленно, и ветку ошибки можно прогнать руками.
   * На продакшене config.debug = false, и это никогда не срабатывает.
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
    sending = value;
    el.submit.disabled = value;
    el.submit.textContent = value ? 'Sending…' : 'Get early access';
  }

  return { init: init, open: open, close: close, validateEmail: validateEmail };
})();
