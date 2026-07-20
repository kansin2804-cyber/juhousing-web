(function () {
  'use strict';

  /** Single source of truth for n8n production webhooks (JU website). */
  var BASE = 'https://n8n.juhousing.co.kr/webhook';

  var PATHS = {
    consultChat: 'consult-chat',
    blogConsult: 'blog-consult',
    estimateGuide: 'estimate-guide',
  };

  function url(path) {
    return BASE + '/' + path;
  }

  window.JUWebhooks = {
    base: BASE,
    paths: PATHS,
    url: url,
    consultChat: url(PATHS.consultChat),
    blogConsult: url(PATHS.blogConsult),
    estimateGuide: url(PATHS.estimateGuide),
  };
})();
