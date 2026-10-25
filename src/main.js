/* Vancouver Solar Shading Explorer 8 - the page.

   The page takes the question in four steps: where the sun is, what
   the shading cuts off, where the beam lands inside, and how much heat comes
   in. state.js holds the design, view.js how it is looked at. Every frame
   builds the building from the state (frame.js) and hands it to the drawings,
   the worked calculations and, on request, the Rhino exporter - so nothing on
   the page can disagree with anything else. This file only wires that to the
   document.                                                                 */

import { fmt, hhmm, MONTHS, wrap180, D2R } from './util.js';
import { CLOCK_NAME, sunriseSunsetSolar, solarToClock } from './solar.js';
import { S, setValue, getValue, addWindow, windowEachSide, insertStorey, applyTypology, createHistory, addStorey, duplicateStorey, removeStorey, moveStorey, removeGlazing,
  addDevice, addSavedDevice, removeDevice, createArray, removeArray, applyShadingPreset, copyCondition, selCell, breakUnit, rebindUnit, rebindAll, otherBroken, matchAbove,
  newSystemHere, useSystem, newUnitHere, duplicateHere, deleteEntry,
  saveWindow, openWindow, selectionChanged, keepCuts, windowState, savedWindow, removeWindow, renameWindow, windowName, windowSavedAs, selUnitIndex, shadingFromIdeal,
  addContextAt, removeContext, putContext, duplicateContext, instanceContext, makeUnique, pullContext, turnContext, contextGroup, plateTo } from './state.js';
import { V, AX_LAYERS } from './view.js';
import { buildFrame } from './frame.js';
import { SCOPES } from './geometry/building.js';
import { GLAZING_TYPES } from './geometry/cell.js';
import { roomOf } from './geometry/room.js';
import { lightUnits, floorNowAll, PLAN_LIGHT } from './geometry/floorsun.js';
import { maskStale, getMask, envStale, getEnvelopes, resetStudies, getDayGain, dayGainStale, getYearGain, yearGainStale, getFloorAll, floorAllStale,
  getFloor, floorStale, resetGains, getRegion, getHourly } from './studies.js';
import { SKIES, beamAt, unitGain, targetGain, floorNow, landing } from './energy.js';
import { drawSunPath, clearSunCache, DOT_SPANS } from './draw/sunpath.js';
import { drawSection, sectionHandle, secCutLine, sectionGrips, sectionDevHits, sectionPop } from './draw/section.js';
import { drawPlan, INTERIOR_MODES, planHandle, planCutLine, planGrips, planDevHits, planPop } from './draw/plan.js';
import { SHEETCAM0 } from './draw/sheetcam.js';
import { drawDetail, DETAIL_VIEWS, detailSun, detailHits, detailEye, detailWinPop } from './draw/detail.js';
import { drawAxon, axonHits, axonHandle, axonFocus, axonCtxHits, axonCtxEdit, axonCamera, axonPlateEdit, axonWinPop, axonSiteLines, axonSiteMids } from './draw/axon.js';
import { drawSunYear } from './draw/sunyear.js';
import { chartGainDay, chartGainYear, chartShadeYear } from './draw/charts.js';
import { WEATHER_FILES, parseEpw, addWeather } from './weather.js';
import { titleBlock, setSheet, SHEET0 } from './draw/svg.js';
import { sheetFor, buildLayout, wireLayout, margins, removeView, saveLayout } from './ui/layout.js';
import { dotsOpts, createView, VIEW_TYPES, devicePopHTML, windowPopHTML, emptyPopHTML, storeyPopHTML, sitePopHTML, ctxPopHTML } from './ui/views.js';
import { makeWidget, openWidget, closeWidget, hideWidget, showWidget } from './ui/widgets.js';
import { buildCell as liveCell, SLAB0 as LIVE_SLAB0 } from './geometry/cell.js';
import { axonIso, axonIsoDevs, axonRay } from './draw/axon.js';
import { bboxOf } from './draw/svg.js';
import { startTour } from './ui/tour.js';
import { facadeLength as liveLen, facadeAzimuth as liveAz } from './geometry/building.js';
import { solarPosition as liveSun } from './solar.js';
import { monthDayOf as liveDate, wrap180 as liveWrap } from './util.js';
import { selGlazing as liveGlz, selStorey as liveStorey } from './state.js';
import { MEMBERS_MAX } from './ui/calc.js';
import { unlinkSides, fitsSimple, dupDevice, liveToggle, liveStart, liveCompare, liveOff, liveApply, liveSetKind, liveKind, applySitePreset, rotateSite, isBroken, selUnitType, SHADING_PRESETS, STOREYS_MAX, selShading, selDevice as selDev, selSystem, addShading, addSavedWindow, saveEntry, copyEntry, copyName, isSaved, deleteSaved } from './state.js';
import { SYSTEM_PRESETS, usage, entryName, defaultName } from './library.js';
import { deviceLabel } from './geometry/device.js';
import { openFloatEdit, openNudge, openAsk, openName, buildRail, buildCalcBar, RESULT_SCOPES, syncRail, syncClock, wireRail, copyUI, brkUI, regsControls } from './ui/rail.js';
import { stackLabel } from './ui/readout.js';
import { recSun, recGeometry, recBylaw, recFor, resGain, fxUI, recUI, idealSpec, chartSpec } from './ui/calc.js';
import { renderChecks, renderEnergy, staticProse } from './ui/prose.js';
import { wireView, viewPoint } from './ui/interact.js';
import { exportRhino } from './export/rhino.js';

const $ = id => document.getElementById(id);
const clampN = (x, a, b) => Math.min(b, Math.max(a, x));
// the page starts on the default template - a 10 m square storey, a window in the middle of each side - on solar time, in the mode last used: Simple at first
S.storeys[0].w = 10; S.storeys[0].d = 10;
windowEachSide(S);
const MODE_KEY = 'solar-shading-mode-v9';
try { S.mode = localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'simple'; } catch (_) { S.mode = 'simple'; }
const H = createHistory(S);
const SCOPES_SHORT = { unit: 'The selected unit', storey: 'This storey, this side', level: 'This storey, all sides', facade: 'This side', building: 'The whole building' };
const opts = o => Object.entries(o).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');

/* ---------- the views on the page ----------
   Any number of each kind, each an instance with its own bar and cameras
   (ui/views.js), in rows the user arranges (ui/layout.js). */
const insts = () => [...document.querySelectorAll('#views .view')].map(el => el._inst).filter(Boolean);
function makeInst(type, pin = null) {
  const inst = createView(type, pin && savedWindow(S, pin) ? pin : null), bar = inst.el.querySelector('.v3dbar');
  wireRail(bar, S, api);
  for (const f of inst.floats) wireRail(f, S, api);
  // the figures along the view's foot: typed over, and slid
  wireRail(inst.title, S, api);
  // the bar's own controls, for this view alone
  const q = c => inst.el.querySelector(c);
  if (type === 'sun') {
    q('.dotsSel').addEventListener('change', e => {
      const k = e.target.value; if (!k) return;
      inst.V.dots = k; e.target.innerHTML = dotsOpts(k); e.target.value = '';
      clearSunCache(); paint(inst, true);
    });
    // the sun path, or the year by day and hour
    q('.sunModes').addEventListener('click', e => {
      const b = e.target.closest('[data-sm]'); if (!b) return;
      inst.V.sunMode = b.dataset.sm;
      q('.sunModes').querySelectorAll('[data-sm]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      q('.wxdots').hidden = inst.V.sunMode === 'year';
      paint(inst, true);
    });
  }
  if (type === 'detail') {

    q('.detReset').addEventListener('click', () => { Object.assign(inst.V.detcam, DETAIL_VIEWS.outside); paint(inst); });
  }
  if (type === 'section') q('.secReset').addEventListener('click', () => { inst.V.seccam = SHEETCAM0('window'); paint(inst); });
  if (type === 'axon') {
    // the typology, from the site view's own bar - every site view showing the one chosen
    q('.axTyp').addEventListener('change', e => { const k = e.target.value; document.querySelectorAll('.axTyp').forEach(x => { x.value = k; }); api.typology(k); });
    q('.axTyp').value = document.querySelector('.axTyp') ? document.querySelector('.axTyp').value : 'blank';
    // the site: its boundary's small window, the context massing placed, and whether it turns with the building
    q('.axBnd').addEventListener('click', () => { q('.axSite').open = false; openBoundary(null, inst); });
    q('.axSite').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) { q('.axSite').open = false; api.act(b.dataset.act, b.dataset.v); } });
    q('.axSite').addEventListener('change', e => {
      const t = e.target;
      if (t.matches('input[type=checkbox][data-k]')) api.set(t.dataset.k, t.checked);
      if (t.matches('.axSitePre') && t.value) { const k = t.value; t.value = ''; q('.axSite').open = false; api.act('sitePreset', k); }
    });
  }
  // shading added from the drawing's own bar - a new member, a saved device or shading system, or a preset - picked, its window open
  const ad = q('.addShd');
  if (ad) ad.addEventListener('change', () => {
    const v = ad.value; ad.value = '';
    if (!v) return;
    stopPlay(); H.mark('device');
    if (addShading(v)) { const r = selCell(); pickOnly(r ? r.dev || 0 : 0, inst); }
    schedule();
  });
  // the bay alone or the whole floor; the edit handles shown or not - each view its own
  const wh = inst.el.querySelector('.vWhole'), vb = inst.el.querySelector('.vBeam'), va = inst.el.querySelector('.vAng');
  // the sun's angles at the window, in the floor view
  if (va) va.addEventListener('change', e => { inst.V.detAng = e.target.checked; paint(inst); });
  // the sunlight that gets in, shaded and outlined - or left to its grey outline
  if (vb) vb.addEventListener('change', e => { inst.V.beam = e.target.checked; paint(inst); });
  // the site's lines standing up from the boundary, on request
  const vs = inst.el.querySelector('.vSite');
  if (vs) vs.addEventListener('change', e => { inst.V.site = e.target.checked; paint(inst); });
  if (wh) wh.addEventListener('change', e => { inst.V.whole = e.target.checked; inst.V.detcam.whole = e.target.checked; paint(inst, true); });
  if (type === 'plan') {
    q('.planReset').addEventListener('click', () => { inst.V.plancam = SHEETCAM0('window'); paint(inst); });
    q('.inModes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; inst.V.inMode = b.dataset.mode; schedule(); });
  }
  // another kind of view in the same place
  q('.vtype').addEventListener('change', e => {
    const n = makeInst(e.target.value);
    n.el.style.flexGrow = inst.el.style.flexGrow;
    inst.el.replaceWith(n.el); margins(); saveLayout(); clearSunCache(); schedule();
  });
  if (type === 'plan' || type === 'section') {
    /* which window the view shows: the selected one, or a saved one, chosen
       in the view; a saved window is named when it is saved, and can be
       renamed or deleted from any view showing it */
    const ask = (btn, value, done) => {
      const box = document.createElement('input');
      box.type = 'text'; box.className = 'vname'; box.value = value; box.placeholder = windowName(S); box.spellcheck = false; box.setAttribute('aria-label', 'Name of the saved window');
      box.title = 'Tab takes the suggested name; Enter saves, Escape leaves it';
      btn.hidden = true; btn.after(box); box.focus(); box.select();
      let over = false;
      const close = ok => { if (over) return; over = true; const name = box.value; box.remove(); setPin(inst, inst.pin); if (ok) done(name); };
      box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') close(true); else if (e.key === 'Escape') close(false); });
      box.addEventListener('blur', () => close(false));
    };
    q('.vsave').addEventListener('click', e => ask(e.currentTarget, '', name => { H.mark('saveview'); setPin(inst, saveWindow(S, name)); schedule(); }));
    q('.wren').addEventListener('click', e => { const v = savedWindow(S, inst.pin); if (v) ask(e.currentTarget, v.name, name => { H.mark('saveview'); renameWindow(inst.pin, name); refreshTypes(true); schedule(); }); });
    q('.wdel').addEventListener('click', () => { const id = inst.pin; if (!id) return; H.mark('saveview'); removeWindow(id); for (const i of insts()) if (i.pin === id) setPin(i, null); refreshTypes(true); schedule(); });
    q('.winSel').addEventListener('change', e => {
      const id = e.target.value || null;
      setPin(inst, id);
      if (id && openWindow(S, id)) { H.mark('select'); brkUI.pending = false; }
      schedule();
    });
    // clicking into a saved window's view makes it the selection, cuts and all
    inst.el.addEventListener('pointerdown', e => {
      if (!inst.pin || S.activeView === inst.pin || e.target.closest('.vtype, .vbtns, .grip, .vname, .wpick')) return;
      if (openWindow(S, inst.pin)) { H.mark('select'); brkUI.pending = false; schedule(); }
    }, true);
    setPin(inst, inst.pin);
  }
  wireView(inst, { S, V, H, schedule, scheduleLight, paint: i => paint(i), stopPlay, select, placeContext, selectContext,
    putContext: (id, C, a, dims) => { putContext(S, id, C, a, dims); scheduleLight(); },
    duplicateContext: id => { const nid = duplicateContext(id); schedule(); return nid; },
    pullContext: (id, key, dim, snaps) => { pullContext(S, id, key, dim, snaps); scheduleLight(); },
    turnContext: (id, a, snaps) => { turnContext(S, id, a, snaps); scheduleLight(); },
    askInstance,
    // a device Alt-dragged by its gumball: a copy left where it stood
    dupDevice: () => { if (S.live || !dupDevice(S)) return false; schedule(); return true; },
    // the selected storey, edited in the site view
    plateTo: o => { plateTo(S, o); scheduleLight(); },
    pick,
    // one of the selected storey's icons in the site view: add, copy or move it, up or down
    act: (n, a) => api.act(n, a),
    // an array dragged down to nothing goes back to one member when it is let go
    endArray: () => { if (arrayGone('a.len', getValue('a.len'))) { setValue('a.on', false); schedule(); } },
    togglePop: i => { POP.at = i; POP.st = 'open'; paint(i); },
    nudge: (g, x, y) => openNudge(x, y, g, S, api),
    // a window or a storey's wall clicked: the storey to edit, and the window's own small window open where it has windows
    selectPlate: (f, st, unit = null) => { if (S.site && S.site.ctxSel) setValue('site.ctxSel', null); V.plate.on = true; openWidget(SW, inst); closeWidget(SITEW); V.siteEdit = false; select(f, st, unit); picked = unit === null ? 'wall' : 'window'; showWindowPop(inst); },
    selectWindow: (f, st, unit) => { select(f, st, unit); picked = 'window'; showWindowPop(inst); },
    // the storey's gumball arrow clicked: how far to move it along that axis, typed
    askPlateMove: (w, C0, x, y) => openAsk(x, y, 'move mm', n => { stopPlay(); H.mark('plate:move'); plateTo(S, { C: [C0[0] + w[0] * n / 1000, C0[1] + w[1] * n / 1000] }); schedule(); }),
    // a click on nothing lets the storey go, and the window with it: their handles and small windows go
    // the site's lines pushed and pulled; one clicked opens the boundary's small window on its side
    siteSet: (k, v) => { setValue(k, v); scheduleLight(); },
    siteSetMany: kvs => { for (const [k, v] of kvs) setValue(k, v); scheduleLight(); },
    openBoundary: (f, i) => openBoundary(f, i),
    endPlate: () => { V.plate.on = false; closeWidget(SW); closeWidget(SITEW); V.siteEdit = false; if (S.pick === 'window') { S.pick = null; picked = null; hideWidget(POP); } } });
  return inst;
}

