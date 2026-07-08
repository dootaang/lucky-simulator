import { simulateActivation } from '../core/lorebook/activate.js';
import { estimateLorebookTokens } from '../core/lorebook/tokens.js';

export function renderActivateView(container, ctx) {
  const lore = ctx.lore;
  const header = document.createElement('div');
  header.className = 'view-header';
  const h2 = document.createElement('h2');
  h2.textContent = '활성화 시뮬레이터';
  const meta = document.createElement('p');
  meta.textContent = lore ? '가상의 최근 대화에 대해 어떤 로어북이 발동하는지 계산합니다.' : '로어북 없음';
  header.append(h2, meta);

  const layout = document.createElement('div');
  layout.className = 'activate-layout';
  container.append(header, layout);

  if (!lore) {
    const empty = document.createElement('p');
    empty.className = 'muted-line';
    empty.textContent = '이 카드에는 시뮬레이션할 로어북이 없습니다.';
    layout.append(empty);
    return () => {};
  }

  const controls = document.createElement('section');
  controls.className = 'control-panel';
  const textarea = document.createElement('textarea');
  textarea.className = 'conversation-input';
  textarea.placeholder = '예: 던전에 가자';

  const quick = document.createElement('button');
  quick.type = 'button';
  quick.className = 'secondary-btn';
  quick.textContent = '던전에 가자';
  quick.addEventListener('click', () => {
    textarea.value = '던전에 가자';
    run();
  });

  const scanDepth = numberInput('scanDepth', lore.scanDepth || 10, 1, 100);
  const tokenBudget = numberInput('tokenBudget', lore.tokenBudget || 0, 0, 200000);
  const caseSensitive = checkboxInput('대소문자 구분', false);
  const wholeWord = checkboxInput('단어 단위', false);

  controls.append(
    labelWrap('최근 대화', textarea),
    quick,
    labelWrap('scanDepth', scanDepth),
    labelWrap('tokenBudget', tokenBudget),
    caseSensitive.wrap,
    wholeWord.wrap
  );

  const output = document.createElement('section');
  output.className = 'activation-output';
  layout.append(controls, output);

  const run = () => {
    const result = simulateActivation(lore, expandKoreanSearchText(textarea.value), {
      scanDepth: Number(scanDepth.value),
      tokenBudget: Number(tokenBudget.value),
      caseSensitive: caseSensitive.input.checked,
      wholeWord: wholeWord.input.checked,
    });
    renderResult(output, lore, result);
  };

  for (const el of [textarea, scanDepth, tokenBudget, caseSensitive.input, wholeWord.input]) {
    el.addEventListener('input', run);
    el.addEventListener('change', run);
  }
  run();
  return () => {};
}

function expandKoreanSearchText(input) {
  const text = String(input || '');
  const particles = ['으로부터', '에게서', '께서는', '에서는', '으로', '에서', '에게', '까지', '부터', '께서', '은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '도', '만', '로', '랑'];
  const extras = new Set();
  for (const raw of text.split(/[\s,.;:!?()[\]{}"'`~]+/)) {
    const token = raw.trim();
    if (token.length < 2) continue;
    for (const particle of particles) {
      if (token.length > particle.length + 1 && token.endsWith(particle)) {
        extras.add(token.slice(0, -particle.length));
        break;
      }
    }
  }
  return extras.size ? `${text}\n${Array.from(extras).join(' ')}` : text;
}

function renderResult(container, lore, result) {
  container.replaceChildren();
  const tokenStats = estimateLorebookTokens(lore.entries);
  const summary = document.createElement('div');
  summary.className = 'result-summary';
  summary.append(
    metric('발동', `${result.active.length}개`),
    metric('토큰 합계', result.tokenTotal.toLocaleString()),
    metric('예산 사용', result.tokenBudget > 0 ? `${result.budgetUsed.toLocaleString()} / ${result.tokenBudget.toLocaleString()}` : '무제한'),
    metric('상시활성 토큰', tokenStats.constant.toLocaleString())
  );

  const active = listSection('발동 항목', result.active, true);
  const dropped = listSection('예산 탈락', result.budgetDropped, true);
  const inactive = listSection('미발동 항목', result.inactive.slice(0, 80), false);
  container.append(summary, active);
  if (result.budgetDropped.length) container.append(dropped);
  container.append(inactive);
}

function listSection(title, rows, active) {
  const section = document.createElement('section');
  section.className = 'activation-list';
  const h3 = document.createElement('h3');
  h3.textContent = `${title} ${rows.length}`;
  section.append(h3);
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'muted-line';
    empty.textContent = '없음';
    section.append(empty);
    return section;
  }
  for (const row of rows) section.append(resultRow(row, active));
  return section;
}

function resultRow(row, active) {
  const details = document.createElement(active ? 'article' : 'details');
  details.className = active ? 'activation-row active' : 'activation-row';
  const head = active ? document.createElement('div') : document.createElement('summary');
  head.className = 'activation-head';
  const name = document.createElement('strong');
  name.textContent = row.name || '(이름 없음)';
  const meta = document.createElement('span');
  meta.textContent = `${row.tokens || 0} tokens · ${row.reason}${row.key ? ` · ${row.key}` : ''}${row.secondaryKey ? ` + ${row.secondaryKey}` : ''}`;
  head.append(name, meta);
  const detail = document.createElement('p');
  detail.className = 'muted-line';
  detail.textContent = row.detail || '';
  details.append(head, detail);
  return details;
}

function metric(label, value) {
  const item = document.createElement('div');
  item.className = 'metric';
  const k = document.createElement('span');
  k.textContent = label;
  const v = document.createElement('strong');
  v.textContent = value;
  item.append(k, v);
  return item;
}

function numberInput(name, value, min, max) {
  const input = document.createElement('input');
  input.type = 'number';
  input.name = name;
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  return input;
}

function checkboxInput(label, checked) {
  const wrap = document.createElement('label');
  wrap.className = 'check-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  wrap.append(input, document.createTextNode(label));
  return { wrap, input };
}

function labelWrap(label, child) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(span, child);
  return wrap;
}
