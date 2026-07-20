(function () {
  'use strict';

  var IFRAME_SRC = 'consult.html?embed=1&source=website_diagnosis';
  var backdrop = document.getElementById('costDiagnosisModalBackdrop');
  var iframe = document.getElementById('costDiagnosisIframe');
  var closeBtn = document.getElementById('costDiagnosisModalClose');

  if (!backdrop || !iframe) return;

  function openModal() {
    if (!iframe.getAttribute('src') || iframe.getAttribute('src') === 'about:blank') {
      iframe.setAttribute('src', IFRAME_SRC);
    }
    backdrop.classList.remove('is-hidden');
    backdrop.removeAttribute('hidden');
    backdrop.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    backdrop.classList.add('is-hidden');
    backdrop.setAttribute('hidden', '');
    backdrop.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
  }

  document.addEventListener('click', function (ev) {
    var trigger = ev.target.closest('[data-cost-diagnosis-open]');
    if (!trigger) return;
    ev.preventDefault();
    openModal();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  backdrop.addEventListener('click', function (ev) {
    if (ev.target === backdrop) closeModal();
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || backdrop.classList.contains('is-hidden')) return;
    closeModal();
  });

  if (new URLSearchParams(window.location.search).get('diagnosis') === '1') {
    openModal();
    if (window.history.replaceState) {
      history.replaceState(null, '', window.location.pathname + (window.location.hash || ''));
    }
  }

  window.JUCostDiagnosis = { open: openModal, close: closeModal };
})();
