// NYSE regular session (09:30–16:00 New York) with full-day holidays derived
// from the exchange's rules, so there is no list to keep up to date.
// ponytail: early closes (13:00 on Jul 3, Black Friday, Christmas Eve) are not
// modelled — the header reads OPEN until 16:00 on those ~3 days a year.

const OPEN_MIN = 570, CLOSE_MIN = 960; // 09:30, 16:00

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const key = (dt) => dt.toISOString().slice(0, 10);

// nth weekday (0 = Sun) of a month; n = -1 → last
function nthWeekday(y, m, weekday, n) {
  if (n > 0) {
    const first = utc(y, m, 1).getUTCDay();
    return utc(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const last = utc(y, m + 1, 0);
  return utc(y, m, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
}

// Saturday → Friday before, Sunday → Monday after
function observed(y, m, d) {
  const dt = utc(y, m, d), wd = dt.getUTCDay();
  return wd === 6 ? utc(y, m, d - 1) : wd === 0 ? utc(y, m, d + 1) : dt;
}

// Anonymous Gregorian algorithm
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month, day);
}

const cache = new Map();
function holidays(y) {
  if (!cache.has(y)) {
    const e = easter(y);
    const list = [
      nthWeekday(y, 1, 1, 3),                  // MLK Day
      nthWeekday(y, 2, 1, 3),                  // Presidents Day
      utc(y, e.getUTCMonth() + 1, e.getUTCDate() - 2), // Good Friday
      nthWeekday(y, 5, 1, -1),                 // Memorial Day
      observed(y, 6, 19),                      // Juneteenth
      observed(y, 7, 4),                       // Independence Day
      nthWeekday(y, 9, 1, 1),                  // Labor Day
      nthWeekday(y, 11, 4, 4),                 // Thanksgiving
      observed(y, 12, 25),                     // Christmas
    ];
    // New Year's Day: a Sunday moves to Monday; a Saturday is not made up on Dec 31.
    if (utc(y, 1, 1).getUTCDay() !== 6) list.push(observed(y, 1, 1));
    cache.set(y, new Set(list.map(key)));
  }
  return cache.get(y);
}

export function isTradingDay(y, m, d) {
  const dt = utc(y, m, d), wd = dt.getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays(y).has(key(dt));
}

function nyParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(date).map(({ type, value }) => [type, +value]));
  return { y: p.year, m: p.month, d: p.day, mins: p.hour * 60 + p.minute };
}

export function getMarketStatus(now = new Date()) {
  const { y, m, d, mins } = nyParts(now);
  const today = isTradingDay(y, m, d);
  if (today && mins >= OPEN_MIN && mins < CLOSE_MIN) {
    const left = CLOSE_MIN - mins;
    return { isOpen: true, nextEvent: `Closes in ${Math.floor(left / 60)}h ${left % 60}m` };
  }
  let minsToOpen = today && mins < OPEN_MIN ? OPEN_MIN - mins : null;
  for (let k = 1; minsToOpen === null && k <= 10; k++) {
    const next = utc(y, m, d + k);
    if (isTradingDay(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())) {
      minsToOpen = k * 1440 - mins + OPEN_MIN;
    }
  }
  const h = Math.floor(minsToOpen / 60), mm = minsToOpen % 60;
  return { isOpen: false, nextEvent: h > 23 ? `Opens ${Math.floor(h / 24)}d ${h % 24}h` : `Opens in ${h}h ${mm}m` };
}
