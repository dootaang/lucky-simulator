import { groupByFolder, splitDecorators } from '../core/lorebook/normalize.js';

export function renderLorebookView(container, ctx) {
  const lore = ctx.lore;
  const header = document.createElement('div');
  header.className = 'view-header with-controls';
  const title = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.textContent = '로어북';
  const meta = document.createElement('p');
  meta.textContent = lore ? `${lore.bookName || '이름 없음'} · ${lore.entries.filter((e) => !e.isFolder).length}개 항목` : '로어북 없음';
  title.append(h2, meta);

  const search = document.createElement('input');
  search.className = 'search-input';
  search.type = 'search';
  search.placeholder = '이름, 키, 본문 검색';
  header.append(title, search);

  const content = document.createElement('div');
  content.className = 'lorebook-layout';
  container.append(header, content);

  const render = () => renderGroups(content, lore, search.value);
  search.addEventListener('input', render);
  render();
  return () => {};
}

function renderGroups(container, lore, query) {
  container.replaceChildren();
  if (!lore) {
    const empty = document.createElement('p');
    empty.className = 'muted-line';
    empty.textContent = '이 카드에서 로어북을 찾지 못했습니다.';
    container.append(empty);
    return;
  }
  const groups = displayGroups(lore.entries);
  const q = String(query || '').trim().toLowerCase();
  for (const group of groups) {
    const items = group.items.filter((entry) => matches(entry, q));
    if (!items.length) continue;
    const section = document.createElement('section');
    section.className = 'lore-group';
    const h3 = document.createElement('h3');
    h3.textContent = group.folder ? group.folder.name : '루트';
    const count = document.createElement('span');
    count.className = 'count-badge';
    count.textContent = `${items.length}`;
    h3.append(count);
    section.append(h3);
    for (const entry of items) section.append(renderEntry(entry));
    container.append(section);
  }
}

function displayGroups(entries) {
  const coreGroups = groupByFolder(entries || []);
  if (coreGroups.some((group) => group.folder)) return coreGroups;

  const groups = [];
  let current = { folder: null, items: [] };
  const pushCurrent = () => {
    if (current.items.length || current.folder) groups.push(current);
  };
  for (const entry of entries || []) {
    const marker = folderMarker(entry);
    if (marker) {
      pushCurrent();
      current = { folder: { name: entry.name || marker, raw: entry.raw }, items: [] };
      continue;
    }
    if (entry.isFolder) continue;
    current.items.push(entry);
  }
  pushCurrent();
  return groups.length ? groups : [{ folder: null, items: (entries || []).filter((e) => !e.isFolder) }];
}

function folderMarker(entry) {
  if (!entry || entry.content) return '';
  const keys = Array.isArray(entry.keys) ? entry.keys : [];
  const found = keys.find((key) => String(key).includes('folder:'));
  return found || '';
}

function renderEntry(entry) {
  const details = document.createElement('details');
  details.className = 'lore-entry';
  const summary = document.createElement('summary');
  const name = document.createElement('span');
  name.className = 'entry-name';
  name.textContent = entry.name || entry.keys[0] || '(이름 없음)';
  const length = document.createElement('span');
  length.className = 'entry-length';
  length.textContent = `${entry.content.length.toLocaleString()}자`;
  summary.append(name, length);

  const meta = document.createElement('div');
  meta.className = 'badge-row';
  for (const badge of badges(entry)) {
    const span = document.createElement('span');
    span.className = 'badge';
    span.textContent = badge;
    meta.append(span);
  }

  const keys = document.createElement('div');
  keys.className = 'key-cloud';
  appendKeyLine(keys, '키', entry.keys);
  appendKeyLine(keys, '2차 키', entry.secondaryKeys);

  const split = splitDecorators(entry.content);
  const decoratorRow = document.createElement('div');
  decoratorRow.className = 'chip-row';
  for (const item of split.decorators) {
    const chip = document.createElement('span');
    chip.className = 'decorator-chip';
    chip.textContent = item;
    decoratorRow.append(chip);
  }

  const pre = document.createElement('pre');
  pre.textContent = split.body;

  details.append(summary, meta, keys);
  if (split.decorators.length) details.append(decoratorRow);
  details.append(pre);
  return details;
}

function appendKeyLine(container, label, values) {
  if (!values || !values.length) return;
  const line = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  line.append(strong);
  line.append(document.createTextNode(values.join(', ')));
  container.append(line);
}

function badges(entry) {
  return [
    entry.enabled === false ? 'disabled' : 'enabled',
    entry.constant ? 'constant' : '',
    entry.selective ? 'selective' : '',
    entry.useRegex ? 'useRegex' : '',
    entry.position ? `position:${entry.position}` : '',
  ].filter(Boolean);
}

function matches(entry, q) {
  if (!q) return true;
  const haystack = [
    entry.name,
    ...(entry.keys || []),
    ...(entry.secondaryKeys || []),
    entry.content,
  ].join('\n').toLowerCase();
  return haystack.includes(q);
}
