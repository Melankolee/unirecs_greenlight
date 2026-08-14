/*
 * Аналитика и согласие — Google Consent Mode v2.
 *
 * Правила:
 *  - все события идут через track(), он сам добавляет product;
 *  - тег грузится всегда, согласие передаётся ему флагами, а не фактом загрузки;
 *  - имя email_submit импортируется в Google Ads как конверсия — не переименовывать.
 *
 * Почему тег грузится до ответа на баннер. Отказавшийся от cookie человек всё равно
 * приходит по объявлению и всё равно оставляет email. Если не грузить тег, эта конверсия
 * не существует ни в каком виде: Ads считает связку «объявление → лид» слабее, чем она есть,
 * и режет показы по заниженной оценке. С флагами denied тег не пишет cookie и не шлёт
 * идентификаторы — уходит только обезличенный пинг, из которого Google достраивает
 * статистическую оценку числа конверсий (conversion modeling).
 *
 * Флаги denied по умолчанию — обязательная часть, а не перестраховка: тег, загруженный
 * без них, поставит cookie отказавшемуся. Это нарушение GDPR и повод заблокировать
 * рекламный аккаунт. Порядок здесь важен — 'consent default' выставляется до вставки
 * скрипта, иначе тег успеет отработать с настройками по умолчанию, а они разрешающие.
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
    applyConsent(value);
  }

  function hasConsent() {
    return consentState() === 'granted';
  }

  /* Сигналы согласия. ad_user_data и ad_personalization добавлены в v2: без них
     Google для трафика из ЕЭЗ и Великобритании отключает ремаркетинг и часть отчётов. */
  function consentSignals(value) {
    var state = value === 'granted' ? 'granted' : 'denied';
    return {
      ad_storage: state,
      ad_user_data: state,
      ad_personalization: state,
      analytics_storage: state
    };
  }

  function applyConsent(value) {
    if (typeof window.gtag !== 'function') {
      return;
    }
    window.gtag('consent', 'update', consentSignals(value));
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

    /* До вставки скрипта: иначе тег стартует с разрешающими настройками. */
    window.gtag('consent', 'default', consentSignals('denied'));

    /* При denied вырезает рекламные идентификаторы из самих пингов — пинг остаётся
       обезличенным, даже если человек пришёл по объявлению с gclid в ссылке. */
    window.gtag('set', 'ads_data_redaction', true);
    /* Без cookie связать клик по объявлению с конверсией нечем, поэтому gclid
       переносится между страницами через URL. Иначе переход на privacy и обратно
       обрывает атрибуцию отказавшимся. */
    window.gtag('set', 'url_passthrough', true);

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' +
      encodeURIComponent(config.gaMeasurementId);
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', config.gaMeasurementId);

    /* Решение из прошлого визита. Баннер в этом случае не показывается и setConsent
       никто не вызовет, поэтому granted надо поднять здесь. */
    if (consentState()) {
      applyConsent(consentState());
    }
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

  /* Событие уходит независимо от согласия — отсеивать их здесь нельзя. Что именно
     доедет до Google, решают флаги: при granted это обычное событие с идентификаторами,
     при denied — обезличенный пинг. Ранний выход по hasConsent() убил бы именно пинги,
     то есть весь смысл постоянной загрузки тега. */
  function track(name, params) {
    var payload = Object.assign({ product: config.product }, params || {});

    if (config.debug) {
      console.log('[track]', name, payload, hasConsent() ? '' : '(no consent — cookieless ping)');
    }
    if (typeof window.gtag !== 'function') {
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
