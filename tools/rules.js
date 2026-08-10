/*
 * Правила детекции — ТОЛЬКО инструмент разработки.
 *
 * В лендинге детекции нет: демо показывает захардкоженные issues из assets/js/demo-data.js
 * (см. BUSINESS-LOGIC.md, раздел 0 — «нет вызовов LLM, результаты захардкожены»).
 *
 * Этот файл нужен для двух вещей:
 *  1. прогнать любой текст предложения и увидеть, что продукт должен на нём поймать;
 *  2. сгенерировать готовый объект для demo-data.js при добавлении нового примера.
 *
 * Правила литеральные и заведомо неполные — это набросок будущей логики расширения,
 * а не она сама.
 */

'use strict';

/*
 * pattern: строка (буквальный поиск, регистронезависимо) или RegExp с флагом g.
 * severity по умолчанию берётся из категории; у отдельного правила можно переопределить.
 */
const RULES = [
  /* ---- placeholder: всегда critical ---------------------------------- */
  {
    category: 'placeholder',
    // [Client Name], [Your Rate], [ANY THING] — квадратные скобки с текстом внутри
    pattern: /\[[A-Za-z][A-Za-z0-9 _\/'-]{1,40}\]/g,
    title: 'Unreplaced placeholder',
    detail: 'You are about to send a template with a placeholder still in it.',
    fix: 'Replace it with the real value from the job post.'
  },
  {
    category: 'placeholder',
    pattern: /\bX{2,}\s?%/g,
    title: 'Placeholder number left in',
    detail: 'A results claim with a placeholder instead of a figure destroys the claim.',
    fix: 'Put in the real number, or drop the sentence.'
  },
  {
    category: 'placeholder',
    pattern: /\b(TBD|TODO|FIXME)\b/g,
    title: 'Draft marker left in',
    detail: 'A draft marker tells the client this was never finished.',
    fix: 'Fill it in or remove the line.'
  },
  {
    category: 'placeholder',
    pattern: 'Lorem ipsum',
    title: 'Filler text left in',
    detail: 'Placeholder copy is still in the proposal.',
    fix: 'Replace it with the real text.'
  },
  {
    category: 'placeholder',
    pattern: /\{\{[^}]{1,40}\}\}/g,
    title: 'Unrendered template variable',
    detail: 'A template variable was never substituted.',
    fix: 'Replace it with the real value.'
  },

  /* ---- ai_cliche: всегда warning ------------------------------------- */
  {
    category: 'ai_cliche',
    pattern: 'I hope this message finds you well',
    title: 'Opening line reads as AI-generated',
    detail: 'Clients see this exact sentence dozens of times a day. It signals a mass send.',
    fix: 'Open with something only someone who read the post could write.'
  },
  {
    category: 'ai_cliche',
    pattern: /In today'?s fast-paced world/g,
    title: 'Stock AI opener',
    detail: 'This phrase is one of the strongest tells of a generated draft.',
    fix: "Start with the client's specific problem instead of a general statement."
  },
  {
    category: 'ai_cliche',
    pattern: /Let'?s delve into/g,
    title: 'AI vocabulary',
    detail: '"Delve" almost never appears in how people actually write proposals.',
    fix: 'Use plain wording: "Here is what I would look at first".'
  },
  {
    category: 'ai_cliche',
    pattern: /I'?m excited to leverage my expertise/g,
    title: 'Vague self-description',
    detail: '"Leverage my expertise" says nothing a client can evaluate.',
    fix: 'Name the specific thing you did and the result it produced.'
  },
  {
    category: 'ai_cliche',
    pattern: 'It is important to note that',
    title: 'AI filler phrase',
    detail: 'Padding that adds no information for the client.',
    fix: 'Delete it and state the point directly.'
  },
  {
    category: 'ai_cliche',
    pattern: /\bgame-?changer\b/g,
    title: 'Empty superlative',
    detail: 'Reads as marketing copy, not as a person who did the work.',
    fix: 'Describe the actual outcome instead.'
  },
  {
    category: 'ai_cliche',
    pattern: /\bseamless(ly)?\b/g,
    title: 'Empty adjective',
    detail: 'Common in generated drafts, tells the client nothing.',
    fix: 'Cut it, or say what specifically will not break.'
  },
  {
    category: 'ai_cliche',
    pattern: /\btapestry\b/g,
    title: 'AI vocabulary',
    detail: 'Almost never used by people writing proposals.',
    fix: 'Rewrite the sentence in plain words.'
  },

  /* ---- tos_risk: всегда critical ------------------------------------- */
  {
    category: 'tos_risk',
    pattern: /email me (directly )?at\b/g,
    title: 'Moving the client off the platform',
    detail: 'Sharing contact details before a contract breaks the terms of every major marketplace. Accounts get suspended for this.',
    fix: 'Keep the conversation in the platform messenger until the contract is signed.'
  },
  {
    category: 'tos_risk',
    pattern: /(settle|pay|work) (this )?(out )?outside (the |of the )?platform/g,
    title: 'Off-platform payment',
    detail: 'Suggesting payment outside the platform is grounds for immediate suspension.',
    fix: 'Bill through the platform.'
  },
  {
    category: 'tos_risk',
    pattern: /(add|message|reach) me on (Telegram|WhatsApp|Skype|Signal|Discord)/gi,
    title: 'Off-platform contact',
    detail: 'Moving the client to a private messenger before a contract breaks platform rules.',
    fix: 'Stay in the platform messenger until the contract is signed.'
  },
  {
    category: 'tos_risk',
    pattern: /(avoid|skip|save on|saves?(\s+us)?(\s+both)?(\s+on)?|without)\s+(the\s+)?(platform\s+|service\s+|Upwork\s+|Fiverr\s+)?fees?/g,
    title: 'Fee avoidance',
    detail: 'Explicitly proposing to avoid platform fees is a hard rule violation.',
    fix: 'Remove the sentence.'
  },
  {
    category: 'tos_risk',
    // прямые контакты в тексте: email и телефон
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g,
    title: 'Contact details in the proposal',
    detail: 'An email address in the proposal body is read as an attempt to move off-platform.',
    fix: 'Remove it — the client can reach you through the platform.'
  },
  {
    category: 'tos_risk',
    pattern: /\bpay(ment)? (me )?(via|through|by) (PayPal|Zelle|Venmo|Revolut|crypto|USDT|BTC)/gi,
    title: 'Direct payment method',
    detail: 'Naming a payment method outside the platform is a rule violation.',
    fix: 'Bill through the platform.'
  }
];

const DEFAULT_SEVERITY = {
  placeholder: 'critical',
  ai_cliche: 'warning',
  tos_risk: 'critical'
};

/*
 * Прогоняет текст по правилам. Возвращает массив issues в формате demo-data.js,
 * отсортированный по позиции в тексте, с посчитанным occurrence.
 */
function analyze(text) {
  const hits = [];

  RULES.forEach(function (rule) {
    findAll(text, rule.pattern).forEach(function (hit) {
      hits.push({
        start: hit.start,
        match: hit.match,
        category: rule.category,
        severity: rule.severity || DEFAULT_SEVERITY[rule.category],
        title: rule.title,
        detail: rule.detail,
        fix: rule.fix
      });
    });
  });

  hits.sort(function (a, b) { return a.start - b.start; });

  /* Пересечения: побеждает более раннее (и при равном старте — более длинное) совпадение.
     Демо не умеет рисовать вложенную подсветку, поэтому здесь та же политика. */
  const kept = [];
  hits.forEach(function (hit) {
    const end = hit.start + hit.match.length;
    const overlaps = kept.some(function (other) {
      return hit.start < other.start + other.match.length && other.start < end;
    });
    if (!overlaps) {
      kept.push(hit);
    }
  });

  /* occurrence = какое по счёту вхождение этой подстроки в тексте, для поля demo-data. */
  const counters = {};
  return kept.map(function (hit, index) {
    counters[hit.match] = (counters[hit.match] || 0) + 1;
    return {
      id: 'i' + (index + 1),
      category: hit.category,
      severity: hit.severity,
      match: hit.match,
      occurrence: occurrenceOf(text, hit.match, hit.start),
      title: hit.title,
      detail: hit.detail,
      fix: hit.fix
    };
  });
}

function findAll(text, pattern) {
  const out = [];

  if (typeof pattern === 'string') {
    const haystack = text.toLowerCase();
    const needle = pattern.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      out.push({ start: index, match: text.substr(index, pattern.length) });
      index = haystack.indexOf(needle, index + 1);
    }
    return out;
  }

  /* Все правила регистронезависимы: «Let's delve into» и «let's delve into» — одна и та же проблема.
     Флаги правил не обязаны это указывать, нормализуем здесь. */
  let flags = pattern.flags;
  if (flags.indexOf('g') === -1) { flags += 'g'; }
  if (flags.indexOf('i') === -1) { flags += 'i'; }
  const regex = new RegExp(pattern.source, flags);
  let m;
  while ((m = regex.exec(text)) !== null) {
    out.push({ start: m.index, match: m[0] });
    if (m[0] === '') {
      regex.lastIndex++;
    }
  }
  return out;
}

function occurrenceOf(text, match, start) {
  let count = 0;
  let index = text.indexOf(match);
  while (index !== -1 && index <= start) {
    count++;
    index = text.indexOf(match, index + 1);
  }
  return count || 1;
}

/* Те же правила, что в demo.js — специально дублируются, чтобы инструмент не тянул браузерный код. */
function verdictFromIssues(issues) {
  if (issues.some(function (i) { return i.severity === 'critical'; })) {
    return 'red';
  }
  return issues.some(function (i) { return i.severity === 'warning'; }) ? 'yellow' : 'green';
}

function captionFor(verdict, issues) {
  const plural = function (n, one, many) { return n === 1 ? one : many; };

  if (verdict === 'green') {
    return 'Good to go';
  }
  if (verdict === 'red') {
    const blocking = issues.filter(function (i) { return i.severity === 'critical'; }).length;
    return "Don't send yet — " + blocking + ' blocking ' + plural(blocking, 'issue', 'issues');
  }
  const reviewable = issues.filter(function (i) { return i.severity !== 'critical'; }).length;
  return 'Send with caution — ' + reviewable + ' ' +
    plural(reviewable, 'thing', 'things') + ' to review';
}

module.exports = { RULES, analyze, verdictFromIssues, captionFor };
