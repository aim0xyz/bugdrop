// This function is serialized by chrome.scripting into the page's MAIN world.
function installPageRecorder(channel) {
  let active = true;
  const restorers = [];
  const originalDispatch = window.dispatchEvent.bind(window);
  const EventClass = CustomEvent;
  const primitive = value => typeof value === 'string' ? value.slice(0, 2000)
    : value === null ? 'null' : ['number', 'boolean', 'undefined'].includes(typeof value) ? String(value)
    : '[object omitted]';
  const errorDetails = value => {
    if (!(value instanceof Error)) return null;
    let name = 'Error', message = '', stack = '';
    try { name = String(value.name || 'Error'); } catch {}
    try { message = String(value.message || ''); } catch {}
    try { stack = typeof value.stack === 'string' ? value.stack.slice(0, 12000) : ''; } catch {}
    return { text: name + (message ? ': ' + message : ''), stack };
  };
  const emit = event => {
    if (!active) return;
    try { originalDispatch(new EventClass(channel, { detail: JSON.stringify(event) })); } catch {}
  };
  function patch(object, key, make) {
    const original = object[key];
    const wrapped = make(original);
    object[key] = wrapped;
    restorers.push(() => { if (object[key] === wrapped) object[key] = original; });
  }
  for (const level of ['log', 'info', 'warn', 'error']) {
    patch(console, level, original => function (...args) {
      const values = args.slice(0, 6);
      const details = values.map(errorDetails);
      const errors = details.filter(Boolean);
      emit({
        kind: 'console',
        message: level.toUpperCase() + ': ' + values.map((value, index) => details[index]?.text || primitive(value)).join(' '),
        ...(errors.length ? { stack: errors.map(error => error.stack).filter(Boolean).join('\nCaused by:\n').slice(0, 12000) } : {})
      });
      return Reflect.apply(original, this, args);
    });
  }
  const onError = e => {
    const error = errorDetails(e.error);
    emit({ kind: 'error', message: e.message || error?.text || 'Script/resource error', url: e.filename, ...(error?.stack ? { stack: error.stack } : {}) });
  };
  const onRejection = e => {
    const error = errorDetails(e.reason);
    emit({ kind: 'error', message: 'Unhandled rejection: ' + (error?.text || primitive(e.reason)), ...(error?.stack ? { stack: error.stack } : {}) });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  restorers.push(() => window.removeEventListener('error', onError), () => window.removeEventListener('unhandledrejection', onRejection));
  patch(window, 'fetch', original => async function (...args) {
    let url = '', method = 'GET';
    try {
      const input = args[0];
      url = new URL(input instanceof Request ? input.url : String(input), location.href).href;
      method = args[1]?.method || (input instanceof Request ? input.method : 'GET');
    } catch {}
    try {
      const response = await Reflect.apply(original, this, args);
      if (!response.ok) emit({ kind: 'network', message: 'Fetch returned an unsuccessful response', url, method, status: response.status });
      return response;
    } catch (error) {
      emit({ kind: 'network', message: 'Fetch failed', url, method, status: 0 });
      throw error;
    }
  });
  const xhrData = new WeakMap();
  patch(XMLHttpRequest.prototype, 'open', original => function (method, url, ...rest) {
    try { xhrData.set(this, { method: String(method), url: new URL(String(url), location.href).href }); } catch {}
    return Reflect.apply(original, this, [method, url, ...rest]);
  });
  patch(XMLHttpRequest.prototype, 'send', original => function (...args) {
    this.addEventListener('loadend', () => {
      if (this.status === 0 || this.status >= 400) emit({ kind: 'network', message: 'XHR failed', ...xhrData.get(this), status: this.status });
    }, { once: true });
    return Reflect.apply(original, this, args);
  });
  const route = () => emit({ kind: 'navigation', message: 'Route changed', url: location.href });
  for (const key of ['pushState', 'replaceState']) patch(history, key, original => function (...args) {
    const result = Reflect.apply(original, this, args); route(); return result;
  });
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);
  restorers.push(() => window.removeEventListener('popstate', route), () => window.removeEventListener('hashchange', route));
  function stop() {
    active = false;
    for (const restore of restorers) { try { restore(); } catch {} }
    window.removeEventListener(channel + ':stop', stop);
  }
  window.addEventListener(channel + ':stop', stop, { once: true });
}
