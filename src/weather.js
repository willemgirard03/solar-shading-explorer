/* The weather files, hour by hour.

   Two NRC future-shifted typical years for Vancouver: every hour's direct
   normal irradiance and dry-bulb temperature. Hour index (doy - 1) * 24 + h
   covers h..h+1 Pacific Standard Time, so a value belongs to the half hour. */

import { HOURLY_RAW } from './data/hourly.js';
import { doyOf, monthDayOf } from './util.js';
import { SITE0 } from './solar.js';
import { CLIMATE } from './data/climate.js';

export const WEATHER_FILES = { gw10: 'NRC typical year, +1.0 °C warming', gw20: 'NRC typical year, +2.0 °C warming' };

const cache = {};
function decode(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Int16Array(u8.buffer);
}
/** { dni: W/m2, db: tenths of a degree } for each of the 8760 hours */
export function hourly(wx) {
  if (!cache[wx]) { const r = HOURLY_RAW[wx]; cache[wx] = { dni: decode(r.dni), db: decode(r.db), file: r.file }; }
  return cache[wx];
}
/* An EnergyPlus weather file read in: its direct normal irradiance (field 15)
   and dry-bulb temperature (field 7), an hour a row after its eight header
   lines, each row the hour ending at its time. A leap day is left out, so the
   year is 8760 hours as the tool's own are; a missing irradiance reads as none. */
export function parseEpw(text) {
  const lines = String(text).split(/\r?\n/), loc = (lines[0] || '').split(',');
  if (!/^LOCATION/i.test(loc[0] || '')) throw new Error('this is not an EnergyPlus weather file');
  const dni = new Int16Array(8760), db = new Int16Array(8760), ghi = new Float32Array(8760), dhi = new Float32Array(8760);
  let n = 0;
  for (let k = 8; k < lines.length; k++) {
    const f = lines[k].split(',');
    if (f.length < 15) continue;
    const mo = +f[1], d = +f[2], h = +f[3];
    if (!(mo >= 1 && mo <= 12) || (mo === 2 && d === 29)) continue;
    const i = (doyOf(mo, d) - 1) * 24 + (h - 1);
    if (i < 0 || i >= 8760) continue;
    const q = +f[14], t = +f[6];
    dni[i] = q >= 0 && q < 2000 ? Math.round(q) : 0; db[i] = Math.round((isFinite(t) && t < 90 ? t : 0) * 10); n++;
    const gh = +f[13], dh = +f[15]; ghi[i] = gh >= 0 && gh < 2000 ? gh : 0; dhi[i] = dh >= 0 && dh < 2000 ? dh : 0;
  }
  if (n < 8700) throw new Error('only ' + n + ' of the 8760 hours could be read');
  return { dni, db, place: (loc[1] || '').trim(), lat: +loc[6], lon: +loc[7], tz: +loc[8], climate: climateOf(dni, db, ghi, dhi) };
}
/* The monthly figures the built-in files carry, worked out from a file read in:
   each month's mean of every hour's irradiance and dry bulb, its days, its warm
   hours, and the year's extremes, degree-days and totals. */
function climateOf(dni, db, ghi, dhi) {
  const mon = () => Array.from({ length: 12 }, () => new Array(24).fill(0));
  const D = mon(), Hd = mon(), G = mon(), T = mon(), ndays = new Array(12).fill(0), over26 = new Array(12).fill(0), over28 = new Array(12).fill(0);
  let tmin = 1e9, tmax = -1e9, tsum = 0, hdd = 0, cdd = 0, gA = 0, dA = 0, hA = 0;
  for (let d = 1; d <= 365; d++) {
    const mo = monthDayOf(d).m - 1;
    ndays[mo]++;
    let day = 0;
    for (let h = 0; h < 24; h++) {
      const i = (d - 1) * 24 + h, t = db[i] / 10;
      D[mo][h] += dni[i]; Hd[mo][h] += dhi[i]; G[mo][h] += ghi[i]; T[mo][h] += t;
      tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); tsum += t; day += t;
      if (t > 26) over26[mo]++; if (t > 28) over28[mo]++;
      gA += ghi[i]; dA += dni[i]; hA += dhi[i];
    }
    day /= 24; hdd += Math.max(0, 18 - day); cdd += Math.max(0, day - 18);
  }
  const avg = (M, k) => M.map((r, mo) => r.map(x => +(x / ndays[mo]).toFixed(k)));
  return { dni: avg(D, 0), dhi: avg(Hd, 0), ghi: avg(G, 0), db: avg(T, 1), ndays, over26, over28,
    tmin: +tmin.toFixed(1), tmax: +tmax.toFixed(1), tmean: +(tsum / 8760).toFixed(1), hrs26: over26.reduce((a, b) => a + b, 0), hrs28: over28.reduce((a, b) => a + b, 0),
    hdd18: Math.round(hdd), cdd18: Math.round(cdd), ghiAnnual: Math.round(gA / 1000), dniAnnual: Math.round(dA / 1000), dhiAnnual: Math.round(hA / 1000) };
}
/** each weather file's place - the built-in ones are the tool's own */
const PLACES = {};
export const placeOf = wx => PLACES[wx] || SITE0;
let epwSeq = 0;
/** a weather file read in, added to the list under its own name; its key */
export function addWeather(label, rec) {
  const key = 'epw' + (++epwSeq);
  WEATHER_FILES[key] = label;
  cache[key] = { dni: rec.dni, db: rec.db, file: label };
  if (rec.climate) CLIMATE[key] = rec.climate;
  if (isFinite(rec.lat) && isFinite(rec.lon) && isFinite(rec.tz)) PLACES[key] = { lat: rec.lat, lon: rec.lon, tz: rec.tz, place: rec.place || label };
  return key;
}
/** the record at a moment of PST on a day, read between the half hours */
export function recordAt(wx, arr, doy, lst) {
  const a = hourly(wx)[arr], x = (doy - 1) * 24 + lst - 0.5;
  const i0 = Math.floor(x), f = x - i0;
  const at = i => a[((i % 8760) + 8760) % 8760];
  return at(i0) + (at(i0 + 1) - at(i0)) * f;
}
