/*
 * Три примера предложений для демо.
 *
 * Правила правки:
 *  - `match` — точная подстрока из `text`. Теги в text не вставляем, подсветка строится по match.
 *  - `occurrence` — какое по счёту вхождение подсвечивать (нумерация с 1).
 *  - severity: critical → красный светофор, warning → жёлтый, note → на светофор не влияет.
 *  - `verdict` — ожидание; настоящий цвет считается из issues. Расхождение ловит validateDemoData().
 *  - `replacement` — текст, на который меняется `match` по кнопке. Необязательное поле.
 *  - `manual` — почему кнопки нет. Взаимоисключающее с `replacement`.
 *
 * Граница между ними одна: знает ли расширение, как надо. Формулировку и увод с площадки —
 * знает, чинит. Плейсхолдер — нет: настоящее имя клиента и настоящую цифру знает только автор,
 * подставить сюда что-нибудь правдоподобное значит соврать за него. Поэтому у category
 * `placeholder` поля `replacement` быть не может, это проверяется.
 */

window.DEMO_EXAMPLES = [
  {
    id: 'rushed',
    label: 'Rushed proposal',
    verdict: 'red',
    /* Остаётся красным: два незаменённых плейсхолдера — работа автора, кнопка их не трогает. */
    verdictAfterFixes: 'red',
    text:
      'Hi [Client Name],\n\n' +
      'I hope this message finds you well. I saw your job post and I think I\'m a great fit.\n\n' +
      'I have done similar projects before and increased signups by XX% for clients in your space. ' +
      'I can start this week and deliver the first draft in a few days.\n\n' +
      'To keep things simple, email me directly at alex.works@gmail.com and we can sort out the ' +
      'details there.\n\n' +
      'Best,\nAlex',
    issues: [
      {
        id: 'i1',
        category: 'placeholder',
        severity: 'critical',
        match: '[Client Name]',
        occurrence: 1,
        title: 'Unreplaced placeholder',
        detail: 'You are about to send a template with the client\'s name still missing.',
        fix: 'Replace it with the actual name from the job post.',
        manual: 'Yours to fill in — the name is in the job post, and guessing it is not our job.'
      },
      {
        id: 'i2',
        category: 'ai_cliche',
        severity: 'warning',
        match: 'I hope this message finds you well. I saw your job post and I think I\'m a great fit.',
        occurrence: 1,
        title: 'Opening line reads as AI-generated',
        detail: 'Clients see this exact sentence dozens of times a day. It signals a mass send.',
        fix: 'Open with something only someone who read the post could write.',
        replacement: 'Your post says signups stall right after the trial email — that\'s the part I\'d start with.'
      },
      {
        id: 'i3',
        category: 'placeholder',
        severity: 'critical',
        match: 'increased signups by XX% for clients in your space',
        occurrence: 1,
        title: 'Placeholder number left in',
        detail: 'A results claim with a placeholder instead of a figure destroys the claim.',
        fix: 'Put in the real number, or drop the claim.',
        manual: 'Yours to fill in — only you know the real figure, and inventing one is worse than dropping the sentence.'
      },
      {
        id: 'i4',
        category: 'tos_risk',
        severity: 'critical',
        match: 'To keep things simple, email me directly at alex.works@gmail.com and we can sort out the details there.',
        occurrence: 1,
        title: 'Moving the client off the platform',
        detail: 'Sharing contact details before a contract breaks the terms of every major marketplace. Accounts get suspended for this.',
        fix: 'Keep the conversation in the platform messenger until the contract is signed.',
        replacement: 'Happy to answer anything right here in the chat.'
      }
    ]
  },

  {
    id: 'ai-drafted',
    label: 'AI-drafted proposal',
    verdict: 'yellow',
    /* Здесь одни формулировки — их расширение чинит целиком, до зелёного. */
    verdictAfterFixes: 'green',
    text:
      'Hello Marcus,\n\n' +
      'In today\'s fast-paced world, a slow checkout is the difference between a sale and a bounce. ' +
      'I read your post about the Shopify migration and the abandoned cart numbers you mentioned.\n\n' +
      'I\'m excited to leverage my expertise in ecommerce performance to help you achieve your goals. ' +
      'Let\'s delve into what is actually slowing the funnel down: my first step would be a timing ' +
      'audit of the checkout steps, then a fix list ordered by impact.\n\n' +
      'I have six years on Shopify Plus builds and can share two similar migrations.\n\n' +
      'Happy to walk through the audit plan this week.\n\nMarta',
    issues: [
      {
        id: 'i1',
        category: 'ai_cliche',
        severity: 'warning',
        match: 'In today\'s fast-paced world, a slow checkout is the difference between a sale and a bounce.',
        occurrence: 1,
        title: 'Stock AI opener',
        detail: 'This phrase is one of the strongest tells of a generated draft.',
        fix: 'Start with the client\'s specific problem instead of a general statement.',
        replacement: 'A checkout that takes three seconds to respond loses the sale before the payment step.'
      },
      {
        id: 'i2',
        category: 'ai_cliche',
        severity: 'warning',
        match: 'I\'m excited to leverage my expertise in ecommerce performance to help you achieve your goals.',
        occurrence: 1,
        title: 'Vague self-description',
        detail: '"Leverage my expertise" says nothing a client can evaluate.',
        fix: 'Name the specific thing you did and the result it produced.',
        replacement: 'On a similar migration last year, trimming the checkout scripts cut load time from 4.1s to 1.6s.'
      },
      {
        id: 'i3',
        category: 'ai_cliche',
        severity: 'warning',
        match: 'Let\'s delve into what is actually slowing the funnel down: my first step would be a timing audit of the checkout steps',
        occurrence: 1,
        title: 'AI vocabulary',
        detail: '"Delve" almost never appears in how people actually write proposals.',
        fix: 'Use plain wording: "Here is what I would look at first".',
        replacement: 'My first step here would be a timing audit of the checkout steps'
      }
    ]
  },

  {
    id: 'clean',
    label: 'Clean proposal',
    verdict: 'green',
    verdictAfterFixes: 'green',
    text:
      'Hi Priya,\n\n' +
      'You need the onboarding emails rewritten because activation drops after day two. ' +
      'I have done this for two SaaS products with a similar drop, and in both cases the fix was ' +
      'cutting the welcome sequence from six emails to three.\n\n' +
      'How I would work: read your current sequence and the day-two data, rewrite three emails, ' +
      'then hand over a short doc on what to test next. About a week.\n\n' +
      'Rate is $1,800 for the rewrite. Two revision rounds included.\n\n' +
      'One question before I start: do you have access to open and click rates per email, or only ' +
      'the aggregate?\n\nSam',
    issues: [
      {
        /* Намеренно без replacement: показывает, что кнопка есть не у всего. */
        id: 'i1',
        category: 'ai_cliche',
        severity: 'note',
        match: 'How I would work',
        occurrence: 1,
        title: 'Optional: tighten the process line',
        detail: 'Nothing wrong here — this reads like a person. The process paragraph could be one line shorter.',
        fix: 'Optional. Send as is.'
      }
    ]
  }
];

