/*
 * Аналитика и согласие.
 *
 * Правила:
 *  - все события идут через track(), он сам добавляет product;
 *  - без согласия gtag не грузится вообще, события не буферизуются;
 *  - имена email_submit и price_cta_click импортируются в Google Ads как конверсии — не переименовывать.
 */

window.Analytics = (function () {
  var config = window.PRESEND_CONFIG;
  var ATTRIBUTION_KEY = 'presend_attribution';
  var ATTRIBUTION_FIELDS = ['gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term'];

  var gtagLoaded = false;
  var scrollThresholdsSent = {};

  function consentState() {
    try {
      return localStorage.getItem(config.consentKey);
    } catch (e) {
      return null;
    }
  }

  function setConsent(value) {
    try {
      localStorage.setItem(config.consentKey, value);
    } catch (e) {
      /* приватный режим — считаем решение действующим только на эту загрузку */
    }
    if (value === 'granted') {
      loadGtag();
    }
  }

  function hasConsent() {
    return consentState() === 'granted';
  }

  function loadGtag() {
    if (gtagLoaded || !config.gaMeasurementId) {
      return;
    }
    gtagLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' +
      encodeURIComponent(config.gaMeasurementId);
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', config.gaMeasurementId);
  }

  /* Атрибуция читается один раз при загрузке и живёт в sessionStorage:
     при переходе на privacy/terms и обратно параметры из URL теряются. */
  function captureAttribution() {
    var stored = readAttribution();
    var params = new URLSearchParams(location.search);
    var changed = false;

    ATTRIBUTION_FIELDS.forEach(function (field) {
      var value = params.get(field);
      if (value && !stored[field]) {
        stored[field] = value;
        changed = true;
      }
    });

    if (changed) {
      try {
        sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(stored));
      } catch (e) {
        /* ничего не делаем: атрибуция — не критичный путь */
      }
    }
    return stored;
  }

  function readAttribution() {
    try {
      return JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function track(name, params) {
    var payload = Object.assign({ product: config.product }, params || {});

    if (config.debug) {
      console.log('[track]', name, payload, hasConsent() ? '' : '(no consent — not sent)');
    }
    if (!hasConsent() || typeof window.gtag !== 'function') {
      return;
    }
    window.gtag('event', name, payload);
  }

  function initScrollDepth() {
    var thresholds = [25, 50, 75, 100];
    var ticking = false;

    function measure() {
      ticking = false;
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      var percent = scrollable > 0
        ? Math.round((window.scrollY / scrollable) * 100)
        : 100;

      thresholds.forEach(function (threshold) {
        if (percent >= threshold && !scrollThresholdsSent[threshold]) {
          scrollThresholdsSent[threshold] = true;
          track('scroll_depth', { percent: threshold });
        }
      });
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(measure);
      }
    }, { passive: true });

    measure();
  }

  return {
    track: track,
    setConsent: setConsent,
    hasConsent: hasConsent,
    consentState: consentState,
    captureAttribution: captureAttribution,
    readAttribution: readAttribution,
    loadGtag: loadGtag,
    initScrollDepth: initScrollDepth
  };
})();
