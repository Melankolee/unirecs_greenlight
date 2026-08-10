/*
 * Демо-блок: машина состояний idle → scanning → done.
 *
 * Подсветка строится программно по полю match, разметка в тексте примеров не хранится.
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

  var state = {
    exampleId: null,
    phase: 'idle',       // idle | scanning | done
    openIssueId: null,
    timers: []
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
    el.light = el.root.querySelector('[data-demo-light]');
    el.caption = el.root.querySelector('[data-demo-caption]');
    el.issues = el.root.querySelector('[data-demo-issues]');
    el.panelHint = el.root.querySelector('[data-demo-hint]');

    if (config.debug) {
      var problems = window.validateDemoData(window.DEMO_EXAMPLES);
      problems.forEach(function (message) { console.warn('[demo-data]', message); });
    }

    renderTabs();
    el.tabs.addEventListener('click', onTabClick);
    el.runButton.addEventListener('click', onRunClick);
    el.issues.addEventListener('click', onIssueClick);

    selectExample(window.DEMO_EXAMPLES[0].id, { silent: true });
  }

  function currentExample() {
    return window.DEMO_EXAMPLES.filter(function (e) {
      return e.id === state.exampleId;
    })[0];
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

  /* Смена примера отменяет текущий прогон и всегда возвращает в idle. */
  function selectExample(exampleId, options) {
    clearTimers();
    state.exampleId = exampleId;
    state.phase = 'idle';
    state.openIssueId = null;

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
    if (state.phase === 'done') {
      selectExample(state.exampleId, { silent: true });
    }
    run();
  }

  function run() {
    var example = currentExample();
    state.phase = 'scanning';
    state.openIssueId = null;

    el.runButton.disabled = true;
    el.runButton.textContent = 'Checking…';
    el.root.classList.add('is-scanning');
    el.issues.innerHTML = '';
    setLight(null, '');

    track('demo_run', { example_id: example.id });

    /* Пауза смысловая: мгновенный результат читается как заранее записанный. */
    defer(function () {
      el.root.classList.remove('is-scanning');
      state.phase = 'done';
      showResult(example);
    }, config.scanDurationMs);
  }

  function showResult(example) {
    var verdict = window.verdictFromIssues(example.issues);

    renderText(example.issues);
    setLight(verdict, captionFor(verdict, example.issues));
    renderIssues(example.issues);

    el.runButton.disabled = false;
    el.runButton.textContent = 'Run again';
    el.panelHint.hidden = example.issues.length === 0;

    if (window.matchMedia('(max-width: 899px)').matches) {
      el.light.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  }

  function captionFor(verdict, issues) {
    if (verdict === 'green') {
      return 'Good to go';
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

  /*
   * Находит occurrence-е вхождение match, отбрасывает пересечения (побеждает issue, идущая
   * раньше в массиве), собирает HTML с экранированием.
   */
  function renderText(issues) {
    var text = currentExample().text;
    var ranges = [];

    issues.forEach(function (issue) {
      var occurrence = issue.occurrence || 1;
      var index = -1;
      for (var i = 0; i < occurrence; i++) {
        index = text.indexOf(issue.match, index + 1);
        if (index === -1) {
          break;
        }
      }
      if (index === -1) {
        if (config.debug) {
          console.warn('[demo] match not found:', issue.id, issue.match);
        }
        return;
      }

      var range = { start: index, end: index + issue.match.length, issue: issue };
      var overlaps = ranges.some(function (other) {
        return range.start < other.end && other.start < range.end;
      });
      if (overlaps) {
        if (config.debug) {
          console.warn('[demo] overlapping highlight skipped:', issue.id);
        }
        return;
      }
      ranges.push(range);
    });

    ranges.sort(function (a, b) { return a.start - b.start; });

    var html = '';
    var cursor = 0;
    ranges.forEach(function (range) {
      html += escapeHtml(text.slice(cursor, range.start));
      html += '<mark class="hl hl--' + range.issue.category + '" ' +
        'data-issue-id="' + range.issue.id + '">' +
        escapeHtml(text.slice(range.start, range.end)) +
        '</mark>';
      cursor = range.end;
    });
    html += escapeHtml(text.slice(cursor));

    el.text.innerHTML = html;
  }

  /* --- Панель результатов ---------------------------------------------- */

  function renderIdlePanel() {
    el.issues.innerHTML = '';
    setLight(null, '');
    el.runButton.disabled = false;
    el.runButton.textContent = 'Check before sending';
    el.panelHint.hidden = true;
  }

  function renderIssues(issues) {
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
          '<p class="issue__fix"><span class="issue__fix-label">Fix</span> ' +
            escapeHtml(issue.fix) + '</p>' +
        '</div>' +
      '</li>';
  }

  function onIssueClick(event) {
    var head = event.target.closest('.issue__head');
    if (!head) {
      return;
    }
    var card = head.closest('.issue');
    var issueId = card.dataset.issueId;
    var issue = currentExample().issues.filter(function (i) { return i.id === issueId; })[0];

    /* Раскрыта одна карточка одновременно; повторный клик сворачивает. */
    var willOpen = state.openIssueId !== issueId;
    state.openIssueId = willOpen ? issueId : null;

    Array.prototype.forEach.call(el.issues.children, function (other) {
      var isTarget = other === card;
      var open = isTarget && willOpen;
      other.classList.toggle('is-open', open);
      other.querySelector('.issue__head').setAttribute('aria-expanded', open ? 'true' : 'false');
      other.querySelector('.issue__body').hidden = !open;
    });

    Array.prototype.forEach.call(el.text.querySelectorAll('.hl'), function (mark) {
      mark.classList.toggle('is-active', willOpen && mark.dataset.issueId === issueId);
    });

    if (willOpen) {
      track('demo_issue_open', { category: issue.category });
    }
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
