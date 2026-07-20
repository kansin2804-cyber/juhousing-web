(function () {
  'use strict';

  var toggle = document.getElementById('juMobileNavToggle');
  var nav = document.getElementById('juMobileNav');
  var backdrop = document.getElementById('juMobileNavBackdrop');
  if (!toggle || !nav) return;

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    nav.classList.toggle('mobile-nav--open', open);
    nav.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (backdrop) {
      backdrop.classList.toggle('mobile-nav-backdrop--open', open);
      backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }

  toggle.addEventListener('click', function () {
    setOpen(!nav.classList.contains('mobile-nav--open'));
  });

  if (backdrop) {
    backdrop.addEventListener('click', function () {
      setOpen(false);
    });
  }

  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      setOpen(false);
    });
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && nav.classList.contains('mobile-nav--open')) {
      setOpen(false);
    }
  });
})();