/* the storey's study behind the selected window: the sun on its floor now, and the plan's day and year maps */
function roomStudy(F, dni, light, mode = 'now') {
  const { m, cur, S: st } = F;
  if (!m.opening) return null;
  const R = roomOf(m, st), region = getRegion(m, R, st, mode === 'year' ? 'year' : 'day'), study = { R, region };
  study.nowGrid = floorNow(m, region, cur.sl, cur.onFacade ? dni : 0);
  study.now = study.nowGrid;
  if (!light) {
    study.land = landing(m, R, cur.sl, cur.onFacade ? dni : 0, region);
    study.land.dni = dni;
    study.land.enter = cur.onFacade ? unitGain(m, cur.sl, dni, 61, 49, cur.frac).ent : 0;
  }
  // the plan's floor is lit through the windows the results are for
  study.light = PLAN_LIGHT[st.scope] || 'unit';
  if (study.light !== 'unit') {
    study.units = lightUnits(F);
    study.nowAll = floorNowAll(F, study.units, cur.up ? dni : 0);
    if (mode !== 'now') study[mode] = getFloorAll(F, study.units, R, mode);
  } else if (mode !== 'now') study[mode] = getFloor(m, R, st, mode);
  return study;
}

/* One view drawn: on the sheet its space gives it, with its own cameras, and
   what the drawing leaves for the pointer kept on the view, so two views of
   one kind never answer for each other. */
/** a view pinned to a saved window, or let go of one - its bar says which */
function setPin(inst, id) {
  inst.pin = id && savedWindow(S, id) ? id : null;
  inst.el.dataset.pin = inst.pin || '';
  const sv = inst.el.querySelector('.vsave'), ren = inst.el.querySelector('.wren'), del = inst.el.querySelector('.wdel');
  if (sv) sv.hidden = !!inst.pin;
  if (ren) ren.hidden = !inst.pin;
  if (del) del.hidden = !inst.pin;
  inst.el.classList.toggle('pinned', !!inst.pin);
  refreshTypes(true, inst); if (inst.el.isConnected) saveLayout();
}
/** each plan's and section's window menu: the selected window first, then every saved one */
function refreshTypes(force = false, only = null) {
  const views = S.views || [], sig = JSON.stringify(views.map(v => [v.id, v.name]));
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  for (const inst of only ? [only] : insts()) {
    const sel = inst.el.querySelector('.winSel');
    if (!sel) continue;
    if (force || sel.dataset.sig !== sig) {
      sel.innerHTML = '<option value="">Selected window</option>' + (views.length ? '<optgroup label="Bookmarks">' + views.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('') + '</optgroup>' : '');
      sel.dataset.sig = sig;
    }
    sel.value = inst.pin || '';
    // a window already saved is not saved again: the button says where it is
    const sv = inst.el.querySelector('.vsave'), was = windowSavedAs(S, S.sel.f, S.sel.st, selUnitIndex(S));
    if (sv) { sv.disabled = !!was; sv.title = was ? 'The selected window is bookmarked already, as ' + was.name + ' - choose it in the menu' : 'Bookmark the selected window and its section and plan cuts by name; this view then keeps showing it'; }
  }
}
/** a saved window's view not selected shows its own cuts in its bar */
function pinnedBars() {
  for (const inst of insts()) {
    const v = inst.pin && S.activeView !== inst.pin && savedWindow(S, inst.pin);
    if (!v) continue;
    for (const [k, x] of [['cutU', v.cutU], ['cutV', v.cutV]]) inst.el.querySelectorAll(`[data-val="${k}"]`).forEach(o => { if (!o.firstElementChild) o.textContent = fmt(x, 2) + ' m'; });
  }
}
/** a figure in a view's title that is read at a glance */
const big = v => '<strong class="tbig">' + v + '</strong>';
/* The picked device's small window: one on the page, hung off the gumball
   of the view it was picked or reopened in. It opens when a device is
   picked and goes when it is let go; its title moves it anywhere on the
   page, it folds, and it closes - the gumball's centre opens it again.    */
const POP = makeWidget('', { change: w => { if (w.at) paint(w.at); }, avoid: () => [SW, SITEW] });
/* the selected storey's small window, in the site view: it stays where it opened */
const SW = makeWidget('stpop', { stay: true, change: w => { if (w.at) paint(w.at); }, avoid: () => [POP] });
const view3d = t => t === 'axon' || t === 'detail';
/** the library: every entry of a kind the design has made by name - not the copies a break or the optimization makes on their own */
const libOf = kind => Object.values(S.lib[kind]).filter(o => !o.auto);
/** the saved entries of a kind, by name */
const libList = kind => Object.values(S.lib[kind]).map(o => [o.id, kind === 'devices' ? o.name || deviceLabel(o) : o.name || defaultName(kind, o)]);
/** the selected window against its array, for its small window */
function brkInfo(F) {
  const row = F.B && F.B.facades[S.sel.f] && F.B.facades[S.sel.f].rows[S.sel.st], n = row && row.units ? row.units.length : 0;
  return { can: n > 1 && !!selUnitType(), broken: isBroken(S, 'win'), i: selUnitIndex(S), others: otherBroken(S, 'win'), pending: brkUI.pending === 'win' };
}
function devPop(inst, F) {
  if (inst !== POP.at) return;
  // a bare side has no window for the frame to carry the pick on: the pick itself says so
  // isolated in the building view, the window's own small window stays - a device picked from it is pulled there
  // Simple edits the selected window in the building view where it stands, as Advanced does once it is isolated
  const isoOn = inst.type === 'axon' && (!!inst.V.iso || (S.mode === 'simple' && S.sel.unit !== null && (S.pick === 'window' || S.pick === 'device')));
  const P = inst.h.pop, has = !!selCell(), isWin = !!(P && (P.kind === 'window' || P.kind === 'wall') && (F.pick === 'window' || (isoOn && !F.selD) || (!has && S.pick === 'window')));
  if (!(P && (isWin || F.selD) && POP.st !== 'closed')) { hideWidget(POP); return; }
  const min = POP.st === 'min';
  let html;
  if (isWin && !has) {
    // a bare side: in a 3D view, a window system added to it
    if (!view3d(inst.type)) { hideWidget(POP); return; }
    html = emptyPopHTML(min, { simple: S.mode === 'simple', presets: Object.entries(SYSTEM_PRESETS).map(([k, p]) => [k, p.label]), saved: libOf('systems').map(y => [y.id, y.name || 'Window group']) });
  } else if (isWin) {
    const r = selCell(), u = selUnitType(), b = brkInfo(F), row = F.B && F.B.facades[S.sel.f] && F.B.facades[S.sel.f].rows[S.sel.st], nU = row && row.units ? row.units.length : 1;
    html = windowPopHTML(F.m, min, { simple: S.mode === 'simple', view3d: view3d(inst.type), mode: inst.type === 'axon' && picked === 'wall' && S.mode !== 'simple' ? 'facade' : 'window', more: POP.more,
      title: 'Window ' + (selUnitIndex(S) + 1) + (nU > 1 ? ' of ' + nU : ''), devs: shadingDevs(), cur: r.dev || 0, add: addGroups('both'), side: S.sel.f + ' side', st: S.sel.st,
      live: !!(S.live && S.live.f === S.sel.f && S.live.st === S.sel.st), axon: inst.type === 'axon' && S.mode !== 'simple', iso: !!inst.V.iso,
      sysName: entryName(S, 'systems', r.sys), unitName: u ? entryName(S, 'units', u.id) : '', brk: b,
      grpName: (selShading(S) || {}).name || 'Shading group', grpId: (selShading(S) || {}).id, grpOpts: libOf('shading').map(x => [x.id, x.name || 'Shading group']),
      sysId: r.sys, winOpts: libOf('systems').map(y => [y.id, y.name || 'Window group']),
      arr: getValue('g.arrOn'), by: getValue('g.arrBy'), sides: getValue('matchSides'), up: getValue('matchGlazing'), above: S.sel.st < S.storeys.length - 1 });
  } else html = devicePopHTML(F.selD, P.ax, P.arrayView, min, { simple: S.mode === 'simple', more: POP.more, axon: isoOn, both: isoOn, iso: !!inst.V.iso, grpName: (selShading(S) || {}).name || 'Shading group', grpId: (selShading(S) || {}).id,
    grpOpts: libOf('shading').map(x => [x.id, x.name || 'Shading group']), devOpts: libOf('devices').filter(D => D.dir === F.selD.dir).map(D => [D.id, D.name || deviceLabel(D)]) });
  // in the site view, to the window's left, clear of the storey's own small window on its right
  showWidget(POP, html, { x: P.x, y: P.y, box: P.box, side: inst.type === 'axon' ? 'left' : 'right', mid: inst.type === 'axon' });
}
/** the selected storey's small window, beside it in the site view */
function storeyPop(inst) {
  if (SW.at !== inst) return;
  const pe = inst.h.plateEdit;
  // the storey's own small window opens with its wall or its roof, or from the window's - not in Simple, which has one storey
  if (!(V.plate.on && pe && pe.anchor) || S.mode === 'simple') { hideWidget(SW); return; }
  const n = S.storeys.length, p = S.storeys[S.sel.st];
  showWidget(SW, storeyPopHTML(SW.st === 'min', { i: S.sel.st, n, full: n >= STOREYS_MAX, match: getValue('matchPlate'), rotBelow: (p.rotRel || 'building') === 'below' }),
    { x: pe.anchor[0], y: pe.anchor[1], side: 'right', mid: true, box: bboxOf((inst.h.hits || []).filter(h => h.st === S.sel.st).flatMap(h => h.pts)) });
}
/* the site boundary's small window, off the middle of the side being set; the side picked out while it is open */
const SITEW = makeWidget('sitepop', { change: w => { V.siteEdit = w.st !== 'closed'; if (w.at) paint(w.at); } });
function openBoundary(f, inst) {
  if (f) setValue('site.edit', f);
  // the site picked lets the storey and its window go
  V.plate.on = false; closeWidget(SW);
  if (S.pick === 'window') { S.pick = null; picked = null; hideWidget(POP); }
  if (inst.V.layers) inst.V.layers.site = true;
  openWidget(SITEW, inst); V.siteEdit = true; schedule();
}
/* the selected obstruction's small window, off the middle of its top: open while it is selected, until closed */
const CTXW = makeWidget('ctxpop', { change: w => { if (w.at) paint(w.at); }, avoid: () => [POP, SW] });
function ctxPop(inst) {
  const id = S.site && S.site.ctxSel, ed = inst.h.ctxEdit;
  if (!id) { if (CTXW.st !== 'closed') closeWidget(CTXW); CTXW.id = null; return; }
  if (CTXW.id !== id && ed && ed.id === id) { CTXW.id = id; openWidget(CTXW, inst); }
  if (CTXW.at !== inst) return;
  if (!ed || ed.id !== id || !ed.anchor) { hideWidget(CTXW); return; }
  const c = (S.site.ctx || []).find(k => k.id === id);
  showWidget(CTXW, ctxPopHTML(CTXW.st === 'min', { n: contextGroup(S, id).length, rot: c && c.inheritRot, follow: getValue('site.ctxFollow'), adv: S.mode !== 'simple' }),
    { x: ed.anchor[0], y: ed.anchor[1], side: 'right', mid: true, box: bboxOf(((inst.h.ctxHits || []).find(h => h.id === id) || { pts: [] }).pts.concat(ed.faces.map(f => f.p), [ed.rot.p])) });
}
function sitePop(inst) {
  if (SITEW.at !== inst) return;
  const f = (S.site && S.site.edit) || 'S', mids = inst.h.siteMids;
  if (!mids || !mids[f]) { hideWidget(SITEW); return; }
  showWidget(SITEW, sitePopHTML(SITEW.st === 'min', { f, kind: S.site[f] ? S.site[f].kind : 'open' }), { x: mids[f][0], y: mids[f][1], side: 'right', mid: true });
}
/** the shading menu on a plan's or a section's bar: a new member, or what is saved - kept to the design's library */
function shadingMenu(inst) {
  const sel = inst.el.querySelector('.addShd');
  if (!sel) return;
  const has = !!(selCell() && selUnitType()), dir = sel.dataset.dir === 'v' ? 'v' : 'h', groups = addGroups(dir), sig = has + JSON.stringify(groups);
  if (sel.dataset.sig === sig) return;
  sel.dataset.sig = sig;
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  sel.innerHTML = '<option value="" hidden selected>Add shading device</option>' + groups.filter(([, xs]) => xs.length).map(([l, xs]) => (l ? `<optgroup label="${esc(l)}">` : '')
    + xs.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('') + (l ? '</optgroup>' : '')).join('');
  sel.disabled = !has || !!S.live;
  sel.title = has ? 'A shading device on the selected window - and every window of its array: a new one, a preset, or one you have saved. It is picked, ready to shape here.' : 'Shading hangs on a window: select one first';
}
/* What shading can be added: new devices, the presets, and what the user has
   saved - on a plan or a section only what runs the way it cuts. */
