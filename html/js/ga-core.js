(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-X1X65GX1TP';

  window.juGaMeasurementId = MEASUREMENT_ID;

  window.juTrackEvent = function (eventName, params) {
    if (typeof gtag !== 'function') return;
    gtag('event', eventName, params || {});
  };

  window.juTrackCta = function (ctaId, extra) {
    var payload = { cta_id: ctaId, page_path: location.pathname || '/' };
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (key) {
        payload[key] = extra[key];
      });
    }
    window.juTrackEvent('ju_cta_click', payload);
  };

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, { send_page_view: true });
})();