/*
 * Самопроверка данных. Возвращает массив сообщений; пустой массив = данные валидны.
 * Вызывается из demo.js при config.debug.
 */
window.validateDemoData = function validateDemoData(examples) {
  var problems = [];

  examples.forEach(function (example) {
    var seenIds = {};

    example.issues.forEach(function (issue) {
      if (seenIds[issue.id]) {
        problems.push(example.id + ': duplicate issue id "' + issue.id + '"');
      }
      seenIds[issue.id] = true;

      var occurrence = issue.occurrence || 1;
      var index = -1;
      for (var i = 0; i < occurrence; i++) {
        index = example.text.indexOf(issue.match, index + 1);
        if (index === -1) {
          problems.push(
            example.id + '/' + issue.id + ': match "' + issue.match +
            '" not found (occurrence ' + occurrence + ')'
          );
          break;
        }
      }

      /* Кнопка и объяснение её отсутствия — ровно одно из двух, иначе карточка врёт. */
      if (issue.replacement && issue.manual) {
        problems.push(example.id + '/' + issue.id + ': has both replacement and manual');
      }
      if (!issue.replacement && !issue.manual && issue.severity !== 'note') {
        problems.push(example.id + '/' + issue.id + ': no replacement and no manual explaining why');
      }
      /* Главная граница: плейсхолдер подставить нечем, значение знает только автор. */
      if (issue.category === 'placeholder' && issue.replacement) {
        problems.push(
          example.id + '/' + issue.id + ': placeholder must not have a replacement'
        );
      }

      if (issue.replacement === undefined) {
        return;
      }
      if (!issue.replacement || issue.replacement === issue.match) {
        problems.push(example.id + '/' + issue.id + ': replacement is empty or identical to match');
      }
      /* Замена не должна втягивать в текст чужой match: появится подсветка от уже исправленного. */
      example.issues.forEach(function (other) {
        if (other !== issue && issue.replacement.indexOf(other.match) !== -1) {
          problems.push(
            example.id + '/' + issue.id + ': replacement contains match of "' + other.id + '"'
          );
        }
      });
    });

    var expected = window.verdictFromIssues
      ? window.verdictFromIssues(example.issues)
      : null;
    if (expected && expected !== example.verdict) {
      problems.push(
        example.id + ': verdict "' + example.verdict + '" but issues imply "' + expected + '"'
      );
    }

    /*
     * Куда приезжает светофор после кнопки «Fix errors». Зелёным он обязан быть не всегда:
     * в rushed остаются плейсхолдеры, и красный там — правда, а не недоделка. Поле обязательное,
     * чтобы этот итог был решением автора данных, а не побочным эффектом правки текстов.
     */
    var unfixable = example.issues.filter(function (issue) { return !issue.replacement; });
    var afterFixes = window.verdictFromIssues ? window.verdictFromIssues(unfixable) : null;
    if (afterFixes && afterFixes !== example.verdictAfterFixes) {
      problems.push(
        example.id + ': verdictAfterFixes "' + example.verdictAfterFixes +
        '" but the remaining issues imply "' + afterFixes + '"'
      );
    }
  });

  return problems;
};