const PRESET_DIR = { fins: 'v', canopy: 'h', louvredCanopy: 'h', louvres: 'h', eggcrate: 'both', balcony: 'h' };
function addGroups(dir) {
  const ok = d => dir === 'both' || d === dir, saved = libOf;
  const fresh = [['new:h', 'New horizontal device'], ['new:v', 'New vertical device']].filter(([v]) => ok(v.slice(4)));
  return [['', fresh], ['Presets', Object.entries(SHADING_PRESETS).filter(([k]) => ok(PRESET_DIR[k] || 'both')).map(([k, p]) => ['pre:' + k, p.label])],
    ['Library devices', S.mode === 'simple' ? [] : saved('devices').filter(D => ok(D.dir || 'h')).map(D => ['dev:' + D.id, D.name || deviceLabel(D)])],
    ['Library shading groups', dir === 'both' && S.mode !== 'simple' ? saved('shading').filter(x => x.devices.length).map(x => ['grp:' + x.id, x.name || 'Shading group']) : []]];
}
/** the selected window's shading, a device at a time */
function shadingDevs() {
  const h = selShading(S);
  return h ? h.devices.map((id, i) => { const D = S.lib.devices[id]; return D ? { i, name: D.name || deviceLabel(D), dir: D.dir } : null; }).filter(Boolean) : [];
}
/** what the last click in a 3D view took: a window, or a storey's wall - what Delete takes out */
let picked = null;
/** the selected side's windows picked, and their small window opened off the view clicked in - where the side has windows */
function showWindowPop(inst) {
  if (!selCell() && !view3d(inst.type)) return;
  if (S.pick !== 'window' || POP.st === 'closed') openWidget(POP, inst);
  S.pick = 'window'; POP.at = inst; POP.st = 'open';
}
/** a device picked - in the panel, or on a drawing; picked afresh, its window opens */
function pickOnly(i, inst) {
  // the live members are the optimization's: not picked to edit while it is on
  if (S.live) return;
  const r = selCell();
  if (S.pick !== 'device' || (r && (r.dev || 0) !== i) || POP.st === 'closed') openWidget(POP, inst || POP.at);
  POP.at = inst || POP.at || insts().find(x => x.type === 'section' || x.type === 'plan') || null;
  if (r) r.dev = i;
  S.pick = 'device';
}
/** an array with nothing left to repeat: no length, a single member by number, or no spacing */
function arrayGone(k, v) {
  if (!getValue('a.on')) return false;
  return (k === 'a.arrSp' && !(v > 0)) || !(getValue('a.len') > 0.004) || (getValue('a.mode') === 'count' && getValue('a.arrN') <= 1);
}
/** a click on a plan or a section: the window and its wall, a device, or nothing - which hides every handle */
function pick(i, inst) {
  // a click on a plan or a section: Delete then takes the window system, never the storey
  picked = i === 'win' ? 'window' : null;
  if (i === null) { if (!S.pick) return; S.pick = null; }
  else if (i === 'site') S.pick = 'site';
  else if (i === 'win') {
    // the window picked - or clicked again - opens its own small window
    if (S.pick !== 'window' || POP.st === 'closed') openWidget(POP, inst || POP.at);
    POP.st = 'open'; POP.at = inst || POP.at; S.pick = 'window';
  }
  else pickOnly(i, inst);
  if (!S.pick) hideWidget(POP);
  schedule();
}
/* A figure on a foot line hovered: its angle picked out in every building view. */
const ANG_OF = { sunAlt: 'beta', sunAz: 'solaz', gamma: 'gamma', theta: 'theta' };
let hlAng = null;
const showAng = () => document.querySelectorAll('.view[data-type=axon] .ang').forEach(a => a.classList.toggle('hl', a.dataset.ang === hlAng));
document.addEventListener('pointerover', e => {
  const m = e.target.closest && e.target.closest('.tblock .m.ed'), k = m && m.querySelector('[data-val]');
  const a = k ? ANG_OF[k.dataset.val] || null : null;
  if (a !== hlAng) { hlAng = a; showAng(); }
});
/** a view's foot line put in - unless one of its figures is being typed over */
function setTitle(inst, html) {
  if (inst.title.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  if (inst.title.innerHTML !== html) inst.title.innerHTML = html;
}
/** a view drawn, and its camera buttons put back at the top of the drawing - held under the bar as the page scrolls */
function drawInst(inst, F0, ctx) {
  drawInstBody(inst, F0, ctx);
  const tr = inst.floats && inst.floats[0];
  if (tr && inst.host.firstChild !== tr) inst.host.prepend(tr);
  if (hlAng && inst.type === 'axon') showAng();
  const bar = inst.el.querySelector('.v3dbar');
  if (bar) inst.el.style.setProperty('--vbh', bar.offsetHeight + 'px');
}
function drawInstBody(inst, F0, ctx) {
  shadingMenu(inst); liveBar(inst);
  // a saved window's view draws its own window and cuts - the selection's frame when it is the selection
  if (inst.pin && !savedWindow(S, inst.pin)) setPin(inst, null);
  const pin = inst.pin && S.activeView !== inst.pin ? inst.pin : null;
  const F = pin ? (ctx.frames[pin] || (ctx.frames[pin] = buildFrame(windowState(S, pin), V, ctx.light))) : F0;
  const { cur, sel, T, m } = F, Fi = Object.assign({}, F, { V: inst.V });
  setSheet(...sheetFor(inst.el));
  const pct = F.res ? fmt(F.res.frac * 100, 1) + '%' : '—', md = F.date, dateStr = MONTHS[md.m - 1] + ' ' + md.d;
  const where = sel.f + ' · storey ' + (sel.st + 1) + (sel.unit !== null ? ' · unit ' + (sel.unit + 1) : '');
  const sk = mode => (pin ? pin + ':' : '') + mode;
  const study = mode => { if (!(sk(mode) in ctx.studies)) ctx.studies[sk(mode)] = roomStudy(F, ctx.dni, ctx.light, mode); return ctx.studies[sk(mode)]; };
  switch (inst.type) {
    case 'axon':
      // a window isolated keeps to the window selected: with none, the building's own handles are back
      if (inst.V.iso && (S.sel.unit === null || !selCell())) inst.V.iso = false;
      inst.el.classList.toggle('iso', !!inst.V.iso);
      inst.host.innerHTML = drawAxon(Fi); inst.h = { hits: axonHits, handle: axonHandle, focus: axonFocus, ctxHits: axonCtxHits, ctxEdit: axonCtxEdit, plateEdit: axonPlateEdit, pop: axonWinPop, siteLines: axonSiteLines, siteMids: axonSiteMids, iso: axonIso, isoDevs: axonIsoDevs, ray: axonRay };
      devPop(inst, F); storeyPop(inst); sitePop(inst); ctxPop(inst);
      setTitle(inst, titleBlock('Site angles', [
        ['β', cur.up ? fmt(cur.alt, 1) + '°' : 'sun down', 'sunAlt'], ['solar azimuth', cur.up ? fmt(wrap180(cur.az - 180), 1) + '° from S' : '—', 'sunAz'], ['γ', cur.up ? fmt(-cur.gamma, 1) + '°' : '—', 'gamma']]));
      break;
    case 'sun':
      inst.host.innerHTML = inst.V.sunMode === 'year' ? drawSunYear(Fi, getHourly(T)) : drawSunPath(Fi); inst.h = {};
      setTitle(inst, titleBlock(inst.V.sunMode === 'year' ? 'Sun across the year' : 'Sun path chart', [
        ['date', dateStr, 'doy'], ['time', hhmm(S.hour), 'hour'],
        ['facade', sel.f + ' side · ' + fmt(wrap180(cur.gf - 180), 0) + '° from S'],
        ['shading', SCOPES[S.scope].toLowerCase() + (T.units > 1 ? ' (' + T.units + ' units)' : '')]]));
      break;
    case 'section':
      inst.host.innerHTML = drawSection(Fi, study('now')); inst.h = { handle: sectionHandle, cut: secCutLine, grips: sectionGrips, devHits: sectionDevHits, pop: sectionPop };
      devPop(inst, F);
      setTitle(inst, titleBlock('Section', [
        ['θ', cur.onFacade ? fmt(cur.vsa, 1) + '°' : 'no direct sun', cur.onFacade ? 'theta' : null], ['plan cut', fmt(S.cutV * 1000, 0) + ' mm', 'cutV'], ['shaded', pct], ['device', stackLabel(F)]]));
      break;
    case 'plan':
      inst.host.innerHTML = drawPlan(Fi, study(inst.V.inMode)); inst.h = { handle: planHandle, cut: planCutLine, grips: planGrips, devHits: planDevHits, pop: planPop };
      devPop(inst, F);
      setTitle(inst, titleBlock('Plan', [
        ['γ', cur.up ? fmt(-cur.gamma, 1) + '°' : '—', cur.up ? 'gamma' : null], ['section cut', fmt(S.cutU * 1000, 0) + ' mm', 'cutU'], ['floor', INTERIOR_MODES[inst.V.inMode].toLowerCase()], ['condition', where]]));
      inst.el.querySelectorAll('.inModes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === inst.V.inMode)));
      break;
    case 'gday': case 'gyear': {
      // the day's and the year's solar heat, for what the results are for; cached figures only, so a drag never waits on them
      const v = inst.type === 'gday' ? getDayGain(T, S) : getYearGain(T, S);
      inst.host.innerHTML = v ? (inst.type === 'gday' ? chartGainDay(v, S.hour) : chartGainYear(v))
        : '<p class="vwait">' + (T.items.length ? 'Working out the ' + (inst.type === 'gday' ? 'day…' : 'year…') : 'No glazing in what the results are for: add a window system under Window Parameters.') + '</p>';
      inst.h = {};
      setTitle(inst, titleBlock(inst.type === 'gday' ? 'Solar heat gain' : 'Solar heat gain · the year', (inst.type === 'gday' ? [['date', dateStr, 'doy']] : []).concat([
        ['for', RESULT_SCOPES[S.scope].toLowerCase()], ['sky', SKIES[S.sky].toLowerCase()]].concat(inst.type === 'gyear' || S.sky !== 'clear' ? [['weather', WEATHER_FILES[S.wx]]] : []))));
      break;
    }
    case 'detail': {
      inst.host.innerHTML = drawDetail(Fi); inst.h = { sun: detailSun, hits: detailHits, eye: detailEye, pop: detailWinPop };
      devPop(inst, F);
      // the selected window's beam into the room: worked out on a full redraw, kept while the day plays
      if (!ctx.light) {
        const land = m.opening && cur.onFacade ? (study('now') || {}).land : null, lit = land && land.total > 0;
        inst._beam = !m.opening ? [] : [['into the room', big(cur.onFacade ? fmt(land ? land.total : 0, 0) + ' W' : 'no sun')],
          ['on the floor', big(lit ? fmt(land.dni * m.shgc * Math.sin(cur.alt * D2R), 0) + ' W/m²' : '—')]];
      }
      setTitle(inst, titleBlock('Window in 3D', [
        ['sun on the glass', big(m.opening && cur.onFacade ? fmt((1 - cur.frac) * 100, 0) + '%' : 'none')]].concat(inst._beam || [],
        [['section', fmt(S.cutU * 1000, 0) + ' mm', 'cutU'], ['plan', fmt(S.cutV * 1000, 0) + ' mm', 'cutV']])));
      break;
    }
  }
}
/** one view repainted on its own, lightly - an orbit, a zoom, a pan */
const paintQ = new Set();
let paintRaf = null;
function paint(inst, full = false) {
  paintQ.add(inst);
  if (paintRaf) return;
  paintRaf = requestAnimationFrame(() => {
    paintRaf = null;
    const F = buildFrame(S, V, !full), { dni } = beamAt(S.sky, S.wx, S.doy, S.hour, S.timeMode), ctx = { dni, light: false, studies: {}, frames: {} };
    for (const i of paintQ) if (i.el.isConnected) drawInst(i, F, ctx);
    paintQ.clear();
  });
}

/* ---------- a frame ----------
   `light` redraws the drawings and the instant figures only. The day's and
   the year's totals wait while the day is playing or a drag is held. */
/* Live optimization kept to the moment: before each drawing, the ideal for the
   window it is on - at the date and time set, with the member counts chosen -
   is worked out from that window's glass and the sun, and written into its members. */
function liveUpdate() {
  let L = S.live;
  if (!L) return;
  if (L.f !== S.sel.f || L.st !== S.sel.st) {
    const kind = liveKind(L), auto = L.auto, src = L.src || 'now', cut = L.cut;
    liveOff('revert');
    const r = selCell();
    if (!r || !liveGlz(S)) return;
    liveStart(src); L = S.live;
    if (!L) return;
    // from the chart, the window's own cut-offs if it was kept from it before, else the ones carried over
    if (src === 'chart') { if (L.n) recUI.nh = recUI.nv = recUI.nc = L.n; else L.cut = cut; }
    else { liveSetKind(kind); L.auto = auto; }
  }
  const st2 = Object.assign({}, S, { sel: { f: L.f, st: L.st, unit: L.unit } }), g = liveGlz(st2), s = liveStorey(st2);
  if (!g || !S.storeys[L.st]) { S.live = null; return; }
  const m = liveCell(g, s.h, liveLen(S, L.f, L.st), 0, s.slab ?? LIVE_SLAB0), sp = liveSun(S.doy, S.hour, S.timeMode), gf = liveAz(S, L.f);
  const onFacade = sp.alt > 0 && Math.cos(liveWrap(gf - sp.az) * Math.PI / 180) > 0;
  // from the chart: what the cut-offs set ask for, whatever the hour
  // off, every member stops at the window's edges: what the rule asks for, cut to what the window looks like
  const cutToWindow = sp => { if (L.ext === false) for (const k in sp) if (sp[k]) sp[k] = Object.assign({}, sp[k], { ext: 0 }); return sp; };
  if (L.src === 'chart') { L.n = recUI.nh; L.nosol = false; liveApply(cutToWindow(chartSpec(m, L.cut))); return; }
  const Fp = { m, cur: { gf, az: sp.az, vsa: getValue('theta', st2), onFacade }, date: liveDate(S.doy), S };
  const specs = { h: idealSpec(Fp, 'h'), v: idealSpec(Fp, 'v'), c: idealSpec(Fp, 'c') };
  /* Auto: of the kinds with a solution now, the smallest for the member count
     set - each measured by the largest thing it asks for: how far it projects
     from the wall, or how tall its members stand, whichever is more - so it
     moves to another kind where its own has none */
  if (L.auto) {
    const size = k => k === 'c' ? Math.max(specs.c.Ph, specs.c.d) : specs[k].d;
    const best = ['h', 'v', 'c'].filter(k => specs[k] && specs[k].d > 0).sort((a, b) => size(a) - size(b))[0];
    if (best && liveKind(L) !== best) liveSetKind(best);
  }
  const k = liveKind(L);
  L.nosol = k === 'hv' ? !(specs.h || specs.v) : !specs[k];
  liveApply(cutToWindow(specs));
}
/* While it is on, every view says so along its top: the member counts to the
   left, and the way to turn it off to the right. */
const LIVE_VIEWS = { axon: 1, detail: 1, section: 1, plan: 1 };
const LIVE_SRC = `<select class="livesrc" aria-label="Where the members come from" title="Live shading: the ideal members for the date and time set, remade as they change. Shade from chart: members sized from cut-off angles you drag on the sun path chart - the profile angle down from the top for horizontal members, each side in from the facade's edge for a fin on that jamb.">`;
const LIVE_KINDS = [['h', 'Horizontal'], ['v', 'Vertical'], ['hv', 'Egg-crate'], ['c', 'Louvred canopy']];
function liveBar(inst) {
  let el = inst.el.querySelector('.livebar');
  const on = inst.el.querySelector('.liveon');
  if (on) on.hidden = !!S.live;
  // on the drawings only: the charts follow what it puts on the window, without a bar of their own
  const ch = inst.el.querySelector('.chartOn');
  if (ch) ch.hidden = !!(S.live && S.live.src === 'chart');
  // the sun path chart carries the bar too while the members come from it
  if (!S.live || !(LIVE_VIEWS[inst.type] || (inst.type === 'sun' && S.live.src === 'chart'))) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'livebar'; inst.el.querySelector('.v3dbar').appendChild(el); }
  const L = S.live, chart = L.src === 'chart', cutN = chart && L.cut ? ['th', 'l', 'r'].filter(k => L.cut[k] != null).join('') : '';
  const sig = [liveKind(L), L.f, L.st, !!L.auto, !!L.nosol, L.src, cutN, L.ghost ? L.ghost.label : '', L.ext !== false].join('|');
  const ext = `<label class="barchk" title="On: each member runs on past the window's edges as far as the sun slips along it, so the rule's cut-off holds across the whole glass. Off: the members stop at the window's edges, as a built design often would - and the sun comes round their ends."><input type="checkbox" class="liveext"${L.ext !== false ? ' checked' : ''}> Shading extends past window</label>`;
  const sl = (k, label) => `<label class="recn" title="How many members share the work: one deep member, or n each 1/n as deep at 1/n the spacing - the same count whichever kind is chosen"><span>${label}</span><input type="range" min="1" max="${MEMBERS_MAX}" step="1" value="${recUI.nh}" data-livn="${k}" aria-label="${label}"><output>${recUI.nh}</output></label>`;
  if (el.dataset.sig !== sig) {
    el.dataset.sig = sig;
    const kind = liveKind(L);
    const src = LIVE_SRC + [['now', 'Live shading'], ['chart', 'Shade from chart']].map(([k, l]) => `<option value="${k}"${(L.src || 'now') === k ? ' selected' : ''}>${l}</option>`).join('') + '</select>';
    if (chart) el.innerHTML = `<span class="liveset">${src}`
      + ext + (L.cut && L.cut.th != null ? sl('n', 'Members') : `<span class="livenote" title="On the sun path chart: drag the profile angle down from the top for horizontal members, or a side in from the facade's edge for a fin on that jamb">Drag the cut-offs on the sun path chart</span>`)
      + `</span><button type="button" class="minibtn liveoff" title="Turn off: keep the shading, or put back what the window had">Turn off</button>`;
    else el.innerHTML = `<span class="liveset">${src}`
      + `<label class="barchk" title="Auto: live shading picks horizontal, vertical or a louvred canopy for itself - the one whose members are smallest for the member count set, and one that works where another has no solution"><input type="checkbox" class="liveauto"${L.auto ? ' checked' : ''}> Auto</label>`
      + `<select class="livekind"${L.auto ? ' disabled' : ''} aria-label="What live shading puts on the window" title="What live shading puts on the window: horizontal members, vertical members, both, or a louvred canopy of upright members standing out from the facade">${LIVE_KINDS.map(([k, l]) => `<option value="${k}"${k === kind ? ' selected' : ''}>${l}</option>`).join('')}</select>`
      + (L.nosol ? `<span class="livenosol" title="No member of this kind, at any count, shades the whole window at this date and time without projecting more than 10 m">No solution</span>` : sl('n', 'Members'))
      + ext + `<button type="button" class="minibtn livecmp${L.ghost ? ' on' : ''}" aria-pressed="${!!L.ghost}" title="${L.ghost ? 'Comparing with ' + L.ghost.label + ': press to let the ghost go' : 'Compare: freeze this moment\'s members and profile angle as a ghost in the plan and the section, then set another date or time - peak winter against peak summer'}">${L.ghost ? 'Compare: ' + L.ghost.label : 'Compare'}</button>`
      + `</span><button type="button" class="minibtn liveoff" title="Turn off live shading: keep the shading under a name, or put back what the window had">Turn off</button>`;
  } else el.querySelectorAll('[data-livn]').forEach(i => { if (document.activeElement !== i) { i.value = recUI.nh; i.nextElementSibling.textContent = recUI.nh; } });
}
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.livn;
  if (!k) return;
  recUI.nh = recUI.nv = recUI.nc = +e.target.value; e.target.nextElementSibling.textContent = e.target.value;
  scheduleLight();
});
document.addEventListener('change', e => {
  if (e.target.dataset && (e.target.dataset.livn || e.target.dataset.recn)) schedule();
  if (e.target.matches && e.target.matches('.livekind')) api.act('liveKind', e.target.value);
  if (e.target.matches && e.target.matches('.livesrc')) api.act('liveSrc', e.target.value);
  if (e.target.matches && e.target.matches('.liveext')) api.act('liveExt', e.target.checked);
  if (e.target.matches && e.target.matches('.liveauto')) api.act('liveAuto', e.target.checked);
});
// Compare, on the bar while the optimization is on
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.livecmp')) api.act('liveCompare'); });
// From chart, from the sun path chart's own bar
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.chartOn');
  if (!b) return;
  if (!selCell() || !selUnitType()) { b.title = 'Select a window first: the members go on the selected window'; return; }
  api.act('liveSrc', 'chart');
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.liveon');
  if (!b) return;
  if (!selCell() || !selUnitType()) { b.title = 'Select a window first: live shading goes on the selected window'; return; }
  api.act('liveToggle', 'h');
});
/* Turning the optimization off asks what the window keeps: what it carried before, or the last of the optimization */
const KIND_NAME = { h: 'Ideal horizontal', v: 'Ideal vertical', hv: 'Ideal egg-crate', c: 'Ideal louvred canopy' };
function askLiveEnd(el) {
  const r = el.getBoundingClientRect(), md = liveDate(S.doy);
  const name = S.live.src === 'chart' ? 'Shading from the chart' : KIND_NAME[liveKind(S.live)] + ' - ' + MONTHS[md.m - 1] + ' ' + md.d + ', ' + hhmm(S.hour);
  // Simple keeps no library, so nothing to name: the shading is put on the window, or the window's own put back
  if (S.mode === 'simple') {
    openPop(r.left, r.bottom, `<p>Turn off live shading</p><button type="button" data-liveend="keep" data-name="${name.replace(/"/g, '&quot;')}">Apply to window</button><button type="button" data-liveend="revert">Revert</button>`);
    return;
  }
  const m = openPop(r.left, r.bottom, `<p>Turn off live shading</p><input type="text" class="livename" value="${name.replace(/"/g, '&quot;')}" spellcheck="false" aria-label="Name to keep it under" title="The name the shading keeps, in the library">`
    + '<button type="button" data-liveend="keep">Keep it, under this name</button><button type="button" data-liveend="revert">Revert to the previous shading</button>');
  const box = m.querySelector('.livename');
  box.focus(); box.select();
  box.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') m.querySelector('[data-liveend="keep"]').click(); else if (ev.key === 'Escape') closePop(); });
}
document.addEventListener('click', e => {
  const off = e.target.closest && e.target.closest('.liveoff');
  if (off) { askLiveEnd(off); return; }
  const end = e.target.closest && e.target.closest('[data-liveend]');
  if (end) {
    const m = end.dataset.liveend, box = end.parentElement && end.parentElement.querySelector('.livename'), name = box ? box.value.trim() : end.dataset.name;
    closePop();
    if (m === 'keep') { stopPlay(); H.mark('live'); liveOff('keep', S, name || null); schedule(); }
    else if (m) api.act('liveOff', m);
  }
});
function render(light = false) {
  liveUpdate();
  // the cuts kept in the saved window that is the selection, however they were moved
  keepCuts(S);
  const F = buildFrame(S, V, light);
  const { m, cur, res, sel, T } = F, md = F.date;
  const dateStr = MONTHS[md.m - 1] + ' ' + md.d, pct = res ? fmt(res.frac * 100, 1) + '%' : '—';
  const where = sel.f + ' · storey ' + (sel.st + 1) + (sel.unit !== null ? ' · unit ' + (sel.unit + 1) : '');
  const { dni } = beamAt(S.sky, S.wx, S.doy, S.hour, S.timeMode);

  // every view on the page, each on its own sheet
  const ctx = { dni, light, studies: {}, frames: {} };
  for (const inst of insts()) drawInst(inst, F, ctx);
  const study = ctx.studies.now || roomStudy(F, dni, light);
  // design recommendations: the selected window's face, at this instant; the bar says which, so it reads collapsed
  lastF = F;
  $('dockFor').textContent = recFor(F);
  putRec($('rec2'), recGeometry(F));
  $('rec3').innerHTML = recBylaw(F);

  // the solar heat coming in, under the settings that say what it is for: the day's and the year's as they are ready
  const unit = m.opening && cur.onFacade ? unitGain(m, cur.sl, dni, 61, 49, cur.frac) : null;
  const tot = T.items.length ? (S.scope === 'unit' && unit ? unit : targetGain(T, cur.alt, cur.az, cur.up ? dni : 0)) : null;
  const now = tot ? Object.assign({}, tot, { dni, cos: unit ? cur.sl[2] : 0, lit: unit ? unit.lit : 0, shgc: m.shgc, count: T.units }) : null;
  $('calc4').innerHTML = now ? resGain(F, now, getDayGain(T, S), getYearGain(T, S))
    : '<p class="calcnote">No glazing in what the results are for: add a window system under Window Parameters.</p>';
  if (!light) {
    $('checks').innerHTML = renderChecks(F);
    $('energyRules').innerHTML = renderEnergy(S);
    syncRail(S); refreshTypes();
  } else syncClock(S);
  pinnedBars();
}

