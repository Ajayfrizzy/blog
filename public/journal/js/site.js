/* The Journal note page (shared by every note): contents + reading progress, code copy, share, search, menu. No dependencies. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reduceMQ.matches;
  const status = $('#status');
  const say = (msg) => { status.textContent = msg; setTimeout(() => (status.textContent = ''), 1600); };

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* swap a label with a quick blur, per the Figma "code block" spec (200ms) */
  function swapLabel(el, text) {
    if (reduced() || !el.animate) { el.textContent = text; return; }
    const out = el.animate([{ filter: 'blur(0)', opacity: 1 }, { filter: 'blur(3px)', opacity: 0 }], { duration: 100, easing: 'ease-in' });
    out.onfinish = () => {
      el.textContent = text;
      el.animate([{ filter: 'blur(3px)', opacity: 0 }, { filter: 'blur(0)', opacity: 1 }], { duration: 100, easing: 'ease-out' });
    };
  }

  $$('#article pre').forEach((pre) => {
    const block = document.createElement('figure');
    block.className = 'code';
    const caption = document.createElement('figcaption');
    caption.className = 'code__bar';
    caption.innerHTML = '<span class="code__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="code__title"></span><button class="code__copy" type="button"><span>Copy</span></button>';
    $('.code__title', caption).textContent = pre.dataset.language || 'Code';
    pre.before(block);
    pre.classList.add('code__body');
    block.append(caption, pre);
  });

  /* code blocks: copy without the "$ " prompts */
  $$('.code').forEach((block) => {
    const btn = $('.code__copy', block);
    if (!btn) return; // output panels have nothing to copy
    const label = $('span', btn);
    let t;
    btn.setAttribute('aria-label', 'Copy command');
    btn.addEventListener('click', async () => {
      const text = $('code', block).textContent.split('\n').map((l) => l.replace(/^\$\s/, '')).join('\n').trim();
      const ok = await copyText(text);
      clearTimeout(t);
      btn.classList.toggle('is-done', ok);
      swapLabel(label, ok ? 'Copied' : 'Failed');
      say(ok ? 'Command copied' : 'Copy failed');
      t = setTimeout(() => { btn.classList.remove('is-done'); swapLabel(label, 'Copy'); }, 1600);
    });
  });

  /* screenshots: show a labelled placeholder if an image can't load */
  $$('.shot').forEach((fig) => {
    const img = $('img', fig);
    fig.dataset.label = img.alt;
    const miss = () => fig.classList.add('is-missing');
    if (img.complete && img.naturalWidth === 0 && img.src) miss();
    img.addEventListener('error', miss);
    img.addEventListener('load', () => fig.classList.remove('is-missing'));
  });

  /* image lightbox: click a picture in the article body to view it large; click it again to zoom to full size */
  const pics = $$('#article img').filter((img) => !img.closest('a'));
  if (pics.length) {
    const box = document.createElement('dialog');
    box.className = 'lightbox';
    box.setAttribute('aria-label', 'Image viewer');
    box.tabIndex = -1;
    box.innerHTML = '<div class="lightbox__stage"><img class="lightbox__img" alt="" /></div><p class="lightbox__cap"></p><button class="lightbox__close" type="button" aria-label="Close image">✕</button>';
    document.body.append(box);
    const stage = $('.lightbox__stage', box);
    const big = $('.lightbox__img', box);
    const cap = $('.lightbox__cap', box);

    const canZoom = () => big.naturalWidth > big.clientWidth + 1 || big.naturalHeight > big.clientHeight + 1;

    const setZoom = (on, e) => {
      const r = big.getBoundingClientRect();
      const fx = e ? (e.clientX - r.left) / r.width : 0.5;
      const fy = e ? (e.clientY - r.top) / r.height : 0.5;
      box.classList.toggle('is-zoomed', on);
      if (!on) return;
      /* keep the clicked spot under the cursor */
      stage.scrollLeft = big.offsetLeft + big.offsetWidth * fx - stage.clientWidth / 2;
      stage.scrollTop = big.offsetTop + big.offsetHeight * fy - stage.clientHeight / 2;
    };

    const open = (img) => {
      if (!img.naturalWidth) return;
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      cap.textContent = img.alt;
      cap.hidden = !img.alt;
      box.classList.remove('is-zoomed');
      document.documentElement.classList.add('is-locked');
      box.showModal();
      box.focus();
      box.classList.toggle('can-zoom', canZoom());
      if (reduced() || !big.animate) return;
      /* grow out of the inline image */
      const a = img.getBoundingClientRect();
      const b = big.getBoundingClientRect();
      if (!b.width) return;
      big.animate([
        { transformOrigin: '0 0', transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})` },
        { transformOrigin: '0 0', transform: 'none' },
      ], { duration: 320, easing: 'cubic-bezier(.3, 1.1, .35, 1)' });
    };

    pics.forEach((img) => {
      img.classList.add('is-zoomable');
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', `Enlarge image${img.alt ? `: ${img.alt}` : ''}`);
      img.addEventListener('click', () => open(img));
      img.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        open(img);
      });
    });

    big.addEventListener('click', (e) => {
      e.stopPropagation();
      if (box.classList.contains('is-zoomed')) setZoom(false);
      else if (canZoom()) setZoom(true, e);
      else box.close();
    });
    stage.addEventListener('click', () => box.close());
    box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
    $('.lightbox__close', box).addEventListener('click', () => box.close());
    box.addEventListener('close', () => {
      document.documentElement.classList.remove('is-locked');
      box.classList.remove('is-zoomed');
    });
  }

  if ($('#article')) {
  /* share */
  const pageUrl = $('link[rel="canonical"]')?.href || location.href.split('#')[0];
  const title = $('.note-head__title').textContent.trim();
  const x = $('#share-x'), li = $('#share-li');
  if (/^https?:/.test(pageUrl)) {
    x.href = `https://x.com/intent/post?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(title)}`;
    li.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`;
  }
  const copyLink = $('#copy-link');
  copyLink.addEventListener('click', async () => {
    const ok = await copyText(pageUrl);
    copyLink.firstChild.textContent = ok ? 'Link copied ' : 'Copy failed ';
    say(ok ? 'Link copied' : 'Copy failed');
    setTimeout(() => { copyLink.firstChild.textContent = 'Copy link '; }, 1600);
  });

  }

  if ($('#article')) {
  /* contents: active step, read steps, and sections that aren't written yet */
  const article = $('#article');
  const links = $$('.toc__list a');
  const entries = links.map((a) => ({ a, target: document.getElementById(a.hash.slice(1)) }));
  entries.forEach(({ a, target }) => {
    if (!target) {
      a.classList.add('is-pending');
      a.setAttribute('aria-disabled', 'true');
      a.removeAttribute('href');
      a.title = 'Coming soon';
    }
  });
  const live = entries.filter((e) => e.target);
  const pct = $('#progress-pct');
  const bar = $('#progress-bar');
  const track = $('.progress__track');
  const rail = $('.rail');
  let ticking = false, lastActive = -2;

  /* when the rail scrolls (long contents), keep the active step in view inside it */
  function keepInRail(a) {
    if (!rail || rail.scrollHeight <= rail.clientHeight + 1) return;
    const lr = a.getBoundingClientRect(), rr = rail.getBoundingClientRect();
    if (lr.top < rr.top + 24 || lr.bottom > rr.bottom - 24) {
      rail.scrollTo({ left: 0, top: rail.scrollTop + (lr.top - rr.top) - rr.height / 3, behavior: reduced() ? 'auto' : 'smooth' });
    }
  }

  function update() {
    ticking = false;
    const line = innerHeight * 0.3;
    let active = -1;
    live.forEach((e, i) => { if (e.target.getBoundingClientRect().top <= line) active = i; });
    live.forEach((e, i) => {
      e.a.classList.toggle('is-active', i === active);
      e.a.classList.toggle('is-read', i < active);
      if (i === active) e.a.setAttribute('aria-current', 'location'); else e.a.removeAttribute('aria-current');
    });
    if (active !== lastActive) { lastActive = active; if (active >= 0) keepInRail(live[active].a); }
    const r = article.getBoundingClientRect();
    const done = Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / r.height));
    const n = Math.round(done * 100);
    pct.textContent = `${n}%`;
    bar.style.transform = `scaleX(${done})`;
    track.setAttribute('aria-valuenow', String(n));
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();

  /* scroll to a section. Screenshots load (or fail) while a smooth scroll passes them and push the
     target down, so once the scroll stops, land exactly on it (a few tries, only right after the click). */
  function goTo(target, hash) {
    const started = performance.now();
    let tries = 0;
    const settle = () => {
      if (performance.now() - started > 4000) return;
      const off = target.getBoundingClientRect().top - (parseFloat(getComputedStyle(target).scrollMarginTop) || 0);
      if (Math.abs(off) > 2 && tries++ < 3) {
        target.scrollIntoView({ behavior: 'auto', block: 'start' });
        wait();
      }
    };
    const wait = () => {
      if ('onscrollend' in window) addEventListener('scrollend', settle, { once: true });
      else setTimeout(settle, 700);
    };
    target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    wait();
    try { history.replaceState(null, '', hash); } catch { /* sandboxed frames */ }
  }

  links.forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = a.hash && document.getElementById(a.hash.slice(1));
      if (!target) return;
      goTo(target, a.hash);
      if (tocSmall.matches) setToc(false);
    })
  );
  /* in-article links to other sections behave the same way */
  article.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    const target = a && document.getElementById(a.hash.slice(1));
    if (!target) return;
    e.preventDefault();
    goTo(target, a.hash);
  });

  /* contents fold up on small screens */
  const tocHead = $('.toc__head');
  const tocSmall = matchMedia('(max-width: 959px)');
  const setToc = (open) => tocHead.setAttribute('aria-expanded', String(open));
  const syncToc = () => setToc(!tocSmall.matches);
  tocHead.addEventListener('click', () => { if (tocSmall.matches) setToc(tocHead.getAttribute('aria-expanded') !== 'true'); });
  tocSmall.addEventListener('change', syncToc);
  syncToc();

  }

  /* mobile menu */
  const menuBtn = $('#menu-btn');
  const menu = $('#menu');
  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    if (open && !reduced()) {
      menu.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.25,.8,.3,1)' });
    }
  }
  menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  matchMedia('(min-width: 960px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  /* search: pulled out of the button that opened it */
  const LABELS = { deployment: 'Deployment', database: 'Database', vm: 'Virtual Machines' };
  let notes = [];
  try { notes = JSON.parse($('#notes-index').textContent); } catch { notes = []; }
  const dlg = $('#search'), q = $('#q'), list = $('#results'), empty = $('#search-empty'), form = $('#search-form');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let origin = null, closing = false;

  function render(term) {
    const t = term.trim().toLowerCase();
    const hits = notes.filter((n) => !t || `${n.title} ${n.topic || LABELS[n.cat] || ''} ${n.meta}`.toLowerCase().includes(t));
    list.innerHTML = hits.map((n) => `<li><a href="${esc(n.href)}">
      <span class="result__cat" data-cat="${esc(n.cat)}">${esc(n.topic || LABELS[n.cat] || n.cat)}</span>
      <span class="result__title">${esc(n.title)}</span>
      <span class="result__meta">${esc(n.meta)}</span></a></li>`).join('');
    empty.hidden = hits.length > 0;
    list.hidden = hits.length === 0;
  }
  function genieFrom(from, panel) {
    if (reduced() || !from) return;
    const o = from.getBoundingClientRect(), p = panel.getBoundingClientRect();
    const dx = o.left + o.width / 2 - (p.left + p.width / 2);
    const dy = o.top + o.height / 2 - (p.top + p.height / 2);
    panel.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(.06, .03) rotate(-4deg)`, opacity: 0, filter: 'blur(1px)' },
      { transform: `translate(${dx * 0.42}px, ${dy * 0.42}px) scale(.28, .5) rotate(2deg)`, opacity: 1, offset: 0.45, filter: 'blur(0)' },
      { transform: 'translate(0, 0) scale(1.02, .985) rotate(-.3deg)', offset: 0.82 },
      { transform: 'none' },
    ], { duration: 460, easing: 'cubic-bezier(.3,1.1,.35,1)' });
    from.animate([{ transform: 'scale(1)' }, { transform: 'scale(.82, .9)', offset: 0.3 }, { transform: 'scale(1.08, 1.04)', offset: 0.65 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
  }
  function openSearch(from) {
    if (dlg.open) return;
    origin = from || $('.search-btn');
    q.value = '';
    render('');
    dlg.showModal();
    q.focus();
    genieFrom(origin, $('.search__panel', dlg));
  }
  function closeSearch() {
    if (!dlg.open || closing) return;
    if (reduced()) { dlg.close(); return; }
    closing = true;
    $('.search__panel', dlg).animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97) translateY(-4px)' }], { duration: 140, easing: 'cubic-bezier(.25,.8,.3,1)' })
      .onfinish = () => { dlg.close(); closing = false; };
  }
  $$('[data-open-search]').forEach((b) => b.addEventListener('click', () => openSearch(b)));
  $('[data-close-search]').addEventListener('click', closeSearch);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSearch(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSearch(); });
  dlg.addEventListener('close', () => origin?.focus({ preventScroll: true }));
  q.addEventListener('input', () => render(q.value));
  form.addEventListener('submit', (e) => { e.preventDefault(); const first = $('a', list); if (first) location.href = first.href; });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = $$('a', list);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : i <= 0 ? -1 : i - 1;
    (next === -1 ? q : items[next]).focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') { setMenu(false); menuBtn.focus(); return; }
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || dlg.open) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    openSearch($('.search-btn'));
  });
})();
