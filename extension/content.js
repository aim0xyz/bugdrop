function installContentRecorder(channel) {
  globalThis.__bugdropStop?.();
  let active = true, count = 0;
  const send = event => {
    if (!active || count++ >= 310) return;
    const clean = BugDropCore.normalizeEvent(event, count, Date.now());
    if (clean) chrome.runtime.sendMessage({ type: 'EVENT', channel, event: clean }).catch(() => stop());
  };
  const bridge = e => {
    if (typeof e.detail !== 'string' || e.detail.length > 18000) return;
    try { send(JSON.parse(e.detail)); } catch {}
  };
  const targetName = el => {
    // Never read input values, field names/IDs, editable contents, or form text.
    if (el.matches('input,textarea,select') || el.closest('[contenteditable]:not([contenteditable="false"])')) return 'form field (value omitted)';
    const text = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    return el.tagName.toLowerCase() + (text ? ' “' + text + '”' : '');
  };
  const click = e => {
    if (!e.isTrusted || !(e.target instanceof Element)) return;
    const el = e.target.closest('button,a,input,select,textarea,[role="button"],[contenteditable]');
    if (el) send({ kind: 'click', message: 'Clicked ' + targetName(el) });
  };
  const change = e => {
    if (!e.isTrusted || !(e.target instanceof Element)) return;
    if (e.target.matches('input,textarea,select')) send({ kind: 'input', message: 'Changed a form field (value omitted)' });
  };
  const onMessage = (message, sender, respond) => {
    if (message.type === 'STOP_CAPTURE') { stop(); respond({ ok: true }); }
  };
  function stop() {
    if (!active) return;
    active = false;
    window.dispatchEvent(new CustomEvent(channel + ':stop'));
    window.removeEventListener(channel, bridge);
    document.removeEventListener('click', click, true);
    document.removeEventListener('change', change, true);
    chrome.runtime.onMessage.removeListener(onMessage);
    delete globalThis.__bugdropStop;
  }
  window.addEventListener(channel, bridge);
  document.addEventListener('click', click, true);
  document.addEventListener('change', change, true);
  chrome.runtime.onMessage.addListener(onMessage);
  globalThis.__bugdropStop = stop;
  return { width: innerWidth, height: innerHeight, language: navigator.language, userAgent: navigator.userAgent };
}
