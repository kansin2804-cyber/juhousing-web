(function () {
  'use strict';

  function trackCta(ctaId, extra) {
    if (typeof window.juTrackCta === 'function') {
      window.juTrackCta(ctaId, extra);
    }
  }

  function placementFrom(el) {
    if (!el) return 'unknown';
    var node = el.closest('[data-cta-placement]');
    if (node && node.getAttribute('data-cta-placement')) {
      return node.getAttribute('data-cta-placement');
    }
    if (el.id) return el.id;
    return 'unknown';
  }

  function labelFrom(el, fallback) {
    if (!el) return fallback || '';
    var text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 40) || fallback || '';
  }

  document.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!target || !target.closest) return;

    var philosophyCta = target.closest('[data-cta-event="philosophy_scroll"]');
    if (philosophyCta) {
      trackCta('philosophy_scroll', {
        cta_placement: placementFrom(philosophyCta),
        cta_label: labelFrom(philosophyCta, '시공 철학 보기')
      });
      return;
    }

    var consultOpen = target.closest('[data-consult-open]');
    if (consultOpen) {
      trackCta('consult_open', {
        cta_placement: placementFrom(consultOpen),
        cta_label: labelFrom(consultOpen, '건축 상담 신청')
      });
      return;
    }

    if (target.closest('[data-cost-diagnosis-open]')) {
      var diagnosis = target.closest('[data-cost-diagnosis-open]');
      trackCta('diagnosis_open', {
        cta_placement: placementFrom(diagnosis),
        cta_label: '3분 자가 진단'
      });
      return;
    }

    if (
      target.closest('#juChatWidgetLauncher') ||
      target.closest('[data-ju-chat-open]') ||
      target.closest('[data-ju-sms-link]')
    ) {
      var chatEl =
        target.closest('#juChatWidgetLauncher') ||
        target.closest('[data-ju-chat-open]') ||
        target.closest('[data-ju-sms-link]');
      trackCta('chat_open', {
        cta_placement: placementFrom(chatEl),
        cta_label: 'AI 상담 챗봇'
      });
      return;
    }

    var estimateLink = target.closest('a[href*="estimate.html"]');
    if (estimateLink) {
      trackCta('estimate_link', {
        cta_placement: placementFrom(estimateLink),
        cta_label: labelFrom(estimateLink, '예산 가이드')
      });
      return;
    }

    var phoneLink = target.closest('a[href^="tel:"]');
    if (phoneLink) {
      trackCta('phone_call', {
        cta_placement: placementFrom(phoneLink),
        cta_label: labelFrom(phoneLink, '전화 상담')
      });
    }
  });

  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form || form.tagName !== 'FORM') return;

    if (form.id === 'consult-form' && document.getElementById('consultModalBackdrop')) {
      trackCta('consult_submit', {
        source: 'website_modal',
        cta_placement: window.__juLastConsultPlacement || 'modal'
      });
      return;
    }

    if (form.id === 'consult-form' && location.pathname.indexOf('consult') !== -1) {
      trackCta('consult_submit', { source: 'blog_consult_page', cta_placement: 'consult_page' });
      return;
    }

    if (form.id === 'calc-form') {
      trackCta('estimate_calc_submit', { source: 'estimate_page', cta_placement: 'estimate' });
    }
  });

  // Remember which CTA opened the modal so submit can be attributed.
  document.addEventListener('click', function (ev) {
    var openBtn = ev.target && ev.target.closest && ev.target.closest('[data-consult-open]');
    if (openBtn) {
      window.__juLastConsultPlacement = placementFrom(openBtn);
    }
  }, true);

  window.juTrackConsultSuccess = function (source) {
    trackCta('consult_submit_success', {
      source: source || 'unknown',
      cta_placement: window.__juLastConsultPlacement || 'unknown'
    });
  };

  window.juTrackChatMessage = function () {
    if (typeof window.juTrackEvent === 'function') {
      window.juTrackEvent('ju_chat_message', { page_path: location.pathname || '/' });
    }
  };

  window.juTrackChatIntakeSuccess = function () {
    trackCta('chat_intake_success', { source: 'website_chatbot', cta_placement: 'chatbot' });
  };
})();