/* A member count being slid on a recommendation is kept in hand: the
   recommendations are put back part by part round it, never over it. */
let lastF = null;
function putRec(host, html) {
  const act = document.activeElement, mine = act && host.contains(act) && act.tagName === 'INPUT';
  const t = document.createElement('template'); t.innerHTML = html;
  // the control in hand is a member count or a name being typed: it stays, if what is redrawn still has it
  const sel = !mine ? null : act.dataset.recn ? `[data-recn="${act.dataset.recn}"]` : act.dataset.for ? `[data-ideal="${act.dataset.for}"]` : null;
  if (!sel || !t.content.querySelector(sel)) { host.innerHTML = html; return; }
  host.querySelectorAll('[data-part]').forEach(el => { const n = t.content.querySelector(`[data-part="${el.dataset.part}"]`); if (n) el.replaceWith(n); });
}
$('recs').addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.recn;
  if (!k || !lastF) return;
  recUI.nh = recUI.nv = recUI.nc = +e.target.value;
  const o = e.target.parentElement.querySelector('output'); if (o) o.textContent = e.target.value;
  putRec($('rec2'), recGeometry(lastF)); $('rec3').innerHTML = recBylaw(lastF);
  // live, the window's members follow the count
  if (S.live) scheduleLight();
});

/* An ideal made a shading system type: named in place of its button, and put on the selected window */
$('recs').addEventListener('click', e => {
  const lv = e.target.closest('[data-live]');
  if (lv) {
    // the last kind turned off ends the optimization: ask what the window keeps
    const L = S.live, d = lv.dataset.live, last = L && L[d] && ['h', 'v', 'c'].filter(k => L[k]).length === 1;
    if (last) askLiveEnd(lv); else api.act('liveToggle', d);
    return;
  }
  const b = e.target.closest('[data-ideal]');
  if (!b || !lastF) return;
  const spec0 = idealSpec(lastF, b.dataset.ideal);
  if (!spec0) return;
  const box = document.createElement('input');
  box.type = 'text'; box.className = 'vname idealname'; box.dataset.for = b.dataset.ideal; box.value = spec0.name; box.placeholder = spec0.name; box.spellcheck = false;
  box.setAttribute('aria-label', 'Name of the new shading system type'); box.title = 'Tab takes the suggested name; Enter makes it and puts it on the selected window; Escape leaves it';
  b.hidden = true; b.after(box); box.focus(); box.select();
  let over = false;
  const close = ok => {
    if (over) return; over = true;
    const name = box.value; box.remove(); b.hidden = false;
    // the ideal as it stands when the name is entered: the member count may have been changed meanwhile
    const spec = ok && lastF && idealSpec(lastF, b.dataset.ideal);
    if (spec) { stopPlay(); H.mark('library'); shadingFromIdeal(spec, name); schedule(); }
  };
  box.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') close(true); else if (ev.key === 'Escape') close(false); });
  box.addEventListener('blur', () => close(false));
});

