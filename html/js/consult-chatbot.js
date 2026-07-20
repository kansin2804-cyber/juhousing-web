(function () {
  'use strict';

  /* n8n Production Webhook — see /js/ju-webhooks.js */
  var wh = window.JUWebhooks || {};
  var CHAT_URL = wh.consultChat;
  var CONSULT_URL = wh.blogConsult;
  var SMS_HREF = 'sms:010-2951-0431';
  var PHONE_DISPLAY = '010-2951-0431';

  var STEPS = [
    { key: '성함', label: '성함 또는 업체명을 알려주세요.', field: 'name', required: true },
    { key: '연락처', label: '연락 가능한 휴대폰 번호를 입력해 주세요.', field: 'contact', required: true },
    { key: '이메일', label: '이메일 주소를 입력해 주세요.', field: 'email', required: true },
    { key: '부지위치', label: '예정 부지나 희망 지역이 있으면 알려주세요. (없으면 "미정")', field: 'location', required: false },
    { key: '예산', label: '예상 예산 범위가 있으면 알려주세요. (없으면 "협의")', field: 'budget', required: false },
    { key: '문의내용', label: '문의하실 내용을 자유롭게 적어 주세요.', field: 'requirements', required: false },
  ];

  var state = {
    open: false,
    mode: 'chat',
    stepIndex: 0,
    collected: {},
    messages: [],
    busy: false,
  };

  var root, launcher, backdrop, panel, messagesEl, chipsEl, inputEl, sendBtn;

  function esc(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildUi() {
    if (document.getElementById('juChatWidget')) return;

    root = document.createElement('div');
    root.id = 'juChatWidget';
    root.className = 'ju-chat-widget';
    root.innerHTML =
      '<button type="button" class="ju-chat-widget__launcher" id="juChatWidgetLauncher" aria-label="제이유 하우징 시공 상담 AI 열기" title="24/7 AI 상담">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8.5z" />' +
      '<line x1="9" x2="15" y1="10.5" y2="10.5" /><line x1="9" x2="13" y1="14" y2="14" />' +
      '</svg></button>' +
      '<div class="ju-chat-widget__backdrop" id="juChatWidgetBackdrop" aria-hidden="true"></div>' +
      '<div class="ju-chat-widget__panel" id="juChatWidgetPanel" role="dialog" aria-modal="true" aria-labelledby="juChatWidgetTitle" aria-hidden="true">' +
      '<div class="ju-chat-widget__header">' +
      '<div class="ju-chat-widget__avatar" aria-hidden="true">AI</div>' +
      '<div><div class="ju-chat-widget__title" id="juChatWidgetTitle">제이유 하우징 시공 상담 AI</div>' +
      '<div class="ju-chat-widget__subtitle">24/7 실시간 안내 · 주실장</div></div>' +
      '<button type="button" class="ju-chat-widget__close" id="juChatWidgetClose" aria-label="채팅 닫기">✕</button>' +
      '</div>' +
      '<div class="ju-chat-widget__messages" id="juChatWidgetMessages"></div>' +
      '<div class="ju-chat-widget__chips" id="juChatWidgetChips"></div>' +
      '<div class="ju-chat-widget__footer">' +
      '<div class="ju-chat-widget__input-row">' +
      '<textarea id="juChatWidgetInput" class="ju-chat-widget__input" rows="1" placeholder="메시지를 입력하세요…" maxlength="800"></textarea>' +
      '<button type="button" id="juChatWidgetSend" class="ju-chat-widget__send">전송</button>' +
      '</div>' +
      '<div class="ju-chat-widget__meta">' +
      '<a href="' + SMS_HREF + '" id="juChatWidgetSmsLink">문자 앱으로 보내기</a>' +
      '<span>전화 ' + PHONE_DISPLAY + '</span>' +
      '</div></div></div>';

    document.body.appendChild(root);

    launcher = document.getElementById('juChatWidgetLauncher');
    backdrop = document.getElementById('juChatWidgetBackdrop');
    panel = document.getElementById('juChatWidgetPanel');
    messagesEl = document.getElementById('juChatWidgetMessages');
    chipsEl = document.getElementById('juChatWidgetChips');
    inputEl = document.getElementById('juChatWidgetInput');
    sendBtn = document.getElementById('juChatWidgetSend');

    launcher.addEventListener('click', openChat);
    document.getElementById('juChatWidgetClose').addEventListener('click', closeChat);
    backdrop.addEventListener('click', closeChat);
    sendBtn.addEventListener('click', onSend);
    inputEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        onSend();
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && state.open) closeChat();
    });
  }

  function scrollMessages() {
    if (!messagesEl) return;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addBubble(role, text) {
    var div = document.createElement('div');
    div.className = 'ju-chat-widget__bubble ju-chat-widget__bubble--' + role;
    div.innerHTML = esc(text).replace(/\n/g, '<br>');
    messagesEl.appendChild(div);
    scrollMessages();
    if (role === 'user' || role === 'bot') {
      state.messages.push({ role: role === 'bot' ? 'assistant' : 'user', content: text });
      if (state.messages.length > 20) state.messages = state.messages.slice(-20);
    }
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'ju-chat-widget__typing';
    el.id = 'juChatWidgetTyping';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    scrollMessages();
  }

  function hideTyping() {
    var el = document.getElementById('juChatWidgetTyping');
    if (el) el.remove();
  }

  function setChips(items) {
    chipsEl.innerHTML = '';
    (items || []).forEach(function (label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ju-chat-widget__chip';
      btn.textContent = label;
      btn.addEventListener('click', function () {
        if (label === '상담 접수하기') {
          startIntake();
          return;
        }
        if (label === '다시 질문하기') {
          state.mode = 'chat';
          renderDefaultChips();
          return;
        }
        inputEl.value = label;
        onSend();
      });
      chipsEl.appendChild(btn);
    });
  }

  function renderDefaultChips() {
    setChips(['상담 접수하기', '비용이 궁금해요', '공기는 얼마나 걸리나요', '경량 목조가 뭔가요']);
  }

  function openChat() {
    buildUi();
    state.open = true;
    panel.classList.add('ju-chat-widget__panel--open');
    panel.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('ju-chat-widget__backdrop--open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    if (messagesEl.childElementCount === 0) {
      addBubble('bot', '안녕하세요, 제이유 하우징 주실장입니다. 목조주택 시공·공정·비용 궁금한 점을 편하게 물어보세요.');
      renderDefaultChips();
    }
    inputEl.focus();
  }

  function closeChat() {
    if (!panel) return;
    state.open = false;
    panel.classList.remove('ju-chat-widget__panel--open');
    panel.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('ju-chat-widget__backdrop--open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
  }

  function startIntake() {
    state.mode = 'intake';
    state.stepIndex = 0;
    state.collected = {};
    setChips([]);
    addBubble('system', '상담 접수를 시작합니다. 몇 가지만 여쭤볼게요.');
    askStep();
  }

  function askStep() {
    var step = STEPS[state.stepIndex];
    if (!step) {
      submitIntake();
      return;
    }
    addBubble('bot', step.label);
    inputEl.placeholder = step.label;
    inputEl.focus();
  }

  function normalizePhone(v) {
    return String(v || '').replace(/\s/g, '').trim();
  }

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function handleIntakeAnswer(text) {
    var step = STEPS[state.stepIndex];
    if (!step) return;

    var value = text.trim();
    if (!value && step.required) {
      addBubble('bot', '필수 항목입니다. 다시 입력해 주세요.');
      return;
    }
    if (!value && !step.required) {
      value = step.field === 'location' ? '미정' : step.field === 'budget' ? '협의' : '(미입력)';
    }
    if (step.field === 'contact' && normalizePhone(value).length < 9) {
      addBubble('bot', '연락처 형식을 확인해 주세요. 예: 010-0000-0000');
      return;
    }
    if (step.field === 'email' && !isEmail(value)) {
      addBubble('bot', '이메일 형식을 확인해 주세요.');
      return;
    }

    state.collected[step.key] = value;
    state.stepIndex += 1;
    askStep();
  }

  async function submitIntake() {
    if (window.JUWebhookGuard && !window.JUWebhookGuard.checkRateLimit('chat_intake', 3, 600000)) {
      addBubble('bot', '요청이 너무 많습니다. 잠시 후 다시 시도하거나 전화 ' + PHONE_DISPLAY + ' 로 연락해 주세요.');
      setChips(['다시 질문하기']);
      state.mode = 'chat';
      return;
    }

    state.busy = true;
    sendBtn.disabled = true;
    addBubble('system', '접수 중입니다…');

    var transcript = state.messages
      .filter(function (m) {
        return m.role === 'user' || m.role === 'assistant';
      })
      .map(function (m) {
        return (m.role === 'user' ? '방문자' : '주실장') + ': ' + m.content;
      })
      .join('\n');

    var payload = {
      성함: state.collected['성함'] || '',
      연락처: state.collected['연락처'] || '',
      이메일: state.collected['이메일'] || '',
      부지위치: state.collected['부지위치'] || '미정',
      평수: '30',
      공사종류: '신축 (목조 주택)',
      공사시기: '미정',
      예산: state.collected['예산'] || '협의',
      문의내용:
        (state.collected['문의내용'] || '') +
        (transcript ? '\n\n[챗봇 대화]\n' + transcript.slice(0, 3500) : ''),
      유입경로: 'website_chatbot',
    };
    if (window.JUWebhookGuard) {
      payload = window.JUWebhookGuard.enrichPayload(payload);
    }

    try {
      var res = await fetch(CONSULT_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json().catch(function () { return {}; });
      if (typeof window.juTrackChatIntakeSuccess === 'function') {
        window.juTrackChatIntakeSuccess();
      }
      var emailHint =
        data.email_status === 'queued'
          ? ' 이메일로 1차 가이드(참고용) 발송 중입니다.'
          : '';
      addBubble('bot', '상담 접수가 완료되었습니다.' + emailHint + ' 1~2영업일 내 연락드리겠습니다. 감사합니다!');
      setChips(['다시 질문하기']);
      state.mode = 'chat';
    } catch (err) {
      addBubble('bot', '접수 전송에 실패했습니다. 전화 ' + PHONE_DISPLAY + ' 로 연락 주시거나 잠시 후 다시 시도해 주세요.');
      setChips(['상담 접수하기']);
    } finally {
      state.busy = false;
      sendBtn.disabled = false;
      inputEl.placeholder = '메시지를 입력하세요…';
    }
  }

  async function fetchBotReply(userText) {
    showTyping();
    try {
      var payload = {
        message: userText,
        messages: state.messages.slice(0, -1),
      };
      if (window.JUWebhookGuard) {
        payload = window.JUWebhookGuard.enrichPayload(payload);
      }
      var res = await fetch(CHAT_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
      });
      hideTyping();
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      return String(data.reply || data.message || '').trim() || '답변을 받지 못했습니다.';
    } catch (err) {
      hideTyping();
      if (/비용|예산|가격/.test(userText)) {
        return '평당·마감·부지에 따라 달라 정확한 단가는 상담 시 항목별로 안내드립니다. 상담 접수하기를 눌러 주시면 연락드릴게요.';
      }
      if (/공기|기간|일정/.test(userText)) {
        return '규모와 인허가에 따라 다르지만, 보통 몇 개월 단위로 일정을 잡습니다. 구체 일정은 상담 후 공유드립니다.';
      }
      return '연결이 잠시 불안정합니다. 상담 접수하기로 연락처를 남겨 주시거나 전화 ' + PHONE_DISPLAY + ' 로 문의해 주세요.';
    }
  }

  async function onSend() {
    if (state.busy) return;
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    addBubble('user', text);
    if (state.mode === 'chat' && typeof window.juTrackChatMessage === 'function') {
      window.juTrackChatMessage();
    }
    state.busy = true;
    sendBtn.disabled = true;

    if (state.mode === 'intake') {
      handleIntakeAnswer(text);
      state.busy = false;
      sendBtn.disabled = false;
      return;
    }

    var reply = await fetchBotReply(text);
    addBubble('bot', reply);
    if (/상담|접수|연락처|남겨/.test(reply)) {
      setChips(['상담 접수하기', '비용이 궁금해요', '공기는 얼마나 걸리나요']);
    }
    state.busy = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }

  function hijackChatTriggers() {
    document.querySelectorAll('[data-ju-chat-open]').forEach(function (el) {
      if (el.getAttribute('data-ju-chat-bound') === '1') return;
      if (el.id === 'juChatWidgetLauncher') return;
      el.setAttribute('data-ju-chat-bound', '1');
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        openChat();
      });
    });
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-ju-chat-open]');
    if (t) {
      ev.preventDefault();
      openChat();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      buildUi();
      hijackChatTriggers();
    });
  } else {
    buildUi();
    hijackChatTriggers();
  }

  window.JUConsultChat = { open: openChat, close: closeChat };
})();
