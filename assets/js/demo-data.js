/*
 * Три примера предложений для демо.
 *
 * Правила правки:
 *  - `match` — точная подстрока из `text`. Теги в text не вставляем, подсветка строится по match.
 *  - `occurrence` — какое по счёту вхождение подсвечивать (нумерация с 1).
 *  - severity: critical → красный светофор, warning → жёлтый, note → на светофор не влияет.
 *  - `verdict` — ожидание; настоящий цвет считается из issues. Расхождение ловит validateDemoData().
 */

window.DEMO_EXAMPLES = [
  {
    id: 'rushed',
    label: 'Rushed proposal',
    verdict: 'red',
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
        fix: 'Replace it with the actual name from the job post.'
      },
      {
        id: 'i2',
        category: 'ai_cliche',
        severity: 'warning',
        match: 'I hope this message finds you well',
        occurrence: 1,
        title: 'Opening line reads as AI-generated',
        detail: 'Clients see this exact sentence dozens of times a day. It signals a mass send.',
        fix: 'Open with something only someone who read the post could write.'
      },
      {
        id: 'i3',
        category: 'placeholder',
        severity: 'critical',
        match: 'XX%',
        occurrence: 1,
        title: 'Placeholder number left in',
        detail: 'A results claim with a placeholder instead of a figure destroys the claim.',
        fix: 'Put in the real number, or drop the sentence.'
      },
      {
        id: 'i4',
        category: 'tos_risk',
        severity: 'critical',
        match: 'email me directly at alex.works@gmail.com',
        occurrence: 1,
        title: 'Moving the client off the platform',
        detail: 'Sharing contact details before a contract breaks the terms of every major marketplace. Accounts get suspended for this.',
        fix: 'Keep the conversation in the platform messenger until the contract is signed.'
      }
    ]
  },

  {
    id: 'ai-drafted',
    label: 'AI-drafted proposal',
    verdict: 'yellow',
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
        match: 'In today\'s fast-paced world',
        occurrence: 1,
        title: 'Stock AI opener',
        detail: 'This phrase is one of the strongest tells of a generated draft.',
        fix: 'Start with the client\'s specific problem instead of a general statement.'
      },
      {
        id: 'i2',
        category: 'ai_cliche',
        severity: 'warning',
        match: 'I\'m excited to leverage my expertise',
        occurrence: 1,
        title: 'Vague self-description',
        detail: '"Leverage my expertise" says nothing a client can evaluate.',
        fix: 'Name the specific thing you did and the result it produced.'
      },
      {
        id: 'i3',
        category: 'ai_cliche',
        severity: 'warning',
        match: 'Let\'s delve into',
        occurrence: 1,
        title: 'AI vocabulary',
        detail: '"Delve" almost never appears in how people actually write proposals.',
        fix: 'Use plain wording: "Here is what I would look at first".'
      }
    ]
  },

  {
    id: 'clean',
    label: 'Clean proposal',
    verdict: 'green',
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
    });

    var expected = window.verdictFromIssues
      ? window.verdictFromIssues(example.issues)
      : null;
    if (expected && expected !== example.verdict) {
      problems.push(
        example.id + ': verdict "' + example.verdict + '" but issues imply "' + expected + '"'
      );
    }
  });

  return problems;
};
