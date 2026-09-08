const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('page recorder includes Error stacks from console, runtime errors, and rejections', () => {
  const source = fs.readFileSync(path.join(__dirname, '../extension/recorder.js'), 'utf8');
  const captured = [];
  const listeners = {};
  class PageEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  class PageXHR {
    addEventListener() {}
    open() {}
    send() {}
  }
  const pageConsole = Object.fromEntries(['log', 'info', 'warn', 'error'].map(level => [level, () => {}]));
  const window = {
    dispatchEvent(event) {
      if (event.type === 'bugdrop:test') captured.push(JSON.parse(event.detail));
      listeners[event.type]?.(event);
      return true;
    },
    addEventListener(type, listener) { listeners[type] = listener; },
    removeEventListener(type, listener) { if (listeners[type] === listener) delete listeners[type]; },
    fetch: async () => ({ ok: true, status: 200 })
  };
  const context = {
    window, console: pageConsole, CustomEvent: PageEvent, XMLHttpRequest: PageXHR,
    history: { pushState() {}, replaceState() {} },
    location: { href: 'https://example.com/' }, Request: class Request {}
  };
  vm.runInNewContext(source + `
    installPageRecorder('bugdrop:test');
    console.error('Save failed', new Error('Database unavailable'));
    window.dispatchEvent(Object.assign(new Event('error'), { message: 'Render crashed', filename: 'https://example.com/app.js', error: new Error('Render crashed') }));
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('Promise failed') }));
  `, { ...context, Event: PageEvent });

  assert.equal(captured.length, 3);
  assert.match(captured[0].message, /ERROR: Save failed Error: Database unavailable/);
  assert.match(captured[0].stack, /Database unavailable/);
  assert.match(captured[1].stack, /Render crashed/);
  assert.match(captured[2].stack, /Promise failed/);
});
