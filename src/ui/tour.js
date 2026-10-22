/* A guide: a few steps, each pointing at a part of the page with a short
   note - Back and Next to go through them, × or Escape to stop. A step may
   set the page up as it opens (run), and may offer to do its own work for
   the reader (act: [label, fn]). Its part of the page is ringed and scrolled
   to; a part the page does not have just now leaves the note in the middle. */

let T = null;
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function startTour(steps) {
  stopTour();
  const box = document.createElement('div'), ring = document.createElement('div');
  box.className = 'tour'; ring.className = 'tourring';
  document.body.append(ring, box);
  // the part of the page kept ringed as views are resized, moved or redrawn
  T = { steps, i: 0, box, ring, tick: setInterval(() => place(), 200) };
  box.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.t === 'x') stopTour();
    else if (b.dataset.t === 'back') go(T.i - 1);
    else if (b.dataset.t === 'next') { if (T.i >= T.steps.length - 1) stopTour(); else go(T.i + 1); }
    else if (b.dataset.t === 'act') { const a = T.steps[T.i].act; if (a) a[1](); setTimeout(place, 60); }
  });
  go(0);
}
export function stopTour() {
  if (!T) return;
  clearInterval(T.tick); T.box.remove(); T.ring.remove(); T = null;
}
export const touring = () => !!T;

function target() {
  const at = T.steps[T.i].at;
  const el = typeof at === 'function' ? at() : at ? document.querySelector(at) : null;
  return el && el.getClientRects().length ? el : null;
}
function go(i) {
  if (!T) return;
  T.i = Math.max(0, Math.min(T.steps.length - 1, i));
  const st = T.steps[T.i], n = T.steps.length;
  if (st.run) st.run();
  T.box.innerHTML = `<div class="tourhd"><b>${esc(st.title)}</b><span class="tourn">${T.i + 1} / ${n}</span><button type="button" data-t="x" title="Stop the guide (Esc)" aria-label="Stop the guide">×</button></div>`
    + `<div class="tourbody">${st.html}</div>`
    + `<div class="tourbtns">${st.act ? `<button type="button" class="minibtn tourdo" data-t="act">${esc(st.act[0])}</button>` : ''}<span class="tourgap"></span>`
    + `<button type="button" class="minibtn" data-t="back"${T.i ? '' : ' disabled'}>Back</button><button type="button" class="minibtn primary" data-t="next">${T.i === n - 1 ? 'Finish' : 'Next'}</button></div>`;
  // the page redraws what the step set up before its part is found
  setTimeout(() => { const el = target(); if (el) bring(el); setTimeout(place, 400); place(); }, 60);
}
/** the step's part scrolled to just under the settings bar, which stays at the top of the page */
function bring(el) {
  const bar = document.getElementById('calcBar');
  if (bar && bar.contains(el) || el.contains(bar)) return;
  const top = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0, r = el.getBoundingClientRect();
  if (r.top < top + 8 || r.top > innerHeight * 0.5) scrollBy({ top: r.top - top - 8, behavior: 'smooth' });
}
/** the ring round the step's part of the page, and the note beside it - under it, or over it where there is no room */
function place() {
  if (!T) return;
  const el = target(), box = T.box, ring = T.ring, bw = box.offsetWidth, bh = box.offsetHeight, W = innerWidth, H = innerHeight;
  if (!el) {
    ring.hidden = true;
    box.style.left = Math.round((W - bw) / 2) + 'px'; box.style.top = Math.round((H - bh) / 2) + 'px';
    return;
  }
  const r = el.getBoundingClientRect();
  ring.hidden = false;
  Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
  let y = r.bottom + 10, x = Math.max(8, Math.min(W - bw - 8, r.left + Math.min(24, r.width / 4)));
  if (y + bh > H - 8) y = r.top - bh - 10;
  // no room under it or over it: in its lower right corner, clear of its bar and where its drawing starts
  if (y < 8) { y = Math.max(8, Math.min(H, r.bottom) - bh - 12); x = Math.max(8, Math.min(W, r.right) - bw - 12); }
  box.style.left = Math.round(x) + 'px'; box.style.top = Math.round(y) + 'px';
}
addEventListener('scroll', () => { if (T) place(); }, true);
addEventListener('resize', () => { if (T) place(); });
addEventListener('keydown', e => { if (T && e.key === 'Escape') { stopTour(); e.stopPropagation(); } }, true);
