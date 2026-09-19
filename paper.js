const methodFrame=document.getElementById('method-frame');
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==methodFrame.contentWindow)return;if(event.data?.type==='sharp-method-height'&&Number.isFinite(event.data.height)&&event.data.height>0)methodFrame.style.height=(Math.ceil(event.data.height)+2)+'px';});

(() => {
  const nav = document.getElementById('section-nav');
  const toggle = document.querySelector('.contents-toggle');
  const entries = [...nav.querySelectorAll('a[href^="#"]')].map(link => ({
    link, target: document.getElementById(link.hash.slice(1))
  })).filter(entry => entry.target);
  const desktop = window.matchMedia('(min-width: 768px)');
  const setOpen = open => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    if (!desktop.matches) {
      setOpen(false);
      const target = document.getElementById(link.hash.slice(1));
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });
  document.addEventListener('click', event => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  desktop.addEventListener('change', () => setOpen(false));

  let scheduled = false;
  const updateActive = () => {
    scheduled = false;
    let active = entries[0];
    const marker = document.querySelector('.page-nav').getBoundingClientRect().bottom + 48;
    for (const entry of entries) {
      if (entry.target.getBoundingClientRect().top <= marker) active = entry;
    }
    for (const entry of entries) {
      if (entry === active) entry.link.setAttribute('aria-current', 'location');
      else entry.link.removeAttribute('aria-current');
    }
  };
  const scheduleUpdate = () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateActive); }
  };
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('hashchange', scheduleUpdate);
  window.addEventListener('load', scheduleUpdate);
  // Images and the interactive iframe can change section positions after loading.
  new ResizeObserver(scheduleUpdate).observe(document.querySelector('main'));
  updateActive();
})();
