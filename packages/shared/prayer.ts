// Prayer times calculated on this PC (no internet), Egyptian General Authority of Survey method:
// Fajr at 19.5° below the horizon, Isha at 17.5°, Asr when shadows equal the object's length plus noon shadow
// (standard/Shafi'i). Standard astronomical formulas (as used by common prayer-time libraries).
export type PrayerName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYERS: { id: PrayerName; en: string; ar: string; prayer: boolean }[] = [
  { id: 'fajr', en: 'Fajr', ar: 'الفجر', prayer: true }, { id: 'sunrise', en: 'Sunrise', ar: 'الشروق', prayer: false },
  { id: 'dhuhr', en: 'Dhuhr', ar: 'الظهر', prayer: true }, { id: 'asr', en: 'Asr', ar: 'العصر', prayer: true },
  { id: 'maghrib', en: 'Maghrib', ar: 'المغرب', prayer: true }, { id: 'isha', en: 'Isha', ar: 'العشاء', prayer: true },
];
const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => r * 180 / Math.PI;
const fix = (a: number, b: number) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

function sun(jd: number) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const ra = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15, 24);
  return { declination: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), equation: q / 15 - ra };
}

/** Today's (or `date`'s) prayer times for a place, as local Date objects. */
export function prayerTimes(date: Date, latitude: number, longitude: number): Record<PrayerName, Date> {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const jd = jdn - 0.5 - longitude / (15 * 24);
  const noon = (t: number) => fix(12 - sun(jd + t).equation, 24);
  const angleTime = (angle: number, t: number, before: boolean) => {
    const decl = sun(jd + t).declination;
    const cos = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(latitude))) / (Math.cos(rad(decl)) * Math.cos(rad(latitude)));
    const h = deg(Math.acos(Math.max(-1, Math.min(1, cos)))) / 15;
    return noon(t) + (before ? -h : h);
  };
  const asrTime = (factor: number, t: number) => {
    const decl = sun(jd + t).declination;
    const angle = -deg(Math.atan(1 / (factor + Math.tan(rad(Math.abs(latitude - decl))))));
    return angleTime(angle, t, false);
  };
  // Two passes: first with rough day fractions, then refined with the first results.
  let hours = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 } as Record<PrayerName, number>;
  for (let pass = 0; pass < 2; pass++) {
    const f = (h: number) => h / 24;
    hours = {
      fajr: angleTime(19.5, f(hours.fajr), true), sunrise: angleTime(0.833, f(hours.sunrise), true), dhuhr: noon(f(hours.dhuhr)),
      asr: asrTime(1, f(hours.asr)), maghrib: angleTime(0.833, f(hours.maghrib), false), isha: angleTime(17.5, f(hours.isha), false),
    };
  }
  const midnightLocal = new Date(y, m - 1, d);
  const out = {} as Record<PrayerName, Date>;
  for (const [name, h] of Object.entries(hours) as [PrayerName, number][]) {
    const utcHours = h - longitude / 15;
    const t = Date.UTC(y, m - 1, d) + Math.round(utcHours * 60) * 60000;
    out[name] = new Date(t);
  }
  void midnightLocal;
  return out;
}

/** The next prayer (not sunrise) from `now`, looking into tomorrow after Isha. */
export function nextPrayer(now: Date, latitude: number, longitude: number): { id: PrayerName; at: Date } {
  for (const offset of [0, 1]) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const times = prayerTimes(day, latitude, longitude);
    for (const p of PRAYERS) if (p.prayer && times[p.id] > now) return { id: p.id, at: times[p.id] };
  }
  return { id: 'fajr', at: prayerTimes(new Date(now.getTime() + 86400000), latitude, longitude).fajr };
}

/** Qibla direction in degrees clockwise from true north. */
export function qibla(latitude: number, longitude: number): number {
  const kLat = rad(21.4225), kLon = rad(39.8262), lat = rad(latitude), dLon = kLon - rad(longitude);
  return fix(deg(Math.atan2(Math.sin(dLon), Math.cos(lat) * Math.tan(kLat) - Math.sin(lat) * Math.cos(dLon))), 360);
}

/** Hijri date (Umm al-Qura calendar), e.g. "13 Jumada II 1448" and "١٣ جمادى الآخرة ١٤٤٨". */
export function hijri(date: Date): { en: string; ar: string; month: number; day: number } {
  const en = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(date).replace(/\s*AH$/, '');
  const ar = new Intl.DateTimeFormat('ar-EG-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(date).replace(/\s*هـ$/, '');
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric' }).formatToParts(date);
  return { en, ar, month: Number(parts.find(p => p.type === 'month')?.value), day: Number(parts.find(p => p.type === 'day')?.value) };
}

export type Occasion = { date: Date; en: string; ar: string; kind: 'islamic' | 'egypt' };
// Islamic occasions by Hijri [month, day]; their Egyptian dates can differ by a day (moon sighting), so they're "expected".
const ISLAMIC: [number, number, string, string][] = [
  [9, 1, 'Ramadan begins', 'بداية رمضان'], [10, 1, 'Eid al-Fitr', 'عيد الفطر'], [12, 9, 'Day of Arafah', 'يوم عرفة'],
  [12, 10, 'Eid al-Adha', 'عيد الأضحى'], [1, 1, 'Islamic New Year', 'رأس السنة الهجرية'], [1, 10, 'Ashura', 'عاشوراء'], [3, 12, 'Mawlid an-Nabi', 'المولد النبوي'],
];
// Egypt's fixed civil holidays [month, day].
const EGYPT: [number, number, string, string][] = [
  [1, 7, 'Coptic Christmas', 'عيد الميلاد المجيد'], [1, 25, 'January 25 Revolution & Police Day', 'ثورة ٢٥ يناير وعيد الشرطة'], [4, 25, 'Sinai Liberation Day', 'عيد تحرير سيناء'],
  [5, 1, 'Labour Day', 'عيد العمال'], [6, 30, 'June 30 Revolution', 'ثورة ٣٠ يونيو'], [7, 23, 'July 23 Revolution', 'ثورة ٢٣ يوليو'], [10, 6, 'Armed Forces Day', 'عيد القوات المسلحة'],
];
/** Orthodox (Coptic) Easter as a Gregorian date; Sham el-Nessim is the Monday after. */
export function copticEaster(year: number): Date {
  const a = year % 4, b = year % 7, c = year % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return new Date(year, month - 1, day + 13); // Julian → Gregorian (1900–2099)
}
/** Occasions from `from` over the next `days` days, soonest first. */
export function upcomingOccasions(from: Date, days = 400): Occasion[] {
  const out: Occasion[] = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i <= days; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), h = hijri(day);
    for (const [m, d, en, ar] of ISLAMIC) if (h.month === m && h.day === d) out.push({ date: day, en, ar, kind: 'islamic' });
    for (const [m, d, en, ar] of EGYPT) if (day.getMonth() + 1 === m && day.getDate() === d) out.push({ date: day, en, ar, kind: 'egypt' });
    const easter = copticEaster(day.getFullYear()), monday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1);
    if (day.getTime() === monday.getTime()) out.push({ date: day, en: 'Sham el-Nessim', ar: 'شم النسيم', kind: 'egypt' });
  }
  return out;
}
