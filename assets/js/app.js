/*
 * Сборка страницы: атрибуция, cookie-баннер, демо, модалка, scroll_depth.
 * Подключается последним.
 */

(function () {
  var config = window.PRESEND_CONFIG;

  function initCookieBanner() {
    var banner = document.querySelector('[data-cookie-banner]');
    /* Решение из прошлого визита gtag уже получил при загрузке — спрашивать снова незачем. */
    if (!banner || window.Analytics.consentState()) {
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
    /* Тег поднимается всегда и раньше баннера — с флагами denied внутри. Здесь, а не в
       initCookieBanner: на privacy/terms баннера в разметке нет, а события оттуда идут. */
    window.Analytics.loadGtag();
    initCookieBanner();

    if (window.Hero) {
      window.Hero.init();
    }
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