let raf = null, rafLight = null, heavyTimer = null;
const scheduleLight = () => { if (!rafLight) rafLight = requestAnimationFrame(() => { rafLight = null; render(true); }); };
const schedule = () => {
  if (!raf) raf = requestAnimationFrame(() => { raf = null; render(); });
  clearTimeout(heavyTimer);
  heavyTimer = setTimeout(heavyPass, 170);
};
/** the sky mask, the totals over a storey or more, and the room's day and
 *  year maps are too slow for every tick, so they settle once a control is let
 *  go - one study a turn, the page redrawn after each, so that on a big
 *  building the figures arrive one by one and the page never waits on all */
function heavyPass() {
  const F = buildFrame(S, V);
  const steps = [
    [() => maskStale(F.T), () => getMask(F.T, true)],
    [() => envStale(F.T), () => getEnvelopes(F.T, true)],
    [() => dayGainStale(F.T, S), () => getDayGain(F.T, S, true)],
    [() => yearGainStale(F.T, S), () => getYearGain(F.T, S, true)],
    ...[...new Map(insts().filter(i => i.type === 'plan' && i.V.inMode !== 'now').map(i => {
      const pin = i.pin && S.activeView !== i.pin && savedWindow(S, i.pin) ? i.pin : '';
      return [pin + '|' + i.V.inMode, { mode: i.V.inMode, pin }];
    })).values()].map(({ mode, pin }) => {
      const Fx = pin ? buildFrame(windowState(S, pin), V) : F, Sx = Fx.S;
      return [() => Fx.m.opening && (PLAN_LIGHT[S.scope] === 'unit' ? floorStale(Fx.m, Sx, mode) : floorAllStale(Fx, mode)),
        () => PLAN_LIGHT[S.scope] === 'unit' ? getFloor(Fx.m, roomOf(Fx.m, Sx), Sx, mode, true) : getFloorAll(Fx, lightUnits(Fx), roomOf(Fx.m, Sx), mode, true)];
    })];
  for (const [stale, run] of steps) if (stale()) {
    run(); render();
    heavyTimer = setTimeout(heavyPass, 0);
    return;
  }
}

/* ---------- playing the day: clock time advances with real time ---------- */
let anim = null;
const DAY_SECONDS = 13;
function stopPlay() {
  if (!anim) return;
  cancelAnimationFrame(anim.raf); anim = null;
  $('playBtn').textContent = '▶ Play day'; $('playBtn').classList.remove('on');
}
function togglePlay() {
  if (anim) { stopPlay(); render(); return; }
  $('playBtn').textContent = '■ Stop'; $('playBtn').classList.add('on');
  const ss = sunriseSunsetSolar(S.doy);
  const a = ss ? Math.max(0, solarToClock(ss[0], S.doy, S.timeMode) - 0.4) : 4;
  const b = ss ? Math.min(24, solarToClock(ss[1], S.doy, S.timeMode) + 0.4) : 20;
  if (S.hour < a || S.hour > b) S.hour = a;
  anim = { a, b, rate: (b - a) / DAY_SECONDS, last: performance.now(), drawn: 0, raf: 0 };
  const step = now => {
    S.hour += Math.min(0.12, (now - anim.last) / 1000) * anim.rate;
    anim.last = now;
    if (S.hour > anim.b) S.hour = anim.a;
    if (now - anim.drawn > 40) { anim.drawn = now; render(true); }   // capped at 25 frames a second
    anim.raf = requestAnimationFrame(step);
  };
  anim.raf = requestAnimationFrame(step);
}

/* ---------- history ---------- */
function afterRestore() { applyMode(); resetStudies(); resetGains(); clearSunCache(); schedule(); }
/* ---------- Simple and Advanced ----------
   Simple: one storey, one window a side, shading devices kept on each window,
   results for the selected window; no storeys to add, no typologies, no site
   boundary, no library, no export. The mode is the design's, so undo takes it
   back with the design. Each mode keeps the design it was left with: going
   back and forth asks whether to carry the one on screen across or to return
   to the other's; a design Simple cannot show is never carried into it. */
const stash = { simple: null, advanced: null };
const cloneS = () => JSON.parse(JSON.stringify(S));
function loadDesign(o) { const x = JSON.parse(JSON.stringify(o)); for (const k of Object.keys(S)) if (!(k in x)) delete S[k]; Object.assign(S, x); }
function applyMode() {
  const simple = S.mode === 'simple';
  document.body.classList.toggle('simple', simple);
  V.simple = simple;
  if (simple) S.scope = 'unit';
  document.querySelectorAll('.modeseg [data-mode]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)); b.setAttribute('aria-checked', String(b.dataset.mode === S.mode)); });
  try { localStorage.setItem(MODE_KEY, S.mode); } catch (_) { }
}
let modeTo = null;
function enterMode(m, how) {
  stopPlay(); H.mark('mode');
  if (S.live) liveOff('revert');
  closeWidget(SW); closeWidget(SITEW); V.siteEdit = false; S.pick = null; picked = null; hideWidget(POP); V.plate.on = false;
  stash[S.mode] = cloneS();
  if (how === 'stash' && stash[m]) loadDesign(stash[m]);
  else if (how === 'default') { applyTypology('blank'); S.matchAbove.sides = false; }
  S.mode = m; applyMode(); recentre(); afterRestore();
}
function askMode(m, btn) {
  if (m === S.mode) return;
  const r = btn.getBoundingClientRect(), other = stash[m];
  modeTo = m;
  if (m === 'advanced') {
    if (!other) { enterMode(m, 'continue'); return; }
    openPop(r.left, r.bottom, '<p>Advanced mode</p><button type="button" data-modego="continue">Continue with the simple model</button><button type="button" data-modego="stash">Return to the advanced model</button><button type="button" data-modego="">Cancel</button>');
    return;
  }
  const fits = fitsSimple(S);
  if (fits && !other) { enterMode(m, 'continue'); return; }
  openPop(r.left, r.bottom, '<p>Simple mode</p>' + (fits ? '' : '<span class="popnote">Simple shows one storey with one window on each side. This design is kept, to come back to in Advanced.</span>')
    + (fits ? '<button type="button" data-modego="continue">Continue with this model</button>' : '')
    + (other ? '<button type="button" data-modego="stash">Return to the simple model</button>' : '')
    + '<button type="button" data-modego="default">Start from the default block</button><button type="button" data-modego="">Cancel</button>');
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-mode]');
  if (b && b.closest('.modeseg')) { askMode(b.dataset.mode, b); return; }
  const g = e.target.closest && e.target.closest('[data-modego]');
  if (g) { const how = g.dataset.modego; closePop(); if (how && modeTo) enterMode(modeTo, how); }
});
/* A view taken off the page is kept, with where it stood, so Undo puts it back
   - itself, its camera and all - and Redo takes it off again. */
const viewUndo = [], viewRedo = [];
function takeView(v, redoing = false) {
  const row = v.parentElement, nextView = (() => { let n = v.nextElementSibling; while (n && !n.classList.contains('view')) n = n.nextElementSibling; return n; })();
  let nextRow = row && row.nextElementSibling; while (nextRow && !nextRow.classList.contains('vrow')) nextRow = nextRow.nextElementSibling;
  viewUndo.push({ el: v, row, nextView, nextRow, host: row && row.parentElement, at: H.undo.length });
  if (!redoing) viewRedo.length = 0;
  removeView(v); H.onChange();
}
function putView(o) {
  if (o.row && !o.row.isConnected) o.host.insertBefore(o.row, o.nextRow && o.nextRow.isConnected ? o.nextRow : null);
  o.row.insertBefore(o.el, o.nextView && o.nextView.parentElement === o.row ? o.nextView : null);
  viewRedo.push({ el: o.el, at: o.at });
  margins(); saveLayout(); H.onChange(); clearSunCache(); schedule();
}
function wireHistory() {
  const u = $('undoBtn'), r = $('redoBtn');
  H.onChange = () => {
    u.disabled = !H.undo.length && !viewUndo.length; r.disabled = !H.redo.length && !viewRedo.length;
    u.title = 'Undo the last edit (Ctrl+Z) · ' + H.undo.length + ' to go back through';
    r.title = 'Redo (Ctrl+Shift+Z) · ' + H.redo.length + ' to come forward through';
  };
  // a view taken off is undone in its turn among the edits: it went after the edits before it
  const back = () => {
    stopPlay();
    const last = viewUndo[viewUndo.length - 1];
    if (last && last.at >= H.undo.length) { putView(viewUndo.pop()); return; }
    if (H.back()) afterRestore();
  };
  const fwd = () => {
    stopPlay();
    const nx = viewRedo[viewRedo.length - 1];
    if (nx && nx.at === H.undo.length) { takeView(viewRedo.pop().el, true); return; }
    if (H.forward()) afterRestore();
  };
  const mark0 = H.mark;
  H.mark = (...a) => { viewRedo.length = 0; return mark0(...a); };
  u.addEventListener('click', back);
  r.addEventListener('click', fwd);
  // a drag holds its run open, and letting go closes it: one drag, one step
  addEventListener('pointerdown', () => { H.hold = true; }, true);
  addEventListener('pointerup', () => H.release(), true);
  addEventListener('pointercancel', () => H.release(), true);
  addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = (e.key || '').toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    const t = e.target;                   // a text field keeps its own undo
    if (t && t.tagName === 'INPUT' && /^(text|search|number|email|url|password)$/.test(t.type)) return;
    e.preventDefault();
    (k === 'y' || e.shiftKey) ? fwd() : back();
  });
  H.onChange();
}

