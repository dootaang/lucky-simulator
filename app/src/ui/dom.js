function hiddenBase(node) {
  const wrap = el('div', 'play-hidden');
  wrap.append(node);
  return wrap;
}

function field(label, child) {
  const wrap = el('label', 'field');
  const span = el('span');
  span.textContent = label;
  wrap.append(span, child);
  return wrap;
}

function row(...children) {
  const wrap = el('div', 'play-button-row');
  wrap.append(...children);
  return wrap;
}

function notice(text) {
  const p = el('p', 'muted-line play-notice');
  p.textContent = text;
  return p;
}

function namedInput(name, value, type = 'text') {
  const node = el('input');
  node.name = name;
  node.type = type;
  node.value = value;
  return node;
}

function namedTextarea(name, value) {
  const node = el('textarea');
  node.name = name;
  node.value = value;
  return node;
}

function namedSelect(name) {
  const node = el('select');
  node.name = name;
  return node;
}

function appendOption(select, value, label, disabled) {
  const option = el('option');
  option.value = String(value);
  option.textContent = label;
  option.disabled = !!disabled;
  select.append(option);
}

function button(text, className) {
  const node = el('button', className);
  node.type = 'button';
  node.textContent = text;
  return node;
}

function el(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function copyFallback(text, done) {
  const ta = el('textarea', 'offscreen');
  ta.value = text;
  ta.setAttribute('readonly', '');
  document.body.append(ta);
  ta.select();
  try { document.execCommand('copy'); if (done) done(); } catch (_) { /* ignore */ }
  ta.remove();
}

module.exports = {
  el,
  button,
  field,
  row,
  notice,
  hiddenBase,
  namedInput,
  namedTextarea,
  namedSelect,
  appendOption,
  copyFallback,
};
