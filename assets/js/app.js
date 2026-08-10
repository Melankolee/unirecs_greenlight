/*
 * Сборка страницы: атрибуция, cookie-баннер, демо, модалка, scroll_depth.
 * Подключается последним.
 */

(function () {
  var config = window.PRESEND_CONFIG;

  function initCookieBanner() {
    var banner = document.querySelector('[data-cookie-banner]');
    if (!banner) {
      return;
    }

    if (window.Analytics.consentState()) {
      /* Решение уже есть: при granted поднимаем gtag, при denied не делаем ничего. */
      window.Analytics.loadGtag();
      return;
    }

    banner.hidden = false;

    banner.querySelectorAll('[data-consent]').forEach(function (button) {
      button.addEventListener('click', function () {
        window.Analytics.setConsent(button.dataset.consent);
        banner.hidden = true;
      });
    });
  }

  function init() {
    /* Атрибуцию снимаем до всего остального: она нужна и на privacy/terms. */
    window.Analytics.captureAttribution();
    initCookieBanner();

    if (window.Demo) {
      window.Demo.init();
    }
    if (window.Lead) {
      window.Lead.init();
    }
    window.Analytics.initScrollDepth();

    if (config.debug && !config.gaMeasurementId) {
      console.info('[presend] gaMeasurementId пуст — события только в консоль (config.js)');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
