(function () {
    'use strict';

    var CONTENT_URL = 'site-content.json?v=20260806a';
    var CHEVRON_SVG = '<svg class="faq-chevron size-5 shrink-0 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" /></svg>';

    function esc(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el && text != null) el.textContent = text;
    }

    function setMeta(name, content) {
        if (!content) return;
        var el = document.querySelector('meta[name="' + name + '"]');
        if (el) el.setAttribute('content', content);
    }

    function setOg(prop, content) {
        if (!content) return;
        var el = document.querySelector('meta[property="' + prop + '"]');
        if (el) el.setAttribute('content', content);
    }

    function applyPhone(phone, display) {
        var tel = 'tel:' + String(phone || '').replace(/\D/g, '');
        var sms = 'sms:' + (display || phone);
        document.querySelectorAll('[data-ju-phone]').forEach(function (el) {
            el.textContent = display || phone;
        });
        document.querySelectorAll('[data-ju-phone-link]').forEach(function (el) {
            el.setAttribute('href', tel);
        });
        document.querySelectorAll('[data-ju-sms-link]').forEach(function (el) {
            el.setAttribute('href', sms);
        });
    }

    function renderCards(cards) {
        var root = document.getElementById('ju-cards');
        if (!root || !cards) return;
        root.innerHTML = cards.map(function (card) {
            var imgWrapClass = card.number === '02'
                ? 'h-56 overflow-hidden'
                : 'relative h-56 overflow-hidden';
            var imgClass = card.number === '02'
                ? 'w-full h-full object-cover group-hover:scale-110 transition-transform duration-700'
                : 'h-full w-full origin-top-left scale-105 object-cover object-[18%_12%] transition-transform duration-700 ease-out group-hover:scale-110';
            return (
                '<div class="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-500 hover:-translate-y-2 hover:scale-[1.02] hover:shadow-2xl">' +
                '<a href="' + esc(card.link) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(card.linkLabel) + '" class="flex min-h-0 flex-1 flex-col text-inherit no-underline focus:outline-none">' +
                '<div class="' + imgWrapClass + '">' +
                '<img src="' + esc(card.image) + '" alt="' + esc(card.imageAlt) + '" class="' + imgClass + '" decoding="async" />' +
                '</div>' +
                '<div class="flex flex-1 flex-col px-8 pb-2 pt-8">' +
                '<div class="text-blue-600 font-black text-4xl mb-4 opacity-50 group-hover:opacity-100 transition-opacity">' + esc(card.number) + '</div>' +
                '<h4 class="text-xl sm:text-2xl font-bold mb-3 text-slate-900 text-balance leading-snug tracking-tight">' + esc(card.title) + '</h4>' +
                '<p class="text-sm sm:text-base text-gray-600 leading-relaxed text-pretty">' + esc(card.body) + '</p>' +
                '</div></a>' +
                '<div class="mt-auto border-t border-gray-100 bg-white px-8 pb-7 pt-5">' +
                '<p class="mb-3 text-xs font-medium text-slate-500 tracking-tight">지금 무료로 상담해 보세요.</p>' +
                '<button type="button" data-consult-open class="inline-flex w-full sm:w-auto items-center justify-center rounded-full border border-blue-600/90 bg-white/90 px-3.5 py-2 text-xs font-bold text-blue-700 shadow-sm transition-all hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">건축 상담 신청</button>' +
                '</div></div>'
            );
        }).join('');
    }

    function renderPortfolio(portfolio) {
        var root = document.getElementById('ju-portfolio-grid');
        if (!root || !portfolio || !portfolio.items) return;
        setText('ju-portfolio-label', portfolio.label);
        setText('ju-portfolio-title', portfolio.title);
        setText('ju-portfolio-subtitle', portfolio.subtitle);
        root.innerHTML = portfolio.items.map(function (item) {
            var title = esc(item.siteName);
            if (item.subtitle) {
                title += '<span class="text-slate-600 font-semibold"> : ' + esc(item.subtitle) + '</span>';
            }
            return (
                '<article class="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-xl">' +
                '<div class="relative aspect-[4/3] overflow-hidden bg-slate-100">' +
                '<img src="' + esc(item.image) + '" alt="' + esc(item.imageAlt || item.siteName) + '" class="h-full w-full object-cover object-[46%_44%] scale-[1.09] origin-center transition-transform duration-700 group-hover:scale-[1.14]" loading="lazy" decoding="async" />' +
                '</div>' +
                '<div class="px-5 py-4 sm:px-6 sm:py-5">' +
                '<h4 class="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">' + title + '</h4>' +
                '</div></article>'
            );
        }).join('');
    }

    function syncFaqJsonLd(items) {
        var el = document.getElementById('ju-faq-jsonld');
        if (!el || !items || !items.length) return;
        var payload = {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: items.map(function (item) {
                return {
                    '@type': 'Question',
                    name: item.question,
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: item.answer
                    }
                };
            })
        };
        el.textContent = JSON.stringify(payload);
    }

    function renderFaq(faq) {
        var root = document.getElementById('ju-faq-list');
        if (!root || !faq || !faq.items) return;
        setText('ju-faq-heading', faq.heading);
        root.innerHTML = faq.items.map(function (item, idx) {
            return (
                '<details class="rounded-2xl border border-gray-200/80 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden ring-1 ring-transparent hover:ring-gray-100/80">' +
                '<summary class="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-5 sm:px-6 sm:py-6 text-left text-[15px] sm:text-base font-semibold leading-snug text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">' +
                '<span class="flex-1 pr-2"><span class="text-blue-600 font-black mr-1.5">Q' + (idx + 1) + '.</span>' + esc(item.question) + '</span>' +
                CHEVRON_SVG +
                '</summary>' +
                '<div class="faq-answer-shell"><div class="faq-answer-inner border-t border-gray-100 bg-slate-50/60">' +
                '<p class="px-5 pb-5 pt-4 sm:px-6 sm:pb-7 sm:pt-5 text-[14px] sm:text-[15px] leading-relaxed text-slate-600 text-pretty">A' + (idx + 1) + '. ' + esc(item.answer) + '</p>' +
                '</div></div></details>'
            );
        }).join('');
        syncFaqJsonLd(faq.items);
    }

    function renderRegions(regions) {
        var nav = document.getElementById('ju-regions-nav');
        if (!nav || !regions || !regions.items) return;
        setText('ju-regions-heading', regions.heading);
        nav.innerHTML = regions.items.map(function (item) {
            return (
                '<a href="' + esc(item.href) + '" class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50/80 px-4 py-2 text-sm font-bold text-blue-800 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors">' +
                esc(item.name) +
                '</a>'
            );
        }).join('');
    }

    function renderProcessSteps(steps) {
        if (!steps) return;
        steps.forEach(function (step) {
            var el = document.querySelector('[data-process-step="' + step.id + '"] .step-title');
            if (el) el.textContent = step.title;
        });
    }

    function renderAbout(about) {
        if (!about) return;
        setText('ju-about-label', about.label);
        var titleEl = document.getElementById('ju-about-title');
        if (titleEl && about.title) titleEl.textContent = about.title;
        setText('ju-about-body', about.body);
        setText('ju-about-cta', about.ctaLabel);
        var img = document.getElementById('ju-about-image');
        if (img) {
            if (about.image) img.src = about.image;
            if (about.imageAlt) img.alt = about.imageAlt;
        }
        var root = document.getElementById('ju-about-points');
        if (root && about.points && about.points.length) {
            root.innerHTML = about.points.map(function (point) {
                return (
                    '<li class="flex gap-4">' +
                    '<span class="mt-1 h-2 w-2 rounded-full bg-[#c4a35a] shrink-0" aria-hidden="true"></span>' +
                    '<div><p class="font-bold text-slate-900">' + esc(point.title) + '</p>' +
                    '<p class="text-sm sm:text-base text-slate-600 mt-1">' + esc(point.body) + '</p></div></li>'
                );
            }).join('');
        }
    }

    function renderPhilosophy(philosophy) {
        if (!philosophy) return;
        setText('ju-philosophy-label', philosophy.label);
        setText('ju-philosophy-title', philosophy.title);
        setText('ju-philosophy-subtitle', philosophy.subtitle);
        setText('ju-philosophy-note', philosophy.note);
        setText('ju-philosophy-cta', philosophy.ctaLabel);
        var root = document.getElementById('ju-philosophy-pillars');
        if (root && philosophy.pillars && philosophy.pillars.length) {
            root.innerHTML = philosophy.pillars.map(function (pillar) {
                return (
                    '<article class="ju-pillar ju-reveal is-visible">' +
                    '<p class="text-[#c4a35a] text-sm font-bold tracking-[0.16em] uppercase">' + esc(pillar.title) + '</p>' +
                    '<h3 class="mt-3 text-xl font-bold">' + esc(pillar.ko) + '</h3>' +
                    '<p class="mt-3 text-slate-300 leading-relaxed text-sm sm:text-base">' + esc(pillar.body) + '</p>' +
                    '</article>'
                );
            }).join('');
        }
    }

    function renderCtaBlock(prefix, block) {
        if (!block) return;
        var titleEl = document.getElementById('ju-' + prefix + '-cta-title');
        if (titleEl && block.title) titleEl.textContent = block.title;
        setText('ju-' + prefix + '-cta-body', block.body);
        setText('ju-' + prefix + '-cta-primary', block.primaryLabel);
        var secondary = document.getElementById('ju-' + prefix + '-cta-secondary');
        if (secondary && block.secondaryLabel) {
            secondary.textContent = block.secondaryLabel;
            if (block.secondaryHref) secondary.setAttribute('href', block.secondaryHref);
        }
    }

    function applyContent(data) {
        var meta = data.meta || {};
        if (meta.title) document.title = meta.title;
        setMeta('description', meta.description);
        setMeta('keywords', meta.keywords);
        setMeta('google-site-verification', meta.googleSiteVerification);
        setOg('og:title', meta.title);
        setOg('og:description', meta.description);
        setOg('og:url', meta.ogUrl);
        setOg('og:image', meta.ogImage || 'https://juhousing.co.kr/images/hero_main.webp');

        var brand = data.brand || {};
        var logo = document.getElementById('ju-brand-logo');
        if (logo && brand.logo) {
            logo.src = brand.logo;
            logo.alt = brand.logoAlt || 'JU HOUSING';
        }

        var hero = data.hero || {};
        setText('ju-hero-badge', hero.badge);
        setText('ju-hero-title', hero.title);
        setText('ju-hero-subtitle', hero.subtitle);
        setText('ju-hero-primary-cta', hero.primaryCta);
        var heroSecondary = document.getElementById('ju-hero-secondary-cta');
        if (heroSecondary) {
            if (hero.secondaryCta) heroSecondary.textContent = hero.secondaryCta;
            if (hero.secondaryHref) heroSecondary.setAttribute('href', hero.secondaryHref);
        }
        var heroImg = document.getElementById('heroMainImage');
        if (heroImg) {
            if (hero.image) heroImg.src = hero.image;
            if (hero.imageAlt) heroImg.alt = hero.imageAlt;
        }

        renderAbout(data.about);
        renderPhilosophy(data.philosophy);

        var comp = data.competencies || {};
        setText('ju-competencies-label', comp.label);
        setText('ju-competencies-title', comp.title);
        renderCards(comp.cards);

        renderPortfolio(data.portfolio);

        var process = data.process || {};
        setText('ju-process-heading', process.heading);
        renderProcessSteps(process.steps);

        renderCtaBlock('mid', data.midCta);
        renderFaq(data.faq);
        renderRegions(data.regions);
        renderCtaBlock('final', data.finalCta);

        var contact = data.contact || {};
        applyPhone(contact.phone, contact.phoneDisplay);
        var taglineEl = document.getElementById('ju-footer-tagline');
        if (taglineEl && contact.footerTagline) {
            taglineEl.innerHTML = esc(contact.footerTagline).replace(/\n/g, '<br>');
        }
        setText('ju-footer-ceo', contact.ceo);
        setText('ju-footer-address', contact.address);
        setText('ju-footer-company', contact.company);
        setText('ju-footer-biznum', contact.bizNum);
        setText('ju-footer-email', contact.email);
        var emailLinkEl = document.getElementById('ju-footer-email-link');
        if (emailLinkEl && contact.email) {
            emailLinkEl.setAttribute('href', 'mailto:' + contact.email);
        }

        var social = data.social || {};
        var map = {
            'ju-social-naver': social.naverBlog,
            'ju-social-instagram': social.instagram,
            'ju-social-kakao': social.kakao,
            'ju-social-youtube': social.youtube
        };
        Object.keys(map).forEach(function (id) {
            var el = document.getElementById(id);
            if (el && map[id]) el.href = map[id];
        });

        document.documentElement.classList.remove('ju-content-pending');
    }

    fetch(CONTENT_URL, { cache: 'no-store' })
        .then(function (res) {
            if (!res.ok) throw new Error('site-content.json load failed');
            return res.json();
        })
        .then(applyContent)
        .catch(function (err) {
            console.warn('[site-render]', err);
            document.documentElement.classList.remove('ju-content-pending');
        });
})();
