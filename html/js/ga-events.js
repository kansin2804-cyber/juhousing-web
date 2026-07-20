(function () {
  'use strict';

  function trackCta(ctaId, extra) {
    if (typeof window.juTrackCta === 'function') {
      window.juTrackCta(ctaId, extra);
    }
  }

  document.addEventListener('click', function (ev) {
    var target = ev.target;

    if (target.closest('[data-consult-open]')) {
      trackCta('consult_open', { cta_label: '건축 상담 신청' });
      return;
    }

    if (target.closest('[data-cost-diagnosis-open]')) {
      trackCta('diagnosis_open', { cta_label: '3분 자가 진단' });
      return;
    }

    if (
      target.closest('#juChatWidgetLauncher') ||
      target.closest('[data-ju-chat-open]') ||
      target.closest('[data-ju-sms-link]')
    ) {
      trackCta('chat_open', { cta_label: 'AI 상담 챗봇' });
      return;
    }

    var estimateLink = target.closest('a[href*="estimate.html"]');
    if (estimateLink) {
      trackCta('estimate_link', { cta_label: estimateLink.textContent.trim().slice(0, 40) });
      return;
    }

    var phoneLink = target.closest('a[href^="tel:"]');
    if (phoneLink) {
      trackCta('phone_call', { cta_label: '전화 상담' });
    }
  });

  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form || form.tagName !== 'FORM') return;

    if (form.id === 'consult-form' && document.getElementById('consultModalBackdrop')) {
      trackCta('consult_submit', { source: 'website_modal' });
      return;
    }

    if (form.id === 'consult-form' && location.pathname.indexOf('consult') !== -1) {
      trackCta('consult_submit', { source: 'blog_consult_page' });
      return;
    }

    if (form.id === 'calc-form') {
      trackCta('estimate_calc_submit', { source: 'estimate_page' });
    }
  });

  window.juTrackConsultSuccess = function (source) {
    trackCta('consult_submit_success', { source: source || 'unknown' });
  };

  window.juTrackChatMessage = function () {
    if (typeof window.juTrackEvent === 'function') {
      window.juTrackEvent('ju_chat_message', { page_path: location.pathname || '/' });
    }
  };

  window.juTrackChatIntakeSuccess = function () {
    trackCta('chat_intake_success', { source: 'website_chatbot' });
  };
})();
