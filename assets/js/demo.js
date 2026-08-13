/*
 * Демо-блок: машина состояний idle → scanning → done.
 *
 * Подсветка строится программно по полю match, разметка в тексте примеров не хранится.
 *
 * Исправления: кнопка есть у issue с полем replacement — правится не example.text (он остаётся
 * эталоном для сброса), а рабочая копия state.text. Плейсхолдеры replacement не имеют никогда:
 * настоящее имя клиента знает только автор, подставлять за него нельзя (раздел 2.6 спеки).
 */

/* Светофор считается из issues, а не берётся из данных — так пример нельзя рассинхронизировать. */
window.verdictFromIssues = function verdictFromIssues(issues) {
  var hasCritical = issues.some(function (i) { return i.severity === 'critical'; });
  if (hasCritical) {
    return 'red';
  }
  var hasWarning = issues.some(function (i) { return i.severity === 'warning'; });
  return hasWarning ? 'yellow' : 'green';
};

window.Demo = (function () {
  var config = window.PRESEND_CONFIG;
  var track = window.Analytics.track;

  var CATEGORY_LABELS = {
    placeholder: 'Placeholder',
    ai_cliche: 'AI cliché',
    tos_risk: 'Platform rules'
  };

  var CATEGORY_ICONS = {
    placeholder: '⬚',
    ai_cliche: '⌁',
    tos_risk: '⚠'
  };

  var FIXED_ICON = '✓';

  var state = {
    exampleId: null,
    phase: 'idle',       // idle | scanning | done
    openIssueId: null,
    timers: [],
    text: '',            // рабочая копия текста примера, меняется при применении фиксов
    fixed: {},           // id issue → true
    fixedRanges: [],     // диапазоны применённых замен внутри state.text
    lastFixedId: null,   // подсвечивается анимацией только последняя замена
    fixingBatch: false,    // идёт пакетное исправление: кнопка не должна мигать по ходу
    clearTracked: false  // demo_all_clear шлём один раз на прогон
  };

  var el = {};
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init() {
    el.root = document.querySelector('[data-demo]');
    if (!el.root) {
      return;
    }

    el.tabs = el.root.querySelector('[data-demo-tabs]');
    el.text = el.root.querySelector('[data-demo-text]');
    el.scanline = el.root.querySelector('[data-demo-scanline]');
    el.runButton = el.root.querySelector('[data-demo-run]');
    el.fixErrors = el.root.querySelector('[data-demo-fix-errors]');
    el.reset = el.root.querySelector('[data-demo-reset]');
    el.light = el.root.querySelector('[data-demo-light]');
    el.caption = el.root.querySelector('[data-demo-caption]');
    el.issues = el.root.querySelector('[data-demo-issues]');
    el.panelHint = el.root.querySelector('[data-demo-hint]');
    el.cta = el.root.querySelector('[data-demo-cta]');

    if (config.debug) {
      var problems = window.validateDemoData(window.DEMO_EXAMPLES);
      problems.forEach(function (message) { console.warn('[demo-data]', message); });
    }

    renderTabs();
    el.tabs.addEventListener('click', onTabClick);
    el.runButton.addEventListener('click', onRunClick);
    el.fixErrors.addEventListener('click', onFixErrorsClick);
    el.reset.addEventListener('click', onResetClick);
    el.issues.addEventListener('click', onIssueClick);

    selectExample(window.DEMO_EXAMPLES[0].id, { silent: true });
  }

  function currentExample() {
    return window.DEMO_EXAMPLES.filter(function (e) {
      return e.id === state.exampleId;
    })[0];
  }

  /* Проблемы, которые ещё не исправлены: именно они дают вердикт и подсветку. */
  function activeIssues() {
    return currentExample().issues.filter(function (issue) {
      return !state.fixed[issue.id];
    });
  }

  function fixableIssues() {
    return activeIssues().filter(function (issue) { return !!issue.replacement; });
  }

  function hasFixes() {
    return Object.keys(state.fixed).length > 0;
  }

  function renderTabs() {
    el.tabs.innerHTML = window.DEMO_EXAMPLES.map(function (example) {
      return '<button type="button" class="demo__tab" role="tab" aria-selected="false" ' +
        'data-example-id="' + example.id + '">' + escapeHtml(example.label) + '</button>';
    }).join('');
  }

  function onTabClick(event) {
    var button = event.target.closest('[data-example-id]');
    if (!button || button.dataset.exampleId === state.exampleId) {
      return;
    }
    selectExample(button.dataset.exampleId);
  }

  /* Смена примера отменяет текущий прогон, сбрасывает фиксы и возвращает в idle. */
  function selectExample(exampleId, options) {
    clearTimers();
    state.exampleId = exampleId;
    state.phase = 'idle';
    state.openIssueId = null;
    state.text = currentExample().text;
    state.fixed = {};
    state.fixedRanges = [];
    state.lastFixedId = null;
    state.fixingBatch = false;
    state.clearTracked = false;

    Array.prototype.forEach.call(el.tabs.children, function (tab) {
      var active = tab.dataset.exampleId === exampleId;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    renderText([]);
    renderIdlePanel();

    if (!options || !options.silent) {
      track('demo_example_switch', { example_id: exampleId });
    }
  }

  function onRunClick() {
    if (state.phase === 'scanning') {
      return;
    }
    run();
  }

  /* Сброс к исходному тексту примера — единственный способ откатить применённые фиксы. */
  function onResetClick() {
    track('demo_reset', { example_id: state.exampleId });
    selectExample(state.exampleId, { silent: true });
  }

  function run() {
    /* Прогон отменяет незавершённый «Fix errors»: иначе отложенные замены прилетят посреди скана. */
    clearTimers();
    state.fixingBatch = false;
    state.phase = 'scanning';
    state.openIssueId = null;
    /* Вспышка на последней замене одноразовая: на повторном прогоне мигать ей незачем. */
    state.lastFixedId = null;

    el.runButton.disabled = true;
    el.runButton.textContent = 'Checking…';
    el.root.classList.add('is-scanning');
    el.issues.innerHTML = '';
    el.panelHint.hidden = true;
    /* На повторном прогоне CTA уходит вместе с результатом: панель на время скана пуста. */
    el.cta.hidden = true;
    setLight(null, '');
    renderText([]);
    updateActions();

    track('demo_run', { example_id: state.exampleId });

    /* Пауза смысловая: мгновенный результат читается как заранее записанный. */
    defer(function () {
      el.root.classList.remove('is-scanning');
      state.phase = 'done';
      showResult();
    }, config.scanDurationMs);
  }

  /* Повторный прогон проверяет текущий текст: исправленное больше не находится. */
  function showResult() {
    var issues = activeIssues();

    renderText(issues, true);
    refreshVerdict();
    renderIssues(issues);
    updateActions();

    el.runButton.disabled = false;
    el.runButton.textContent = 'Run again';
    el.panelHint.hidden = activeIssues().length === 0;
    el.cta.hidden = false;

    if (window.matchMedia('(max-width: 899px)').matches) {
      el.light.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  }

  function refreshVerdict() {
    var issues = activeIssues();
    var verdict = window.verdictFromIssues(issues);
    setLight(verdict, captionFor(verdict, issues));

    if (verdict === 'green' && hasFixes() && !state.clearTracked) {
      state.clearTracked = true;
      track('demo_all_clear', { example_id: state.exampleId });
    }
  }

  function captionFor(verdict, issues) {
    if (verdict === 'green') {
      return hasFixes() ? 'Fixed — good to go' : 'Good to go';
    }
    if (verdict === 'red') {
      var blocking = issues.filter(function (i) { return i.severity === 'critical'; }).length;
      return 'Don\'t send yet — ' + blocking + ' blocking ' + plural(blocking, 'issue', 'issues');
    }
    var reviewable = issues.filter(function (i) { return i.severity !== 'critical'; }).length;
    return 'Send with caution — ' + reviewable + ' ' +
      plural(reviewable, 'thing', 'things') + ' to review';
  }

  function setLight(verdict, caption) {
    el.light.dataset.verdict = verdict || '';
    el.caption.textContent = caption;
  }

  /* --- Текст и подсветка ------------------------------------------------ */

  /* Ищет occurrence-е вхождение match в переданном тексте. null — не найдено. */
  function findRange(text, issue) {
    var occurrence = issue.occurrence || 1;
    var index = -1;
    for (var i = 0; i < occurrence; i++) {
      index = text.indexOf(issue.match, index + 1);
      if (index === -1) {
        return null;
      }
    }
    return { start: index, end: index + issue.match.length };
  }

  /*
   * Собирает HTML текста: диапазоны проблем + диапазоны уже применённых замен.
   * Пересечения отбрасываются (побеждает добавленный раньше), сегменты экранируются.
   */
  function renderText(issues, includeFixed) {
    var text = state.text;
    var ranges = [];

    function push(range) {
      var overlaps = ranges.some(function (other) {
        return range.start < other.end && other.start < range.end;
      });
      if (overlaps) {
        if (config.debug) {
          console.warn('[demo] overlapping highlight skipped:', range.issueId);
        }
        return;
      }
      ranges.push(range);
    }

    /* Зелёные диапазоны идут первыми: применённая замена важнее случайного совпадения. */
    if (includeFixed) {
      state.fixedRanges.forEach(function (fixedRange) {
        push({
          start: fixedRange.start,
          end: fixedRange.end,
          issueId: fixedRange.issueId,
          className: 'hl hl--fixed' + (fixedRange.issueId === state.lastFixedId ? ' is-new' : '')
        });
      });
    }

    issues.forEach(function (issue) {
      var range = findRange(text, issue);
      if (!range) {
        if (config.debug) {
          console.warn('[demo] match not found:', issue.id, issue.match);
        }
        return;
      }
      push({
        start: range.start,
        end: range.end,
        issueId: issue.id,
        className: 'hl hl--' + issue.category
      });
    });

    ranges.sort(function (a, b) { return a.start - b.start; });

    var html = '';
    var cursor = 0;
    ranges.forEach(function (range) {
      html += escapeHtml(text.slice(cursor, range.start));
      html += '<mark class="' + range.className + '" data-issue-id="' + range.issueId + '">' +
        escapeHtml(text.slice(range.start, range.end)) +
        '</mark>';
      cursor = range.end;
    });
    html += escapeHtml(text.slice(cursor));

    el.text.innerHTML = html;
  }

  /* --- Применение исправлений ------------------------------------------- */

  /*
   * Меняет match на replacement в рабочем тексте. Ранее применённые замены, которые лежат
   * правее, сдвигаются на разницу длин — иначе зелёная подсветка расползётся.
   */
  function applyFix(issueId) {
    var issue = issueById(issueId);
    if (!issue || !issue.replacement || state.fixed[issueId]) {
      return false;
    }

    var range = findRange(state.text, issue);
    if (!range) {
      if (config.debug) {
        console.warn('[demo] fix skipped, match not found:', issue.id);
      }
      return false;
    }

    var delta = issue.replacement.length - issue.match.length;
    state.text = state.text.slice(0, range.start) + issue.replacement + state.text.slice(range.end);

    state.fixedRanges.forEach(function (other) {
      if (other.start >= range.end) {
        other.start += delta;
        other.end += delta;
      }
    });
    state.fixedRanges.push({
      start: range.start,
      end: range.start + issue.replacement.length,
      issueId: issue.id
    });

    state.fixed[issue.id] = true;
    state.lastFixedId = issue.id;
    return true;
  }

  /* Применение фикса + перерисовка. Карточки не пересобираются: раскрытая остаётся раскрытой. */
  function applyAndRender(issueId) {
    if (!applyFix(issueId)) {
      return false;
    }
    markCardFixed(issueId);
    renderText(activeIssues(), true);
    highlightOpenIssue();
    refreshVerdict();
    renderClearNoticeIfDone();
    updateActions();
    el.panelHint.hidden = activeIssues().length === 0;
    return true;
  }

  function onFixClick(button) {
    var card = button.closest('.issue');
    var issue = issueById(card.dataset.issueId);
    if (!issue || !applyAndRender(issue.id)) {
      return;
    }
    track('demo_fix_apply', { example_id: state.exampleId, category: issue.category });
  }

  /* Fix errors применяет замены по очереди: разом меняющийся текст читается как подмена примера. */
  function onFixErrorsClick() {
    var pending = fixableIssues();
    if (!pending.length) {
      return;
    }

    state.fixingBatch = true;
    updateActions();
    track('demo_fix_errors', { example_id: state.exampleId, count: pending.length });

    pending.forEach(function (issue, index) {
      defer(function () {
        if (index === pending.length - 1) {
          state.fixingBatch = false;
        }
        applyAndRender(issue.id);
      }, reducedMotion ? 0 : index * config.fixStaggerMs);
    });
  }

  function issueById(issueId) {
    return currentExample().issues.filter(function (i) { return i.id === issueId; })[0];
  }

  /* --- Панель результатов ---------------------------------------------- */

  function renderIdlePanel() {
    el.issues.innerHTML = '';
    setLight(null, '');
    el.runButton.disabled = false;
    el.runButton.textContent = 'Check before sending';
    el.panelHint.hidden = true;
    el.cta.hidden = true;
    updateActions();
  }

  function updateActions() {
    var pending = state.phase === 'done' ? fixableIssues() : [];

    if (state.fixingBatch) {
      /* По ходу пакета счётчик тает — кнопка не перерисовывается, чтобы не мигать под курсором. */
      el.fixErrors.hidden = false;
      el.fixErrors.disabled = true;
      el.fixErrors.textContent = 'Fixing…';
    } else {
      el.fixErrors.hidden = pending.length === 0;
      el.fixErrors.disabled = false;
      el.fixErrors.textContent = 'Fix ' + pending.length + ' ' +
        plural(pending.length, 'error', 'errors');
    }

    el.reset.hidden = !hasFixes();
  }

  function renderIssues(issues) {
    if (!issues.length) {
      el.issues.innerHTML = hasFixes() ? clearNoticeHtml() : '';
      return;
    }

    el.issues.innerHTML = issues.map(issueCardHtml).join('');

    /* Карточки появляются по очереди: список, который проявляется, читается как результат работы. */
    Array.prototype.forEach.call(el.issues.children, function (card, index) {
      if (reducedMotion) {
        card.classList.add('is-visible');
        return;
      }
      defer(function () {
        card.classList.add('is-visible');
      }, index * config.issueStaggerMs);
    });
  }

  function clearNoticeHtml() {
    return '<li class="issue issue--clear is-visible">' +
      '<span class="issue__icon" aria-hidden="true">' + FIXED_ICON + '</span>' +
      'Nothing left to fix. Run the check again to confirm.' +
      '</li>';
  }

  /* Когда исправлено всё, список карточек сменяется одной строкой — иначе панель выглядит занятой. */
  function renderClearNoticeIfDone() {
    if (activeIssues().length === 0) {
      el.issues.innerHTML = clearNoticeHtml();
      /* Раскрытой карточки больше нет — снимаем и обводку с её фрагмента в тексте. */
      state.openIssueId = null;
      highlightOpenIssue();
    }
  }

  function issueCardHtml(issue) {
    return '' +
      '<li class="issue issue--' + issue.severity + '" data-issue-id="' + issue.id + '">' +
        '<button type="button" class="issue__head" aria-expanded="false">' +
          '<span class="issue__icon" aria-hidden="true">' + CATEGORY_ICONS[issue.category] + '</span>' +
          '<span class="issue__titles">' +
            '<span class="issue__category">' + CATEGORY_LABELS[issue.category] + '</span>' +
            '<span class="issue__title">' + escapeHtml(issue.title) + '</span>' +
          '</span>' +
          '<span class="issue__chevron" aria-hidden="true">▾</span>' +
        '</button>' +
        '<div class="issue__body" hidden>' +
          '<p class="issue__detail">' + escapeHtml(issue.detail) + '</p>' +
          /* Акцентная заливка — признак того, что здесь есть кнопка. Нет кнопки — нет акцента. */
          '<div class="issue__fix' + (issue.replacement ? '' : ' issue__fix--manual') + '">' +
            '<span class="issue__fix-label">Fix</span>' +
            '<p class="issue__fix-text">' + escapeHtml(issue.fix) + '</p>' +
            fixActionHtml(issue) +
          '</div>' +
        '</div>' +
      '</li>';
  }

  /*
   * Кнопка — только там, где расширение знает, как надо. Где не знает (плейсхолдеры), вместо
   * кнопки стоит строка `manual`: отсутствие кнопки должно читаться как решение, а не как недоделка.
   */
  function fixActionHtml(issue) {
    if (issue.replacement) {
      return '<button type="button" class="issue__fix-btn" data-fix>Apply this fix</button>';
    }
    if (issue.manual) {
      return '<p class="issue__fix-manual">' +
        '<span class="issue__fix-manual-icon" aria-hidden="true">✎</span>' +
        escapeHtml(issue.manual) +
        '</p>';
    }
    return '';
  }

  function markCardFixed(issueId) {
    var card = el.issues.querySelector('.issue[data-issue-id="' + issueId + '"]');
    if (!card) {
      return;
    }
    card.classList.add('is-fixed');
    card.querySelector('.issue__icon').textContent = FIXED_ICON;
    card.querySelector('.issue__category').textContent = 'Fixed';

    var button = card.querySelector('[data-fix]');
    if (button) {
      button.disabled = true;
      button.textContent = FIXED_ICON + ' Applied';
    }
  }

  function onIssueClick(event) {
    var fixButton = event.target.closest('[data-fix]');
    if (fixButton) {
      onFixClick(fixButton);
      return;
    }

    var head = event.target.closest('.issue__head');
    if (!head) {
      return;
    }
    var card = head.closest('.issue');
    var issueId = card.dataset.issueId;
    var issue = issueById(issueId);

    /* Раскрыта одна карточка одновременно; повторный клик сворачивает. */
    var willOpen = state.openIssueId !== issueId;
    state.openIssueId = willOpen ? issueId : null;

    Array.prototype.forEach.call(el.issues.children, function (other) {
      if (!other.querySelector('.issue__head')) {
        return;
      }
      var open = other === card && willOpen;
      other.classList.toggle('is-open', open);
      other.querySelector('.issue__head').setAttribute('aria-expanded', open ? 'true' : 'false');
      other.querySelector('.issue__body').hidden = !open;
    });

    highlightOpenIssue();

    if (willOpen) {
      track('demo_issue_open', { category: issue.category });
    }
  }

  /* Подсветка активного фрагмента живёт отдельно: текст перерисовывается и после фиксов. */
  function highlightOpenIssue() {
    Array.prototype.forEach.call(el.text.querySelectorAll('.hl'), function (mark) {
      mark.classList.toggle('is-active', mark.dataset.issueId === state.openIssueId);
    });
  }

  /* --- Утилиты ---------------------------------------------------------- */

  function defer(fn, delay) {
    state.timers.push(setTimeout(fn, delay));
  }

  function clearTimers() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
  }

  function plural(count, one, many) {
    return count === 1 ? one : many;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init: init };
})();
