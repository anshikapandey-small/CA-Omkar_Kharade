/*!
 * transition.js — smooth page-to-page transitions + smooth scrolling
 *
 * What it does
 *  1. Page transitions: the page fades in on load; clicking an internal link
 *     fades the page out to the brand colour first, then navigates.
 *  2. Smooth scroll: in-page links (#about, #contact …) glide to their target
 *     with an eased animation and sticky-header offset, even across pages
 *     (index.html#services from a sub-page lands smoothly too).
 *  3. Scroll reveal: content on the sub-pages (headings, paragraphs, lists)
 *     softly fades up as it enters the viewport. The home page keeps the
 *     reveal effects already defined in script.js / styles.css.
 *  4. A thin scroll-progress bar at the top of the page.
 *
 * Usage: add ONE line inside <head> (before the stylesheet is fine):
 *     <script src="transition.js"></script>          (home page)
 *     <script src="../transition.js"></script>       (pages in sub-folders)
 *
 * No dependencies. Respects prefers-reduced-motion. Safe if anything fails:
 * every effect falls back to normal browser behaviour.
 */
(function () {
  'use strict';

  var CONFIG = {
    color: '#0d2740',          // overlay colour (matches theme-color)
    enterMs: 350,              // fade-in after load
    leaveMs: 220,              // fade-out before navigating
    scrollMs: 800,             // in-page anchor scroll duration
    headerGap: 12,             // extra space under the sticky header
    revealSelector: '.prose > *, .sp-hero .container > *, main > .container > *',
    progressBar: true
  };

  var doc = document;
  var root = doc.documentElement;
  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Styles (injected so this is a single drop-in file) ---------- */
  var css = [
    '.tj-overlay{position:fixed;inset:0;z-index:99999;background:' + CONFIG.color + ';',
    'opacity:0;pointer-events:none;transition:opacity ' + CONFIG.enterMs + 'ms cubic-bezier(.22,.61,.36,1)}',
    '.tj-overlay.tj-hide{opacity:0}',
    'html.tj-arrive .tj-overlay:not(.tj-hide):not(.tj-leave){opacity:1}',
    '.tj-overlay.tj-leave{opacity:1;pointer-events:all;transition-duration:' + CONFIG.leaveMs + 'ms}',

    'html.tj-arrive main,html.tj-arrive footer{animation:tj-rise ' + CONFIG.enterMs + 'ms cubic-bezier(.22,.61,.36,1) both}',
    '@keyframes tj-rise{from{opacity:.0;transform:translateY(14px)}to{opacity:1;transform:none}}',

    '.tj-reveal{opacity:0;transform:translateY(24px);',
    'transition:opacity .7s cubic-bezier(.22,.61,.36,1),transform .7s cubic-bezier(.22,.61,.36,1);',
    'transition-delay:var(--tj-d,0ms);will-change:opacity,transform}',
    '.tj-reveal.tj-in{opacity:1;transform:none}',

    '.tj-progress{position:fixed;top:0;left:0;height:3px;width:100%;z-index:100000;',
    'transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,#c9a24b,#e7c978);',
    'pointer-events:none}',

    '@media (prefers-reduced-motion:reduce){',
    '.tj-overlay{display:none}',
    'html.tj-arrive main,html.tj-arrive footer{animation:none}',
    '.tj-reveal{opacity:1;transform:none;transition:none}}'
  ].join('');

  var style = doc.createElement('style');
  style.setAttribute('data-transition-js', '');
  style.textContent = css;
  (doc.head || root).appendChild(style);

  /* ---------- 2. Overlay ----------
   * Only used when moving between pages of this site. A first visit, a visit
   * from Google, or a refresh gets NO overlay and NO fade-in, so nothing
   * delays what Google (and visitors) see first. */
  var arriving = false;
  try {
    arriving = sessionStorage.getItem('tj-nav') === '1';
    sessionStorage.removeItem('tj-nav');
  } catch (e) { /* storage blocked: just skip the effect */ }

  var overlay = null;
  function makeOverlay() {
    if (overlay) return overlay;
    overlay = doc.createElement('div');
    overlay.className = 'tj-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    root.appendChild(overlay);
    return overlay;
  }

  function uncover() {
    if (!overlay) return;
    overlay.classList.remove('tj-leave');
    overlay.classList.add('tj-hide');
    setTimeout(function () {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
    }, CONFIG.enterMs + 100);
  }

  if (arriving && !reduce) {
    root.classList.add('tj-arrive');
    makeOverlay();                                   // starts fully covering
    var done = function () { requestAnimationFrame(function () { requestAnimationFrame(uncover); }); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', done);
    else done();
    setTimeout(uncover, 2000);                       // safety net
  }

  // Back/forward cache restores the old (faded-out) page: uncover it.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) uncover();
  });

  /* ---------- 3. Eased scrolling helpers ---------- */
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function headerOffset() {
    var h = doc.querySelector('.site-header');
    return (h ? h.getBoundingClientRect().height : 0) + CONFIG.headerGap;
  }

  var scrollRaf = 0;
  function smoothScrollTo(targetY, done) {
    cancelAnimationFrame(scrollRaf);
    var startY = window.pageYOffset;
    var maxY = Math.max(0, root.scrollHeight - window.innerHeight);
    targetY = Math.max(0, Math.min(targetY, maxY));
    var dist = targetY - startY;
    if (reduce || Math.abs(dist) < 2) {
      window.scrollTo(0, targetY);
      if (done) done();
      return;
    }
    var dur = Math.min(CONFIG.scrollMs + Math.abs(dist) * 0.15, 1600);
    var t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      window.scrollTo(0, startY + dist * easeInOutCubic(p));
      if (p < 1) scrollRaf = requestAnimationFrame(step);
      else if (done) done();
    }
    scrollRaf = requestAnimationFrame(step);
  }

  // User grabbing the wheel/touch cancels an in-flight animated scroll.
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { cancelAnimationFrame(scrollRaf); },
      { passive: true });
  });

  function scrollToHash(hash, updateUrl) {
    var id;
    try { id = decodeURIComponent(hash.slice(1)); } catch (e) { return false; }
    if (!id) {
      smoothScrollTo(0);
      if (updateUrl) history.pushState(null, '', location.pathname + location.search);
      return true;
    }
    var el = doc.getElementById(id);
    if (!el) return false;
    var y = el.getBoundingClientRect().top + window.pageYOffset - headerOffset();
    smoothScrollTo(y, function () {
      // keep keyboard focus order sensible after the jump
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    });
    if (updateUrl) history.pushState(null, '', hash);
    return true;
  }

  /* ---------- 4. Link handling ---------- */
  function samePage(a, b) {
    return a.origin === b.origin && a.pathname.replace(/index\.html$/, '') ===
      b.pathname.replace(/index\.html$/, '') && a.search === b.search;
  }

  doc.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download') || a.getAttribute('rel') === 'external') return;

    var href = a.getAttribute('href');
    if (!href || /^(mailto:|tel:|sms:|whatsapp:|javascript:)/i.test(href)) return;

    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;                 // external site
    if (/\.(pdf|zip|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|svg|mp4)$/i.test(url.pathname)) return;

    var here = new URL(location.href);

    // Link to a spot on the current page → eased in-page scroll
    if (samePage(url, here) && (url.hash !== '' || href === '#')) {
      if (scrollToHash(url.hash, true)) {
        e.preventDefault();
        // close the mobile menu if it's open
        var nav = doc.querySelector('.nav.open');
        if (nav) {
          nav.classList.remove('open');
          var t = doc.querySelector('.menu-toggle');
          if (t) t.setAttribute('aria-expanded', 'false');
        }
      }
      return;
    }
    if (samePage(url, here)) return;                            // identical URL

    // Different page → fade out, then go
    if (reduce) return;
    e.preventDefault();
    try { sessionStorage.setItem('tj-nav', '1'); } catch (err) { return location.assign(url.href); }
    makeOverlay();
    void overlay.offsetWidth;            // reflow so the fade starts from 0
    overlay.classList.add('tj-leave');
    setTimeout(function () { location.href = url.href; }, CONFIG.leaveMs);
  });

  // Arriving at a page with #hash (e.g. index.html#services): glide to it.
  function initialHash() {
    if (!location.hash || location.hash.length < 2) return;
    var id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }
    var el = doc.getElementById(id);
    if (!el) return;
    // start from the top, then ease down once the page has faded in
    window.scrollTo(0, 0);
    setTimeout(function () { scrollToHash(location.hash, false); },
      reduce ? 0 : CONFIG.enterMs * 0.6);
  }

  window.addEventListener('load', initialHash);
  window.addEventListener('popstate', function () {
    if (location.hash) scrollToHash(location.hash, false);
  });

  /* ---------- 5. Scroll reveal for content that has no effect yet ---------- */
  function initReveal() {
    if (!('IntersectionObserver' in window)) return;
    var skip = '.reveal,.reveal-split,.reveal-grid,.reveal-stagger';
    var els = Array.prototype.filter.call(
      doc.querySelectorAll(CONFIG.revealSelector),
      function (el) {
        return !el.closest(skip) && !el.classList.contains('crumbs') &&
          el.getBoundingClientRect().top > window.innerHeight * 0.9;   // below the fold only
      }
    );
    if (!els.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('tj-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    els.forEach(function (el, i) {
      el.classList.add('tj-reveal');
      el.style.setProperty('--tj-d', (i % 3) * 60 + 'ms');   // light stagger
      io.observe(el);
    });
  }

  /* ---------- 6. Scroll progress bar ---------- */
  function initProgress() {
    if (!CONFIG.progressBar) return;
    var bar = doc.createElement('div');
    bar.className = 'tj-progress';
    bar.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(bar);
    var ticking = false;
    function update() {
      var max = root.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? window.pageYOffset / max : 0) + ')';
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  function init() {
    if (!reduce) initReveal();
    initProgress();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
