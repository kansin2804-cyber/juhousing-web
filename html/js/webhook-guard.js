(function () {
  'use strict';

  var RATE_PREFIX = 'ju_wg_';
  var DEFAULT_MAX = 5;
  var DEFAULT_WINDOW_MS = 600000; /* 10분 */
  var MIN_SUBMIT_MS = 3000;

  function now() {
    return Date.now();
  }

  function enrichPayload(payload) {
    var out = Object.assign({}, payload || {});
    out._ju_ts = now();
    out._hp_url = '';
    return out;
  }

  function checkRateLimit(key, max, windowMs) {
    max = max || DEFAULT_MAX;
    windowMs = windowMs || DEFAULT_WINDOW_MS;
    try {
      var raw = localStorage.getItem(RATE_PREFIX + key);
      var data = raw ? JSON.parse(raw) : { count: 0, start: now() };
      if (now() - data.start > windowMs) {
        data = { count: 0, start: now() };
      }
      if (data.count >= max) {
        return false;
      }
      data.count += 1;
      localStorage.setItem(RATE_PREFIX + key, JSON.stringify(data));
      return true;
    } catch (e) {
      return true;
    }
  }

  function attachHoneypot(form) {
    if (!form || form.querySelector('[name="_hp_url"]')) return;
    var wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
    wrap.innerHTML =
      '<label for="_hp_url">Leave blank</label>' +
      '<input type="text" name="_hp_url" id="_hp_url" tabindex="-1" autocomplete="off" value="">';
    form.appendChild(wrap);
  }

  function markFormOpen(form) {
    if (!form) return;
    form.dataset.juFormOpenedAt = String(now());
  }

  function validateBeforeSubmit(form, rateKey, options) {
    options = options || {};
    var hp = form.querySelector('[name="_hp_url"]');
    if (hp && String(hp.value || '').trim()) {
      return { ok: false, message: '요청을 처리할 수 없습니다.' };
    }
    var opened = Number(form.dataset.juFormOpenedAt || 0);
    if (opened && now() - opened < (options.minSubmitMs || MIN_SUBMIT_MS)) {
      return { ok: false, message: '잠시 후 다시 시도해 주세요.' };
    }
    if (!checkRateLimit(rateKey, options.max, options.windowMs)) {
      return { ok: false, message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' };
    }
    return { ok: true };
  }

  window.JUWebhookGuard = {
    enrichPayload: enrichPayload,
    attachHoneypot: attachHoneypot,
    markFormOpen: markFormOpen,
    validateBeforeSubmit: validateBeforeSubmit,
    checkRateLimit: checkRateLimit,
  };
})();
