/* A figure on a menu - an opacity - slid by dragging it sideways, or clicked
   and typed over: Enter or leaving it keeps it, Escape lets it go. */

const clampN = (x, a, b) => Math.min(b, Math.max(a, x));

/** every [data-opk] under host: get(k) and set(k, v) in 0..1, shown as a percentage */
export function wireOpacity(host, get, set) {
  const show = (el, v) => { el.textContent = Math.round(v * 100) + '%'; };
  host.addEventListener('pointerdown', e => {
    const el = e.target.closest && e.target.closest('[data-opk]');
    if (!el || e.button !== 0 || el.querySelector('input')) return;
    e.preventDefault(); e.stopPropagation();
    const k = el.dataset.opk, x0 = e.clientX, v0 = get(k);
    let moved = false;
    const move = ev => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      const v = clampN(Math.round(v0 * 100 + dx / 2) / 100, 0, 1);
      set(k, v); show(el, v);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      if (!moved) type(el, k);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  host.addEventListener('keydown', e => {
    const el = e.target.closest && e.target.closest('[data-opk]');
    if (el && !el.querySelector('input') && e.key === 'Enter') { e.preventDefault(); type(el, el.dataset.opk); }
  });
  function type(el, k) {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.inputMode = 'numeric'; inp.value = String(Math.round(get(k) * 100));
    el.textContent = ''; el.appendChild(inp); inp.focus(); inp.select();
    let done = false;
    const end = keep => {
      if (done) return; done = true;
      const n = parseFloat(inp.value);
      if (keep && isFinite(n)) set(k, clampN(n / 100, 0, 1));
      show(el, get(k));
    };
    inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') end(true); if (ev.key === 'Escape') end(false); });
    inp.addEventListener('blur', () => end(true));
    inp.addEventListener('pointerdown', ev => ev.stopPropagation());
  }
}