/* ---------- selecting a condition: the cuts go back to the middle of its glass ---------- */
function recentre() {
  if (selectionChanged(S)) return;
  const m = buildFrame(S, V, true).m;
  S.cutU = 0;
  S.cutV = m.opening ? (m.sill + m.head) / 2 : m.storeyH / 2;
}
function select(f, st, unit) {
  stopPlay();
  S.sel.f = f; S.sel.st = st; S.sel.unit = unit; brkUI.pending = false;
  recentre(); schedule();
}

/* ---------- context buildings: placed by a click in the site view, picked by one ---------- */
const siteViews = () => insts().filter(i => i.type === 'axon');
function endPlacing() { V.place.on = false; V.place.P = null; document.querySelectorAll('.view .v3dhost.placing').forEach(h => h.classList.remove('placing')); }
function placeContext(P) { stopPlay(); H.mark('ctx:place'); addContextAt(P); endPlacing(); openSite(); schedule(); }
function selectContext(id) { stopPlay(); setValue('site.ctxSel', id); if (id) V.plate.on = false; schedule(); }
/** the panel's Site Parameters opened, so the building just placed or picked can be set */
function openSite() { const d = $('siteHost') && $('siteHost').closest('details'); if (d) d.open = true; }
/* A small menu at the pointer, closed by a click anywhere else or by Esc. */
let popMenu = null;
function closePop() { if (popMenu) { const m = popMenu; popMenu = null; m.remove(); if (m._onClose) m._onClose(); } }
function openPop(x, y, html, onClose) {
  closePop();
  const m = document.createElement('div');
  m.className = 'ctxmenu'; m.innerHTML = html; m._onClose = onClose;
  Object.assign(m.style, { left: Math.round(x + window.scrollX + 4) + 'px', top: Math.round(y + window.scrollY + 4) + 'px' });
  document.body.appendChild(m);
  // kept on the screen
  const r = m.getBoundingClientRect();
  if (r.right > window.innerWidth - 8) m.style.left = Math.round(window.innerWidth - r.width - 8 + window.scrollX) + 'px';
  if (r.bottom > window.innerHeight - 8) m.style.top = Math.round(window.innerHeight - r.height - 8 + window.scrollY) + 'px';
  popMenu = m;
  return m;
}
document.addEventListener('pointerdown', e => { if (popMenu && !popMenu.contains(e.target)) closePop(); }, true);
/** an Alt-drag let go: the massing it left is a copy - its own - or an instance, which takes the other's pushes and pulls */
function askInstance(fromId, id, x, y) {
  const m = openPop(x, y, '<p>The obstruction dragged off is</p><button type="button" data-ci="copy" title="Its own massing: edits to one do not touch the other">A copy</button>'
    + '<button type="button" data-ci="inst" title="An instance: a face pushed or pulled on one is pushed or pulled on all its instances, each in its own axes. Where each stands is its own.">An instance</button>');
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-ci]');
    if (!b) return;
    if (b.dataset.ci === 'inst') { H.mark('ctx:instance'); instanceContext(S, fromId, id); schedule(); }
    closePop();
  });
}

/* The Place Context Massing button can also be dragged straight out: the
   ghost follows the pointer over the site view, and letting go there places
   the massing; let go anywhere else, nothing is placed. A plain click still
   waits for a click in the site view. */
let swallowClick = false;
document.addEventListener('click', e => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest('[data-act="placeContext"]');
  if (!b || e.button !== 0) return;
  const x0 = e.clientX, y0 = e.clientY;
  let dragging = false;
  const viewAt = ev => { const el = document.elementFromPoint(ev.clientX, ev.clientY), v = el && el.closest('.view[data-type=axon]'); return v && v._inst; };
  const groundOf = (inst, ev) => { const p = viewPoint(inst.host, ev); return p ? axonCamera(S, inst.V.axcam).ground(p[0], p[1]) : null; };
  const move = ev => {
    if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
    if (!dragging) { dragging = true; stopPlay(); V.place.on = true; V.place.P = null; document.body.classList.add('placedrag'); schedule(); }
    const inst = viewAt(ev);
    V.place.P = inst ? groundOf(inst, ev) : null;
    for (const i of siteViews()) paint(i);
  };
  const up = ev => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    document.body.classList.remove('placedrag');
    if (!dragging) return;
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
    const inst = viewAt(ev), P = inst && groundOf(inst, ev);
    if (P) placeContext(P); else { endPlacing(); schedule(); }
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  e.preventDefault();
}, true);

// Esc stops placing, or lets the selected massing go; Delete or Backspace removes the selected one
document.addEventListener('keydown', e => {
  const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (e.key === 'Escape' && popMenu) { closePop(); return; }
  if (e.key === 'Escape' && V.place.on) { endPlacing(); schedule(); return; }
  if (e.key === 'Escape' && V.plate.on && !(S.site && S.site.ctxSel)) { V.plate.on = false; schedule(); return; }
  const id = S.site && S.site.ctxSel;
  // a window picked: its side's windows taken off; a storey's wall picked in the site view: the storey taken out
  if (!id && !typing && (e.key === 'Delete' || e.key === 'Backspace')) {
    // a shading device picked: it comes out of its shading system
    if (S.pick === 'device' && selCell()) { e.preventDefault(); stopPlay(); H.mark('device'); removeDevice(); S.pick = null; hideWidget(POP); schedule(); return; }
    if (picked === 'wall' && V.plate.on && S.storeys.length > 1 && S.mode !== 'simple') { e.preventDefault(); stopPlay(); H.mark('storey'); removeStorey(S.sel.st); picked = null; recentre(); schedule(); return; }
    if ((picked === 'window' || S.pick === 'window') && selCell()) { e.preventDefault(); stopPlay(); H.mark('window'); removeGlazing(); schedule(); return; }
  }
  if (!id || typing) return;
  if (e.key === 'Escape') { setValue('site.ctxSel', null); schedule(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); stopPlay(); H.mark('ctx:delete'); removeContext(id); schedule(); }
});

/* ---------- the panel's actions ---------- */
const ACTS = {
  selStorey: a => { const i = +a; if (i < 0 || i >= S.storeys.length) return; S.sel.st = i; S.sel.unit = null; brkUI.pending = false; recentre(); },
  selFacade: a => { S.sel.f = a; S.sel.unit = null; brkUI.pending = false; recentre(); },
  selUnit: a => { S.sel.unit = Math.max(0, +a); brkUI.pending = false; },
  // breaking a window out of its array, and binding it back; the floors above follow when set to
  // the part is 'win' (the window) or 'shd' (its shading), each broken and bound back on its own
  breakUnit: () => { H.mark('break'); breakUnit(S, 'win'); breakUnit(S, 'shd'); matchAbove(); },
  rebindRevert: () => { H.mark('break'); for (const p of ['win', 'shd']) rebindUnit('revert', 'keep', S, p); brkUI.pending = false; matchAbove(); },
  rebindApply: () => {
    if (otherBroken(S, 'win').length || otherBroken(S, 'shd').length) { brkUI.pending = 'win'; return; }
    H.mark('break'); for (const p of ['win', 'shd']) rebindUnit('apply', 'keep', S, p); matchAbove();
  },
  rebindApplyAll: () => { H.mark('break'); for (const p of ['win', 'shd']) rebindUnit('apply', 'rebind', S, p); brkUI.pending = false; matchAbove(); },
  rebindApplyKeep: () => { H.mark('break'); for (const p of ['win', 'shd']) rebindUnit('apply', 'keep', S, p); brkUI.pending = false; matchAbove(); },
  rebindCancel: () => { brkUI.pending = false; },
  rebindAll: () => { H.mark('break'); for (const p of ['win', 'shd']) rebindAll(S, p); matchAbove(); },
  // shading added to the selected window from its small window; a device of it picked, to shape in the plan or the section; or taken off
  // shading added from the window's small window: on a plan or a section the new device is picked, to shape there
  addShading: v => {
    H.mark('device');
    const h0 = selShading(S), n0 = h0 ? h0.devices.length : 0;
    if (!addShading(v)) return;
    const h1 = selShading(S), n1 = h1 ? h1.devices.length : 0;
    // one device added - a blade, a fin, a one-member preset - is picked and its pop-over opened; so is anything added on a plan or a section
    if (n1 - n0 === 1 || (POP.at && (POP.at.type === 'section' || POP.at.type === 'plan'))) { const r = selCell(); ACTS.pickDev(r ? r.dev || 0 : 0); }
  },
  pickDev: a => {
    // isolated in the building view, the device is picked there, to pull its depth by its tip
    if (POP.at && POP.at.type === 'axon' && (POP.at.V.iso || S.mode === 'simple')) { if (S.live) return; const r = selCell(); if (r) r.dev = +a; S.pick = 'device'; return; }
    const h = selShading(S), D = h && S.lib.devices[h.devices[+a]], want = D && D.dir === 'v' ? 'plan' : 'section';
    pickOnly(+a, insts().find(x => x.type === want) || insts().find(x => x.type === 'section' || x.type === 'plan') || null);
  },
  // the window isolated in the building view, or the building back
  // back from a device to the window, in the building view
  isoWinPick: () => { S.pick = 'window'; picked = 'window'; },
  isoWin: () => {
    const inst = POP.at && POP.at.type === 'axon' ? POP.at : insts().find(x => x.type === 'axon');
    if (!inst) return;
    inst.V.iso = !inst.V.iso;
    if (inst.V.iso) {
      V.plate.on = false; closeWidget(SW); closeWidget(SITEW); V.siteEdit = false; if (S.site && S.site.ctxSel) setValue('site.ctxSel', null);
      // and the camera closes in on it, as Zoom to selected does
      const z = inst.el.querySelector('.axZoom'); if (z) setTimeout(() => z.click(), 0);
    }
    else if (S.pick === 'device') S.pick = 'window';
  },
  delDev: a => { H.mark('device'); const r = selCell(); if (r) r.dev = +a; removeDevice(); },
  addSavedWindow: id => { H.mark('window'); addSavedWindow(id); recentre(); },
  // the storey's own small window, opened from the window's
  openStorey: () => { const i = POP.at && POP.at.type === 'axon' ? POP.at : insts().find(x => x.type === 'axon'); if (i) { V.plate.on = true; openWidget(SW, i); } },
  // the site: a preset, or every side's condition turned on to the next
  sitePreset: k => { H.mark('site'); applySitePreset(k); },
  // the selected obstruction's small window
  ctxUnique: () => { const id = S.site && S.site.ctxSel; if (id) { H.mark('ctx:unique'); makeUnique(S, id); } },
  ctxDelete: () => { const id = S.site && S.site.ctxSel; if (id) { H.mark('ctx:delete'); removeContext(id); } },
  siteRotate: () => { H.mark('site'); rotateSite(); },
  // live optimization, from a recommendation's card, or off from any view
  liveToggle: d => { H.mark('live'); liveToggle(d === 'v' || d === 'c' ? d : 'h'); if (S.pick === 'device') S.pick = null; },
  liveOff: m => { H.mark('live'); liveOff(m === 'revert' ? 'revert' : 'keep'); },
  liveKind: k => { H.mark('live'); liveSetKind(k); },
  liveCompare: () => {
    H.mark('live');
    const L = S.live;
    if (!L) return;
    // let go, the ghost takes the clock back to the moment it was frozen at
    if (L.ghost) { S.doy = L.ghost.doy; S.hour = L.ghost.hour; if (L.ghost.n) recUI.nh = recUI.nv = recUI.nc = L.ghost.n; liveCompare(); return; }
    const F = lastF, md = liveDate(S.doy);
    liveCompare({ label: MONTHS[md.m - 1] + ' ' + md.d + ' ' + hhmm(S.hour), doy: S.doy, hour: S.hour, n: recUI.nh, th: F && F.cur.onFacade ? F.cur.vsa : null, gam: F ? -F.cur.gamma : null });
  },
  liveExt: on => { H.mark('live'); if (S.live) S.live.ext = !!on; },
  liveSrc: k => {
    H.mark('live'); liveStart(k === 'chart' ? 'chart' : 'now'); if (S.pick === 'device') S.pick = null;
    // the member count the window's chart cut-offs were kept with
    if (S.live && S.live.src === 'chart' && S.live.n) recUI.nh = recUI.nv = recUI.nc = S.live.n;
  },
  liveAuto: on => { H.mark('live'); if (S.live) S.live.auto = !!on; },
  delSaved: a => { const k = String(a).slice(0, String(a).indexOf(':')), id = String(a).slice(String(a).indexOf(':') + 1); deleteSaved(k, id); },
  selDevice: a => { pickOnly(+a, null); },
  addStorey: () => { H.mark('storey'); addStorey(); recentre(); },
  insStorey: a => { H.mark('storey'); insertStorey(a === 'below' ? 'below' : 'above'); recentre(); },
  dupStorey: a => { H.mark('storey'); duplicateStorey(S, a === 'below' ? 'below' : 'above'); recentre(); },
  moveStorey: a => { H.mark('storey'); moveStorey(+a); recentre(); },
  delStorey: a => { H.mark('storey'); removeStorey(+a); recentre(); },
  // a bare side's single window, from its own small window
  addWin: () => { H.mark('window'); addWindow(); recentre(); },
  matchPlate: a => { H.mark('storey'); setValue('matchPlate', a === '1' || a === true); },
  rotBelow: a => { H.mark('storey'); setValue('rotBelow', a === '1' || a === true); },
  // the library: systems, units and shading made new, picked, copied, or deleted when unused
  newSystem: a => { H.mark('library'); newSystemHere(a); recentre(); },
  useSystem: a => { H.mark('library'); useSystem(a); recentre(); },
  newUnit: a => { H.mark('library'); newUnitHere(a); recentre(); },
  useUnit: a => { H.mark('library'); setValue('g.unit', a); recentre(); },
  newShading: a => { H.mark('library'); applyShadingPreset(a); },
  dup: a => { H.mark('library'); duplicateHere(a); },
  delEntry: a => { const [k, id] = String(a).split(':'); H.mark('library'); deleteEntry(k, id); },
  delGlazing: () => { H.mark('glazing'); removeGlazing(); recentre(); },
  addDevice: a => { H.mark('device'); addDevice(a === 'v' ? 'v' : 'h'); },
  addSavedDevice: a => { H.mark('device'); addSavedDevice(a); },
  delDevice: () => { H.mark('device'); removeDevice(); },
  createArray: () => { H.mark('array'); createArray(); },
  removeArray: () => { H.mark('array'); removeArray(); },
  preset: a => { H.mark('shpreset'); applyShadingPreset(a); },
  copyGo: () => {
    const what = { height: copyUI.what.height, glazing: copyUI.what.glazing, shading: copyUI.what.shading };
    const targets = [...copyUI.targets].map(k => { const [f, st] = k.split(':'); return { f, st: +st }; });
    if (!targets.length || !(what.height || what.glazing || what.shading)) {
      copyUI.note = 'Tick something to copy and at least one condition to copy it to.'; return;
    }
    H.mark('copy');
    const r = copyCondition(what, targets);
    copyUI.note = (r.done.length ? 'Applied to ' + r.done.join(', ') + '.' : 'Nothing was changed.')
      + (r.skipped.length ? ' Passed over: ' + r.skipped.join('; ') + '.' : '');
  },
  copyClear: () => { copyUI.targets.clear(); copyUI.note = ''; },
  delWindow: a => { H.mark('saveview'); removeWindow(a); for (const i of insts()) if (i.pin === a) setPin(i, null); },
  // a context building: placed with a click in the site view - or, with none on the page, just south of the site
  placeContext: () => { if (siteViews().length) { V.place.on = true; V.place.P = null; } else { H.mark('ctx:place'); addContextAt(null); } },
  cancelContext: () => endPlacing(),
  delContext: a => { H.mark('ctx:delete'); removeContext(a); }
};

