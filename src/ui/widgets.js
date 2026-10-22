/* The small windows that hang off the drawings - the picked window's or
   device's, the selected storey's, the site boundary's - and the one rule
   they all keep, the rule the views' own bars keep: on the screen while any
   of their view is, under its bar, and gone with it once it is scrolled past.

   One opens beside what it belongs to and follows it as the drawing moves -
   unless it is one that stays put once opened, so that the same button can be
   pressed again and again. Moved by its title, it keeps its place against its
   view; closed, it forgets that place, and opens beside its thing again. */

const ALL = [];
const clampN = (x, a, b) => Math.min(b, Math.max(a, x));

/** a small window: { el, at, st: 'open' | 'min' | 'closed', off, anchor, stay } */
export function makeWidget(cls, hooks = {}) {
  const el = document.createElement('div');
  el.className = 'devpop' + (cls ? ' ' + cls : ''); el.hidden = true;
  document.body.appendChild(el);
  const w = { el, at: null, st: 'closed', off: null, anchor: null, stay: !!hooks.stay, html: '', hooks };
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const act = e.target.closest('[data-popact]');
    if (act) {
      e.preventDefault();
      if (act.dataset.popact === 'close') closeWidget(w);
      else if (act.dataset.popact === 'more') { w.more = !w.more; w.el.style.width = ''; }
      else {
        w.st = w.st === 'min' ? 'open' : 'min';
        // folded, it keeps its width, so its buttons stay under the pointer
        el.style.width = w.st === 'min' ? el.offsetWidth + 'px' : '';
      }
      if (hooks.change) hooks.change(w);
      return;
    }
    if (!e.target.closest('.dvhd') || e.target.closest('input, select, button')) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, l0 = el.offsetLeft, t0 = el.offsetTop;
    const move = ev => {
      const x = clampN(l0 + ev.clientX - x0, 4, innerWidth - el.offsetWidth - 4), y = clampN(t0 + ev.clientY - y0, 4, innerHeight - el.offsetHeight - 4);
      el.style.left = x + 'px'; el.style.top = y + 'px';
      const vr = w.at && w.at.el.getBoundingClientRect();
      if (vr) w.off = [x - vr.left, y - vr.top];
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  ALL.push(w);
  return w;
}
/** opened afresh beside what it belongs to */
export function openWidget(w, inst) { w.at = inst || w.at; w.st = 'open'; w.off = null; w.el.style.width = ''; }
/** closed: it forgets where it was moved to */
export function closeWidget(w) { w.st = 'closed'; w.off = null; w.el.hidden = true; w.el.style.width = ''; }
export function hideWidget(w) { w.el.hidden = true; }

/** drawn: its content, and where it hangs - anchor { x, y } in its view's drawing, and the side it opens to */
export function showWidget(w, html, anchor) {
  if (w.st === 'closed' || !w.at) { w.el.hidden = true; return; }
  if (w.html !== html) { w.el.innerHTML = html; w.html = html; }
  w.el.classList.toggle('min', w.st === 'min');
  w.anchor = anchor || w.anchor;
  w.el.hidden = false;
  placeWidget(w);
}

/** the anchor on the screen */
function anchorAt(w) {
  const a = w.anchor, svgEl = a && w.at.host.querySelector(':scope > svg'), ctm = svgEl && svgEl.getScreenCTM && svgEl.getScreenCTM();
  if (!ctm) return null;
  const pt = svgEl.createSVGPoint(); pt.x = a.x; pt.y = a.y;
  return pt.matrixTransform(ctm);
}
/** what it controls, on the screen: { l, t, r, b } */
function boxAt(w) {
  const b = w.anchor && w.anchor.box, svgEl = b && w.at.host.querySelector(':scope > svg'), ctm = svgEl && svgEl.getScreenCTM && svgEl.getScreenCTM();
  if (!ctm) return null;
  const q = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(([x, y]) => { const p = svgEl.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(ctm); });
  return { l: Math.min(...q.map(p => p.x)), r: Math.max(...q.map(p => p.x)), t: Math.min(...q.map(p => p.y)), b: Math.max(...q.map(p => p.y)) };
}
/* Where it stands: where it was moved to, or beside what it controls - to its
   side, or under or over it, clear of it and of the other pop-overs open, out
   past its own view if that is what it takes - then kept on the screen while
   its view is. Over a view full screen that is not its own, it is not shown. */
export function placeWidget(w) {
  if (w.el.hidden || !w.at || !w.at.el.isConnected) return;
  const el = w.el, full = document.querySelector('.view.full');
  el.style.visibility = full && full !== w.at.el ? 'hidden' : '';
  if (el.style.visibility) return;
  const vr = w.at.el.getBoundingClientRect(), wd = el.offsetWidth, h = el.offsetHeight;
  // under the view's bar and over the dock
  const bar = w.at.el.querySelector('.v3dbar'), dock = document.getElementById('dock');
  const T = (bar ? bar.getBoundingClientRect().bottom : vr.top) + 4;
  const B = Math.min(innerHeight, dock && dock.offsetHeight ? dock.getBoundingClientRect().top : innerHeight) - 4;
  const others = (w.hooks.avoid ? w.hooks.avoid() : []).filter(o => o && o !== w && !o.el.hidden && !o.el.style.visibility).map(o => o.el.getBoundingClientRect());
  const hit = (cx, cy) => others.some(r => cx < r.right + 4 && cx + wd > r.left - 4 && cy < r.bottom + 4 && cy + h > r.top - 4);
  let x, y;
  if (w.off) { x = vr.left + w.off[0]; y = vr.top + w.off[1]; }
  else {
    const bx = boxAt(w), c = anchorAt(w);
    if (!c && !bx) return;
    const left = w.anchor.side === 'left';
    if (bx) {
      const G = 16, cy = (bx.t + bx.b) / 2, cx = (bx.l + bx.r) / 2, yIn = v => clampN(v, T, Math.max(T, B - h)), xIn = v => clampN(v, 4, innerWidth - wd - 4);
      const side = [[bx.r + G, yIn(cy - h / 2)], [bx.l - G - wd, yIn(cy - h / 2)]];
      const opts = (left ? side.reverse() : side).concat([[xIn(cx - wd / 2), bx.b + G], [xIn(cx - wd / 2), bx.t - G - h]]);
      const onScreen = ([cx2, cy2]) => cx2 >= 4 && cx2 + wd <= innerWidth - 4 && cy2 >= T - 0.5 && cy2 + h <= B + 0.5;
      const over = ([cx2, cy2]) => Math.max(0, Math.min(cx2 + wd, bx.r) - Math.max(cx2, bx.l)) * Math.max(0, Math.min(cy2 + h, bx.b) - Math.max(cy2, bx.t));
      const pick = opts.find(o => onScreen(o) && !over(o) && !hit(o[0], o[1])) || opts.find(o => onScreen(o) && !over(o))
        // nowhere clear: where it covers the least of it
        || opts.map(([cx2, cy2]) => [xIn(cx2), yIn(cy2)]).reduce((a, o) => over(o) < over(a) ? o : a);
      [x, y] = pick;
    } else {
      x = left ? c.x - 18 - wd : c.x + 18; y = w.anchor.mid ? c.y - h / 2 : c.y + 18;
      if (!left && x + wd > innerWidth - 4) x = c.x - 18 - wd;
      if (left && x < 4) x = c.x + 18;
      if (hit(x, y)) {
        const tries = [];
        for (const r of others) tries.push([r.right + 8, y], [r.left - 8 - wd, y], [x, r.bottom + 8], [x, r.top - 8 - h]);
        const ok = tries.find(([cx2, cy2]) => cx2 >= 4 && cx2 + wd <= innerWidth - 4 && cy2 >= vr.top && cy2 + h <= vr.bottom && !hit(cx2, cy2));
        if (ok) [x, y] = ok;
      }
    }
    // one that stays put keeps the place it opened in, against its view
    if (w.stay) w.off = [x - vr.left, y - vr.top];
  }
  // while the view is on the screen; past it, it goes with the view
  const lo = Math.min(T, vr.bottom - h), hi = Math.max(B - h, vr.top);
  y = Math.max(lo, Math.min(hi, y));
  x = clampN(x, 4, innerWidth - wd - 4);
  el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
}
const placeAll = () => { for (const w of ALL) placeWidget(w); };
if (typeof addEventListener === 'function') {
  addEventListener('scroll', placeAll, { passive: true, capture: true });
  addEventListener('resize', placeAll);
}
