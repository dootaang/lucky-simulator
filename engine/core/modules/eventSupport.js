'use strict';

function scopedEvent(handler) {
  if (typeof handler !== 'function') throw new TypeError('event_handler_required');
  return (context) => {
    const type = context.event && context.event.id;
    const next = context.state;
    const log = [];
    const fail = (reason, detail) => ({ state: context.state, log: [{ ok: false, event: type, reason, detail }] });
    const ok = (entry) => {
      log.push(Object.assign({ ok: true, event: type }, entry || {}));
      return { state: next, log };
    };
    return handler(Object.assign({}, context, { state: next, log, ok, fail }));
  };
}

module.exports = { scopedEvent };