/* A name box that suggests a name - in grey, as its placeholder - takes it
   with Tab, and stays open to be added to. */
document.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || !t || !t.matches || !t.matches('input.vname, input.namebox')) return;
  if (t.value || !t.placeholder) return;
  e.preventDefault();
  t.value = t.placeholder; t.setSelectionRange(t.value.length, t.value.length);
  t.dispatchEvent(new Event('input', { bubbles: true }));
}, true);

// Escape lets go of what is picked, and every handle with it
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))) return;
  if (SITEW.st !== 'closed') { closeWidget(SITEW); V.siteEdit = false; schedule(); }
  // a window isolated in a building view: the building back first
  const iso = insts().filter(i => i.type === 'axon' && i.V.iso);
  if (iso.length) { iso.forEach(i => { i.V.iso = false; }); if (S.pick === 'device') S.pick = 'window'; schedule(); return; }
  if (S.pick) pick(null);
});

/* a bar's menu - Layers, Site, Library, Export - closes on a click anywhere outside it, or on Escape */
document.addEventListener('pointerdown', e => {
  for (const d of document.querySelectorAll('details.dd[open]')) if (!d.contains(e.target)) d.open = false;
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') for (const d of document.querySelectorAll('details.dd[open]')) d.open = false; });
/* the small windows' own buttons and menus: each does its action, as the panel's did; a name typed in a title is kept on Enter or leaving it */
/* A name's icons: save it to the library under that name; or copy it for this use alone, the copy's name asked for - its own, numbered */
document.addEventListener('pointerdown', e => {
  const b = e.button === 0 && e.target.closest && e.target.closest('.devpop [data-ico]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const [act, kind] = b.dataset.ico.split(':'), r = b.getBoundingClientRect();
  if (act === 'rename') {
    const key = b.dataset.key, cur = getValue(key);
    openName(r.left - 150, r.bottom + 14, cur || '', name => api.set(key, name));
    return;
  }
  openName(r.left - 150, r.bottom + 14, copyName(kind), name => { stopPlay(); H.mark('copy'); copyEntry(kind, name); schedule(); });
}, true);
document.addEventListener('change', e => {
  const t = e.target;
  if (!(t.matches && t.matches('.devpop select[data-pick]'))) return;
  const kind = t.dataset.pick, id = t.value;
  stopPlay(); H.mark('library');
  if (kind === 'device') setValue('d.type', id); else if (kind === 'group') setValue('g.shd', id); else setValue('g.sys', id);
  if (kind === 'group') { const rr = selCell(); if (rr) rr.dev = 0; }
  schedule();
});
document.addEventListener('pointerdown', e => {
  const b = e.button === 0 && e.target.closest && e.target.closest('.devpop button[data-pact]');
  if (!b || b.disabled) return;
  e.preventDefault(); e.stopPropagation();
  api.act(b.dataset.pact, b.dataset.v);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (!t.matches) return;
  if (t.matches('.devpop select[data-pact]')) { const v = t.value; t.value = ''; if (v) api.act(t.dataset.pact, v); }
  else if (t.matches('.devpop input[data-name]')) { const v = t.value.trim(); if (v) api.set(t.dataset.name, v); }
  else if (t.matches('.devpop select[data-k]')) api.set(t.dataset.k, t.value);
});
document.addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('.devpop input[data-name]')) { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); }
}, true);

/* ---------- boot ---------- */
buildRail($('rail'));
buildCalcBar($('calcBar'));
applyMode();
const prose = staticProse();
for (const id of ['energyIntro', 'method', 'sources']) $(id).innerHTML = prose[id];
// a figure's calculation opens from its ƒ, and stays open as the page redraws, until it is closed or another opens
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-fx]');
  if (b) {
    fxUI.open = fxUI.open === b.dataset.fx ? null : b.dataset.fx;
    document.querySelectorAll('[data-fx]').forEach(x => { const on = x.dataset.fx === fxUI.open; x.setAttribute('aria-expanded', String(on)); const p = x.parentElement.querySelector('.fxpop'); if (p) p.hidden = !on; });
    return;
  }
  if (fxUI.open && !(e.target.closest && e.target.closest('.fxpop'))) {
    fxUI.open = null;
    document.querySelectorAll('.fxpop').forEach(p => { p.hidden = true; });
    document.querySelectorAll('[data-fx]').forEach(x => x.setAttribute('aria-expanded', 'false'));
  }
});
const api = {
  set(k, v) {
    stopPlay(); H.mark('c:' + k); setValue(k, v);
    if (k === 'matchSides' && !v && S.mode === 'simple') unlinkSides(S);
    // an array typed down to nothing goes back to one member
    if ((k === 'a.len' || k === 'a.arrN' || k === 'a.arrSp') && arrayGone(k, v)) setValue('a.on', false);
    schedule();
  },
  // a value slid by its name: drawn lightly as it moves, settled when let go
  scrub(k, v) { stopPlay(); H.mark('c:' + k); H.hold = true; setValue(k, v); scheduleLight(); },
  scrubEnd() { H.release(); schedule(); },
  refresh() { syncRail(S); },
  act(name, arg) { stopPlay(); if (ACTS[name]) { ACTS[name](arg); schedule(); } },
  typology(k) { stopPlay(); H.mark('typology'); applyTypology(k); recentre(); schedule(); },
  play: togglePlay,
  async exportRhino() {
    const btn = $('expBtn'), say = t => { $('expNote').textContent = t; };
    btn.disabled = true;
    try { await exportRhino(S, say); }
    catch (e) { say('Could not export: ' + (e && e.message ? e.message : e) + ' — rhino3dm could not be loaded. Run the project from its folder to use the local copy, or connect once for the CDN.'); }
    finally { btn.disabled = false; }
  }
};
wireRail($('rail'), S, api);
/* A weather file of the user's own: Load an .epw file… opens the file chooser -
   the list keeps showing the file in use meanwhile - and the file read in joins
   the list under its own name, and is used. */
{
  const sel = $('c_wx'), inp = $('epwFile');
  sel.addEventListener('change', e => {
    if (sel.value !== '__epw') return;
    e.stopImmediatePropagation(); sel.value = S.wx; inp.value = ''; inp.click();
  }, true);
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      const rec = parseEpw(await f.text()), name = f.name.replace(/\.epw$/i, '') + (rec.tz !== -8 && isFinite(rec.tz) ? ' (UTC' + (rec.tz >= 0 ? '+' : '−') + Math.abs(rec.tz) + ', read as PST)' : '');
      const key = addWeather(name, rec), o = document.createElement('option');
      o.value = key; o.textContent = name; sel.insertBefore(o, sel.querySelector('option[value="__epw"]'));
      api.set('wx', key); clearSunCache();
    } catch (err) { alert('Could not read ' + f.name + ': ' + (err && err.message ? err.message : err)); }
  });
}
wireRail($('calcBar'), S, api);
// a figure in a drawing clicked: a box opens on it to type the value
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('.view [data-edit]');
  if (!el) return;
  e.stopPropagation();
  const k = el.getAttribute('data-edit'), txt = el.tagName.toLowerCase() === 'text' ? el : el.nextElementSibling || el;
  openFloatEdit(txt, k, S, api);
});
// a choice on a drawing's bar pressed: it sets its value, as the panel would - on the press, since the
// drawing can be redrawn under the pointer before it is let go
document.addEventListener('pointerdown', e => {
  const el = e.button === 0 && e.target.closest && e.target.closest('.view [data-set], .devpop [data-set]');
  if (!el) return;
  e.stopPropagation();
  const v = el.getAttribute('data-v');
  api.set(el.getAttribute('data-set'), v === 'true' ? true : v === 'false' ? false : v);
});
// the panel at the side and the settings along the top each tuck away, and come back
const TUCKED = { barTuck: 'the calculation settings', gainTuck: 'the solar heat gain' };
for (const [btn, cls, open, shut] of [['barTuck', 'bartucked', '▴', '▾'], ['gainTuck', 'gaintucked', '▴', '▾']]) $(btn).addEventListener('click', () => {
  const on = document.body.classList.toggle(cls);
  $(btn).textContent = on ? shut : open; $(btn).setAttribute('aria-expanded', String(!on));
  $(btn).title = (on ? 'Bring back ' : 'Tuck away ') + TUCKED[btn];
  barHeight(); fitFull(); fitDock(); clearSunCache(); render();
});
// the time settings and a view's note close when the page is clicked anywhere else
document.addEventListener('pointerdown', e => {
  const t = e.target;
  document.querySelectorAll('.infopop:not([hidden])').forEach(p => {
    if (!p.contains(t) && !(t.closest('[data-info]') && t.closest('.view') === p.closest('.view'))) { p.hidden = true; p.closest('.view').querySelector('[data-info]').setAttribute('aria-expanded', 'false'); }
  });
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-info]');
  if (!b) return;
  const p = b.closest('.view').querySelector('.infopop'), open = p.hidden;
  document.querySelectorAll('.infopop').forEach(x => { x.hidden = true; });
  p.hidden = !open; b.setAttribute('aria-expanded', String(open));
});
/* Minimise folds a view to its bar. Full screen lays the view over the
   drawings only - the panel on the left and the calculation settings stay -
   and draws its sheet at the shape of that space, so the drawing's frame runs
   edge to edge. While one view is full, every drawing is made on that sheet;
   leaving it puts the page's own size back. */
function fitFull() {
  const v = document.querySelector('.view.full');
  // the settings bar kept at the top of the window, however the page was laid out or resized meanwhile
  let bar = $('calcBar').getBoundingClientRect();
  if (v && Math.abs(bar.top) > 1) { window.scrollTo(0, Math.max(0, bar.top + window.scrollY)); bar = $('calcBar').getBoundingClientRect(); }
  const rail = $('rail').getBoundingClientRect();
  // the panel is a column at the side on a wide screen, and stacks above the drawings on a narrow one
  const side = rail.width < window.innerWidth * 0.6;
  document.documentElement.style.setProperty('--fullL', (side ? Math.max(0, rail.right) : 0) + 'px');
  // and never so low that the drawing is left no room
  document.documentElement.style.setProperty('--fullT', clampN(bar.bottom, 0, Math.max(0, window.innerHeight - 240)) + 'px');
}
/* the full-screen buttons' two faces: arrows pointing apart to fill the screen, pointing together to leave it */
const FS_IN = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3.5 12.5l9-9" stroke="currentColor" stroke-width="1.4"/><path d="M8.5 2.5h5v5M2.5 8.5v5h5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>', FS_OUT = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2 14l4.5-4.5M14 2L9.5 6.5" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 9.5h4v4M13.5 6.5h-4v-4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const fsFace = (b, full) => { if (!b) return; b.innerHTML = full ? FS_OUT : FS_IN; b.title = full ? 'Leave full screen' : 'Full screen'; b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(!!full)); };
function setFull(v, on) {
  document.querySelectorAll('.view.full').forEach(x => {
    x.classList.remove('full');
    fsFace(x.querySelector('[data-vfull]'), false);
  });
  if (on) {
    // the settings bar taken to the top first, so the drawing has all the height below it
    const top = $('calcBar').getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(window.scrollY, top));
    v.classList.add('full'); v.classList.remove('min');
    fsFace(v.querySelector('[data-vfull]'), true);
  }
  document.body.classList.toggle('hasfull', !!on);
  fitFull(); clearSunCache(); render();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-vclose], [data-vfull]');
  if (!b) return;
  const v = b.closest('.view');
  if (b.dataset.vfull !== undefined) { setFull(v, !v.classList.contains('full')); return; }
  // taken off the page: the rest of its row closes up; a + in any margin brings a view back
  if (v.classList.contains('full')) setFull(v, false);
  takeView(v); clearSunCache(); schedule();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.querySelector('.view.full')) setFull(null, false);
});
// the view bars stay under the calculation settings as the page scrolls
const barHeight = () => document.documentElement.style.setProperty('--cbh', $('calcBar').offsetHeight + 'px');
// the sheets follow the space each view has, so a resize redraws them, once it settles
let resizeT = null;
window.addEventListener('resize', () => { barHeight(); clearTimeout(resizeT); resizeT = setTimeout(() => { fitFull(); fitDock(); clearSunCache(); render(); }, 120); });
/* ---------- the dock ----------
   The design recommendations sit at the foot of the drawings. The dock's top
   edge is dragged to resize it; it collapses to its bar, or goes full screen
   over the drawings - the panel and the settings bar stay. How it was left is
   kept in this browser. */
const DOCK_KEY = 'solar-shading-dock-v9';
const dock = { h: Math.round(window.innerHeight * 0.38), min: false, full: false };
try { Object.assign(dock, JSON.parse(localStorage.getItem(DOCK_KEY) || '{}'), { full: false }); } catch (_) { }
// the recommendations start folded away; opened, they keep the height they were last given
dock.min = true;
function fitDock() {
  const el = $('dock'), root = document.documentElement.style;
  const rail = $('rail').getBoundingClientRect(), side = rail.width < window.innerWidth * 0.6;
  root.setProperty('--dockL', (side ? Math.max(0, rail.right) : 0) + 'px');
  root.setProperty('--dockH', clampN(dock.h, 140, Math.max(160, window.innerHeight - 140)) + 'px');
  root.setProperty('--dockT', clampN($('calcBar').getBoundingClientRect().bottom, 0, window.innerHeight - 200) + 'px');
  el.classList.toggle('min', dock.min); el.classList.toggle('full', dock.full);
  $('dockMin').textContent = dock.min ? '▴' : '▾'; $('dockMin').title = dock.min ? 'Expand' : 'Collapse';
  fsFace($('dockFull'), dock.full);
  root.setProperty('--dockVis', (dock.full ? 0 : el.getBoundingClientRect().height) + 'px');
  try { localStorage.setItem(DOCK_KEY, JSON.stringify({ h: dock.h, min: dock.min })); } catch (_) { }
}
$('dockMin').addEventListener('click', () => { dock.min = !dock.min; if (dock.min) dock.full = false; fitDock(); });
$('dockFull').addEventListener('click', () => { dock.full = !dock.full; if (dock.full) dock.min = false; fitDock(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && dock.full) { dock.full = false; fitDock(); } });
$('dockGrip').addEventListener('pointerdown', e => {
  e.preventDefault();
  const move = ev => { dock.h = window.innerHeight - ev.clientY; fitDock(); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
});
fitDock();
barHeight();
if (window.ResizeObserver) new ResizeObserver(barHeight).observe($('calcBar'));
wireHistory();
buildLayout(makeInst);
let sizeRaf = null;
wireLayout(makeInst, () => { clearSunCache(); schedule(); },
  () => { if (!sizeRaf) sizeRaf = requestAnimationFrame(() => { sizeRaf = null; clearSunCache(); render(true); }); });
$('layoutReset').addEventListener('click', () => { buildLayout(makeInst, true); clearSunCache(); schedule(); });
recentre();
getMask(buildFrame(S, V).T, true);
render();

/* ---------- the guide ----------
   How to use the tool: each part of the page, what it is for and how it is
   worked. The worked example: an overhang sized for one moment by the hand
   method's steps - the page set up for it and each step pointed out where the
   tool shows it - then the same window read over the day, and against the
   climate from the sun path chart. */
const VIEW_AT = t => () => document.querySelector('.view[data-type=' + t + ']');
const TOUR = [
  { title: 'Simple and Advanced', at: () => document.querySelector('.masthead .modeseg'), html: '<p><b>Simple</b> keeps to one storey with one window a side, edited where it stands in the building view. <b>Advanced</b> opens storeys, sites, typologies and a library of designs, and isolates a window to edit it. Each mode keeps the design it was left with.</p>' },
  { title: 'Calculation settings', at: '#calcBar', html: '<p>The date, the time and the clock. <b>Solar time</b> is the sun’s own: noon is when it stands due south, as sun charts are drawn; the other clocks are Vancouver’s, standard and daylight.</p><p>The sky and the weather file set how much sun there is to keep out.</p>' },
  { title: 'Building in 3D', at: VIEW_AT('axon'), html: '<p>Drag the sun on the dome - or anywhere along its ray - to move it through the sky. Turn the building by the long arrow on the ground: its figure is the selected side’s surface azimuth, measured from due south, east negative.</p><p>Click a window to select it. The angles at its foot - β, the solar azimuth, γ and θ - show their value and working when the pointer is over them. <b>Layers</b> sets what the sky shows, and how strongly.</p>' },
  { title: 'The window pop-over', at: VIEW_AT('axon'), html: '<p>A selected window opens a pop-over beside it: add horizontal or vertical shading, or a preset.</p><p>In <b>Simple</b> the window’s handles show as soon as it is selected - its jambs, sill and head, and the middle of the pane for its set-back; in <b>Advanced</b>, <b>Edit window in 3D</b> isolates it first. Click a device to edit it as the section and plan do: its depth, turn and length, a gumball that moves it along, out from and up the facade (Alt-drag for a copy), and its alignment, justification and hinge in its pop-over. Drag a member of an array to change how many there are.</p>' },
  { title: 'Section and plan', at: VIEW_AT('section'), html: '<p>The section reads the profile angle θ; the plan reads γ and the sun on the floor. Click a device to pick it, then drag its grips, or click a figure to type it. Alt-drag its gumball for a copy.</p><p>Pulling a device’s depth, or turning it, snaps where its end falls on the sun’s angle line now - where it just shades the window at this instant.</p>' },
  { title: 'Sun path chart', at: VIEW_AT('sun'), html: '<p>The sun’s bearing and altitude over the day, with the shading the window’s devices give drawn in grey: the solid line is the cut-off as built, the dashed one the same devices taken as long and thin, as a protractor reads them. The pointer’s β, azimuth, γ and θ are read at the top right.</p><p>The weather dots are each hour of the weather file, coloured by its temperature: keep the warm ones out, let the cool ones in. <b>Shade from chart</b> sizes shading from cut-offs dragged here.</p>' },
  { title: 'Live shading', at: VIEW_AT('section'), html: '<p><b>Live shading</b> puts the ideal members on the selected window for the date and time set, and remakes them as they change. Choose horizontal, vertical, an egg-crate or a louvred canopy, or let Auto pick, and how many members share the work.</p><p><b>Compare</b> keeps this moment’s members as a ghost while another is set; pressed again, the ghost goes and the clock and the member count return to its moment. Turn it off to keep the shading, or put back what the window had.</p>' },
  { title: 'Solar heat gain', at: '#calcBar', html: '<p>The row under the settings is the direct solar heat through the selected window: <b>now</b>, <b>over the day</b> and <b>over a year</b>, each with how much of it the shading keeps out and what the bare window would let in. <b>ƒ</b> beside each shows the working.</p><p>The same can be read as charts: choose <b>Heat gain · day</b> or <b>Heat gain · year</b> from any view’s name menu - the day hour by hour, the year month by month, shaded against bare.</p>' }
];
function setupExample() {
  stopPlay(); H.mark('example');
  if (S.live) liveOff('revert');
  closeWidget(SW); closeWidget(SITEW); V.siteEdit = false;
  insts().forEach(i => { if (i.V) i.V.iso = false; });
  applyTypology('blank'); S.matchAbove.sides = false;
  S.timeMode = 'sol'; S.doy = 217; S.hour = 10;
  S.sel = { f: 'S', st: 0, unit: 0 };
  setValue('surfAz', -20);
  setValue('g.winH', 1.5);
  recentre(); S.pick = 'window'; picked = 'window';
  const ax = insts().find(i => i.type === 'axon'); if (ax) { POP.at = ax; POP.st = 'open'; }
  syncRail(S); schedule();
}
const EXAMPLE = [
  { title: 'The question', at: '#calcBar', run: setupExample, html: '<p>A window 1.5 m tall faces 20° east of south in Vancouver. How deep must an overhang at its head be to shade the whole window at 10:00 solar time in early August?</p><p>The page is set up for it: the clock on <b>solar time</b>, Aug 5 at 10:00, the south side turned to a surface azimuth of −20°, and its window 1.5 m tall.</p>' },
  { title: 'Step 1 · Where the sun is', at: VIEW_AT('sun'), html: '<p>Read the solar altitude <b>β</b> and the solar azimuth off the sun path chart, where the sun stands at 10:00 - or point anywhere on the chart and read them at its top right.</p><p>β ≈ 49.5°, and the azimuth ≈ −47.5°: east of south is negative.</p>' },
  { title: 'Step 2 · Surface solar azimuth γ', at: VIEW_AT('axon'), html: '<p>γ is the sun’s bearing off the facade’s normal: <b>γ = surface azimuth − solar azimuth</b> = −20 − (−47.5) = 27.5°.</p><p>Point at γ at the window’s foot in Building in 3D to see it worked out; point at β and the solar azimuth beside it too.</p>' },
  { title: 'Step 3 · Profile angle θ', at: VIEW_AT('section'), html: '<p>The profile angle is the sun’s altitude seen in section, square to the facade: <b>θ = tan⁻¹(tan β / cos γ)</b> = tan⁻¹(1.173 / 0.887) = 52.9°.</p><p>The section draws it at the window; θ in Building in 3D shows the working.</p>' },
  { title: 'Step 4 · Size the overhang', at: VIEW_AT('section'), act: ['Put the ideal overhang on', () => { if (!S.live) api.act('liveToggle', 'h'); }],
    html: '<p><b>Ph = h / tan θ</b> = 1.5 / 1.322 = 1.13 m.</p><p>Add horizontal shading in the window pop-over and drag its depth in the section: it snaps where its end falls on the sun’s angle line. Or let Live shading put the ideal overhang on. Either way the section reads 100% shaded.</p>' },
  { title: 'Step 5 · When does the sun come back?', at: '#playBtn', act: ['Play the day', () => api.play()],
    html: '<p>After 10:00, does the sun reach the glass again? Play the day, or drag the time, and watch the section’s <b>shaded</b> figure.</p><p>The hand method takes the overhang as running on forever, and finds the sun never comes back. A real one has ends: past midday the sun can slip round them and reach part of the glass. Run the overhang further past the jambs to see it close up.</p>' },
  { title: 'Step 6 · Against the climate', at: VIEW_AT('sun'), act: ['Size it from the chart', () => api.act('liveSrc', 'chart')],
    html: '<p>One moment is rarely the right design. Choose a profile angle that keeps the warm hours out and lets the cool ones in: set the weather dots to <b>Jun 21 – Dec 21</b>, press <b>Shade from chart</b>, and drag the profile angle down from the top until the warm dots fall in the shade. The overhang follows, and the dashed line is the boundary it makes.</p><p>Drag a side in from the facade’s edge for a fin on that jamb: its ζ is 90° − γ, and Pd = w / tan γ.</p>' }
];
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-guide]');
  if (!b) return;
  const d = b.closest('details'); if (d) d.open = false;
  startTour(b.dataset.guide === 'example' ? EXAMPLE : TOUR);
});
