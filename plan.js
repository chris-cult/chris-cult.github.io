/* Laufplan-Kern: erzeugt einen Trainingsplan aus Distanz, Zielzeit, Wochen, Läufen pro Woche und aktuellem Umfang.
   Läuft im Browser und in Node. Alle Zahlen sind Faustwerte (Annahmen), keine medizinische oder sportwissenschaftliche Beratung. */
(function (root) {
  var DIST = { '5': 5, '10': 10, '21': 21.0975, '42': 42.195 };
  var NAME = { '5': '5 km', '10': '10 km', '21': 'Halbmarathon', '42': 'Marathon' };
  var PEAK4 = { '5': 35, '10': 45, '21': 55, '42': 70 };       // Spitzenumfang km/Woche bei 4 Läufen
  var LONGCAP = { '5': 12, '10': 16, '21': 22, '42': 32 };     // längster Lauf in km
  var LONGSHARE = { '5': 0.30, '10': 0.30, '21': 0.33, '42': 0.35 };
  var EASYOFF = { '5': 70, '10': 65, '21': 55, '42': 45 };     // Sekunden pro km langsamer als Zielpace
  var TAPER = { '5': 1, '10': 1, '21': 2, '42': 3 };
  var TAPERM = { 1: [0.6], 2: [0.75, 0.5], 3: [0.8, 0.6, 0.45] };
  var DAYS = { 3: [[1, 'Q2'], [3, 'E'], [6, 'L']], 4: [[1, 'Q1'], [2, 'E'], [4, 'Q2'], [6, 'L']], 5: [[1, 'Q1'], [2, 'E'], [3, 'Q2'], [4, 'E'], [6, 'L']] };
  var WEIGHT = { 3: { Q2: 0.55, E: 0.45 }, 4: { Q1: 0.30, E: 0.25, Q2: 0.45 }, 5: { Q1: 0.28, E: 0.17, Q2: 0.30 } }; // E wird bei 5 Läufen auf zwei Tage geteilt
  var DN = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function round05(x) { return Math.round(x * 2) / 2; }
  function riegel(minutes, d1, d2) { return minutes * Math.pow(d2 / d1, 1.06); }
  function fmtPace(sec) { var m = Math.floor(sec / 60), s = Math.round(sec - m * 60); if (s === 60) { m++; s = 0; } return m + ':' + (s < 10 ? '0' : '') + s + ' min/km'; }
  function fmtTime(min) { var t = Math.round(min * 60), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function km(x) { return (Math.round(x * 10) / 10).toString().replace('.', ',') + ' km'; }
  function parseTime(str) {
    var p = String(str).trim().split(':').map(Number); if (p.some(function (n) { return !isFinite(n); })) return NaN;
    if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
    if (p.length === 2) return p[0] + p[1] / 60;
    return NaN;
  }

  function paces(dkey, goalMin) {
    var d = DIST[dkey], p = goalMin * 60 / d;
    var t5 = riegel(goalMin, d, 5), t10 = riegel(goalMin, d, 10);
    return { ziel: p, easy: p + EASYOFF[dkey], long: p + EASYOFF[dkey] + 10, tempo: t10 * 60 / 10 + 12, intervall: t5 * 60 / 5 };
  }

  function volumes(dkey, W, R, cur) {
    var tap = TAPER[dkey], build = W - tap, cap = LONGCAP[dkey];
    var peakT = PEAK4[dkey] * ({ 3: 0.8, 4: 1, 5: 1.2 }[R]);
    var v = [], lg = [], x = Math.max(cur, 10), prevX = x, prevL = 0;
    var baseLong = clamp(cur * 0.35, 5, cap * 0.6);
    for (var i = 0; i < build; i++) {
      var deload = ((i + 1) % 4 === 0) && i < build - 1, vi, li;
      if (!deload) {
        if (i > 0) x = Math.min(peakT, x * 1.09);
        var tL = baseLong + (cap - baseLong) * (build > 1 ? i / (build - 1) : 1);
        var l = i === 0 ? baseLong : Math.min(tL, prevL + 2.5);   // langer Lauf wächst höchstens 2,5 km pro Woche
        var need = l / 0.55;                                       // langer Lauf höchstens 55 % der Woche
        if (need > x) { var lim = i === 0 ? need : prevX * 1.12; x = Math.min(need, Math.max(x, lim)); }
        l = Math.min(l, x * 0.55);
        prevL = l; prevX = x; vi = x; li = l;
      } else { vi = prevX * 0.75; li = prevL * 0.75; }
      v.push(vi); lg.push(li);
    }
    var peak = Math.max.apply(null, v), maxLong = Math.max.apply(null, lg);
    TAPERM[tap].forEach(function (m) { v.push(peak * m); lg.push(Math.max(5, peak * m * LONGSHARE[dkey])); });
    return { vol: v, longs: lg, peak: peak, build: build, maxLong: maxLong, longCap: cap };
  }

  function phaseOf(i, build) { var f = i / Math.max(1, build - 1); return f < 0.35 ? 'Grundlage' : f < 0.7 ? 'Aufbau' : 'Spezifisch'; }

  function describe(type, phase, dkey, kmv, pc) {
    var reps = clamp(Math.round((kmv - 4) / 1.15), 3, 8);
    if (type === 'E') return 'Lockerer Dauerlauf in ' + fmtPace(pc.easy) + '. Du kannst dich dabei unterhalten.';
    if (type === 'L') return 'Langer Lauf in ' + fmtPace(pc.long) + '.' + ((phase === 'Spezifisch' && DIST[dkey] >= 21) ? ' Die letzten ' + km(clamp(kmv * 0.25, 2, 8)) + ' in Zielpace ' + fmtPace(pc.ziel) + '.' : '');
    if (type === 'Q1') {
      if (phase === 'Grundlage') return 'Fahrtspiel: ' + reps + ' × 1 Min zügig, dazwischen 90 Sek locker. Ein- und Auslaufen locker.';
      if (phase === 'Aufbau') return reps + ' × 1000 m in ' + fmtPace(pc.intervall) + ', 2 Min Trab dazwischen. Ein- und Auslaufen je 2 km locker.';
      return Math.max(2, Math.round(reps / 2)) + ' × 2000 m in ' + fmtPace(pc.tempo) + ', 2 Min Trab dazwischen. Ein- und Auslaufen locker.';
    }
    if (phase === 'Grundlage') return 'Lockerer Dauerlauf in ' + fmtPace(pc.easy) + ' mit 6 × 80 m Steigerungen am Ende.';
    if (phase === 'Aufbau') return 'Tempodauerlauf: ' + km(clamp(kmv * 0.5, 3, 12)) + ' in ' + fmtPace(pc.tempo) + ', Rest locker.';
    return 'Renntempo-Block: ' + km(clamp(kmv * 0.5, 3, dkey === '42' ? 16 : 10)) + ' in Zielpace ' + fmtPace(pc.ziel) + ', Rest locker.';
  }

  /* Strukturierte Schritte für den Garmin-Export. dist in Metern, time in Sekunden, pace in Sekunden pro km. */
  function S(intensity, dist, pace, name) { return { intensity: intensity, dist: dist, pace: pace, name: name }; }
  function T(intensity, time, pace, name) { return { intensity: intensity, time: time, pace: pace, name: name }; }
  function R(n, steps) { return { repeat: n, steps: steps }; }
  function stepsFor(type, phase, dkey, kmv, pc) {
    var m = function (k) { return Math.round(k * 1000); };
    var reps = clamp(Math.round((kmv - 4) / 1.15), 3, 8);
    if (type === 'E') return [S('active', m(kmv), pc.easy, 'Locker')];
    if (type === 'L') {
      if (phase === 'Spezifisch' && DIST[dkey] >= 21) { var b = clamp(kmv * 0.25, 2, 8); return [S('active', m(kmv - b), pc.long, 'Lang'), S('active', m(b), pc.ziel, 'Zielpace')]; }
      return [S('active', m(kmv), pc.long, 'Lang')];
    }
    if (type === 'Q1') {
      if (phase === 'Grundlage') return [S('warmup', 1500, pc.easy, 'Einlaufen'), R(reps, [T('interval', 60, pc.intervall, 'Zügig'), T('recovery', 90, pc.easy, 'Locker')]), S('cooldown', 1500, pc.easy, 'Auslaufen')];
      if (phase === 'Aufbau') return [S('warmup', 2000, pc.easy, 'Einlaufen'), R(reps, [S('interval', 1000, pc.intervall, '1000 m'), T('recovery', 120, null, 'Trab')]), S('cooldown', 2000, pc.easy, 'Auslaufen')];
      return [S('warmup', 2000, pc.easy, 'Einlaufen'), R(Math.max(2, Math.round(reps / 2)), [S('interval', 2000, pc.tempo, '2000 m'), T('recovery', 120, null, 'Trab')]), S('cooldown', 2000, pc.easy, 'Auslaufen')];
    }
    if (phase === 'Grundlage') return [S('active', m(kmv), pc.easy, 'Locker')];
    var blk = phase === 'Aufbau' ? clamp(kmv * 0.5, 3, 12) : clamp(kmv * 0.5, 3, dkey === '42' ? 16 : 10), rest = Math.max(0, kmv - blk);
    var pace = phase === 'Aufbau' ? pc.tempo : pc.ziel, nm = phase === 'Aufbau' ? 'Tempo' : 'Renntempo';
    return [S('warmup', m(rest / 2), pc.easy, 'Einlaufen'), S('active', m(blk), pace, nm), S('cooldown', m(rest / 2), pc.easy, 'Auslaufen')];
  }

  /* Kraft und Mobilität (Premium). Faustwerte, keine Therapie. */
  var KA = ['Kniebeuge (Körpergewicht oder Goblet)', 'Ausfallschritt rückwärts', 'Glute Bridge', 'Wadenheben', 'Unterarmstütz', 'Seitstütz'];
  var KB = ['Step-ups auf Bank oder Stufe', 'Einbeiniges Kreuzheben (leicht)', 'Hip Thrust', 'Wadenheben einbeinig', 'Dead Bug', 'Bird Dog'];
  var MOB = ['Hüftbeuger dehnen', 'Waden dehnen', 'Beinrückseite dynamisch (Beinpendel)', 'Brustwirbel rotieren', 'Fußgelenke kreisen'];
  var KDAY = { 3: [2, 4], 4: [3, 0], 5: [0, 5] };
  function kraftFor(week, phase, deload, R, raceWeek) {
    var out = [];
    if (raceWeek) return out;
    var sets = phase === 'Grundlage' ? '2 × 12' : phase === 'Aufbau' ? '3 × 10' : phase === 'Spezifisch' ? '3 × 8' : '2 × 8';
    if (deload) sets = '2 × 10';
    var plankSec = phase === 'Grundlage' ? 30 : phase === 'Aufbau' ? 45 : 60;
    var n = phase === 'Tapering' ? 1 : 2;
    for (var k = 0; k < n; k++) {
      var list = k === 0 ? KA : KB;
      out.push({ dayIdx: KDAY[R][k], day: DN[KDAY[R][k]], set: k === 0 ? 'A' : 'B',
        desc: sets + ' Wiederholungen, Pause 60 Sek, Halteübungen je ' + plankSec + ' Sek: ' + list.join(', ') + '. Danach Mobilität 8 Min: ' + MOB.join(', ') + '. Nur schmerzfrei ausführen.' });
    }
    return out;
  }

  /* Wochen bis zum Zieltag: Plan startet am ersten Montag ab heute und endet in der Woche des Zieltags. */
  function mondayOf(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function weeksUntil(raceISO, today) {
    var t = today ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    var race = new Date(raceISO + 'T00:00:00'); if (isNaN(race.getTime())) return null;
    var start = mondayOf(t); if (start < t) start = addDays(start, 7);
    var raceMon = mondayOf(race);
    return { weeks: Math.round((raceMon - start) / 604800000) + 1, start: start, race: race, raceMonday: raceMon };
  }

  /* Ehrlicher Realitätscheck. Alles Faustwerte, keine Garantie. */
  function recVolume(dkey, p) { // p in min/km, Rückgabe: [von, bis] km pro Woche
    var t = { '5': [[6, [20, 30]], [5, [25, 40]], [4, [35, 50]], [0, [45, 65]]], '10': [[6, [25, 35]], [5, [30, 45]], [4.25, [40, 55]], [0, [50, 70]]],
      '21': [[6.5, [30, 40]], [5.5, [40, 50]], [4.75, [50, 65]], [0, [65, 85]]], '42': [[6.5, [45, 60]], [5.5, [55, 70]], [4.75, [65, 85]], [0, [80, 110]]] }[dkey];
    for (var i = 0; i < t.length; i++) if (p >= t[i][0]) return t[i][1];
    return t[t.length - 1][1];
  }
  function realityCheck(c) {
    var d = DIST[c.dkey], pm = c.goal / d, rec = recVolume(c.dkey, pm), lines = [], volLevel, impLevel = null, pred = null, imp = null, allowed = Math.min(0.10, 0.004 * c.W + 0.02);
    var ratio = c.peak / rec[0]; volLevel = ratio >= 1 ? 0 : ratio >= 0.85 ? 1 : ratio >= 0.7 ? 2 : 3;
    lines.push('Richtwert für die Zielpace ' + fmtPace(pm * 60) + ': etwa ' + rec[0] + ' bis ' + rec[1] + ' km pro Woche in der Spitze. Dein Plan erreicht ungefähr ' + Math.round(c.peak) + ' km, der längste Lauf ' + Math.round(c.maxLong) + ' km.');
    var hours = c.peak * c.easySec / 3600;
    lines.push('Zeitaufwand in der Spitzenwoche: etwa ' + (Math.round(hours * 2) / 2).toString().replace('.', ',') + ' Stunden Laufen, dazu etwa 1 Stunde Kraft und Mobilität.');
    var needRuns = rec[0] >= (d >= 21 ? 55 : 45) ? 5 : rec[0] >= (d >= 21 ? 38 : 30) ? 4 : 3;
    if (needRuns > c.R) lines.push('Läufe pro Woche: Du planst ' + c.R + '. Für diesen Umfang sind eher ' + needRuns + ' sinnvoll, sonst werden die einzelnen Läufe sehr lang.');
    var weeksNeeded = c.cur >= rec[0] ? 0 : Math.ceil(Math.log(rec[0] / c.cur) / Math.log(1.09) * 1.25) + TAPER[c.dkey] + 1;
    if (weeksNeeded > c.W) {
      var more = weeksNeeded - c.W, extra = '';
      if (c.raceDate) { var nd = addDays(c.raceDate, more * 7); extra = ' Verschiebe dein Zieldatum auf etwa ' + de(nd) + '.'; }
      lines.push('Vom heutigen Umfang (' + Math.round(c.cur) + ' km) bis zum Richtwert brauchst du vorsichtig etwa ' + weeksNeeded + ' Wochen (höchstens 9 % mehr pro Woche, jede vierte Woche weniger). Du hast ' + c.W + '.' + extra);
    }
    if (c.ref) {
      var e = (c.dkey === '42' && c.ref.d <= 21.1) ? 1.10 : 1.06;
      pred = c.ref.min * Math.pow(d / c.ref.d, e); imp = (pred - c.goal) / pred;
      impLevel = imp <= 0 ? 0 : imp <= allowed * 0.5 ? 0 : imp <= allowed ? 1 : imp <= allowed * 1.5 ? 2 : 3;
      lines.push('Deine Bestzeit (' + fmtTime(c.ref.min) + ' über ' + (NAME[String(Math.round(c.ref.d) === 21 ? 21 : Math.round(c.ref.d))] || c.ref.d + ' km') + ') entspricht heute etwa ' + fmtTime(pred) + ' über ' + NAME[c.dkey] + (c.dkey === '42' ? ' (Marathon-Prognosen sind unsicher)' : '') + '. ' + (imp > 0 ? 'Dein Ziel ist ' + (Math.round(imp * 1000) / 10).toString().replace('.', ',') + ' % schneller. Bei ' + c.W + ' Wochen halte ich bis etwa ' + (Math.round(allowed * 1000) / 10).toString().replace('.', ',') + ' % für machbar.' : 'Dein Ziel liegt auf dem Niveau deiner heutigen Form oder darunter.'));
      if (impLevel >= 2) lines.push('Realistischer wären etwa ' + fmtTime(pred * (1 - allowed * 0.5)) + ' bis ' + fmtTime(pred * 0.99) + '.');
    }
    var level = Math.max(volLevel, impLevel === null ? 0 : impLevel);
    var head = ['Machbar nach diesen Richtwerten.', 'Ambitioniert, aber möglich, wenn du den Plan konsequent durchziehst.', 'Sehr ambitioniert. Rechne mit Rückschlägen und einem erhöhten Verletzungsrisiko.', 'Aus meiner Sicht in dieser Zeit nicht realistisch.'][level];
    lines.push('Das sind Faustwerte. Alter, Verletzungen, Schlaf und Alltag zählen oft mehr als jede Tabelle. Im Zweifel nimm lieber ein vorsichtigeres Ziel oder mehr Zeit.');
    return { level: level, headline: head, lines: lines, noRef: !c.ref, rec: rec };
  }

  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function de(d) { return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear(); }

  function buildPlan(o) {
    var dkey = String(o.dist), W = clamp(parseInt(o.weeks, 10) || 12, 6, 24), R = clamp(parseInt(o.runs, 10) || 4, 3, 5);
    var goal = o.goalMin, cur = clamp(Number(o.curKm) || 15, 5, 120);
    if (!DIST[dkey]) throw new Error('Unbekannte Distanz');
    if (!(goal > 0)) throw new Error('Zielzeit fehlt oder ist ungültig');
    var pc = paces(dkey, goal), vs = volumes(dkey, W, R, cur), tap = TAPER[dkey];
    var raceDate = o.raceDate ? new Date(o.raceDate + 'T00:00:00') : null;
    var mon0 = null;
    if (raceDate) { var dow = (raceDate.getDay() + 6) % 7; mon0 = addDays(raceDate, -dow - 7 * (W - 1)); }
    var weeks = [];
    for (var i = 0; i < W; i++) {
      var isRace = i === W - 1, phase = i >= vs.build ? 'Tapering' : phaseOf(i, vs.build), V = vs.vol[i];
      var tmpl = DAYS[R], w = WEIGHT[R];
      var longKm = round05(vs.longs[i]);
      var rest = Math.max(0, V - longKm);
      var sess = tmpl.map(function (t) {
        var type = t[1], kmv;
        if (type === 'L') kmv = longKm;
        else kmv = rest * w[type];
        kmv = Math.max(3, round05(kmv));
        return { dayIdx: t[0], day: DN[t[0]], type: type, km: kmv };
      });
      if (R === 5) { // Summe der Gewichte bei 5 Läufen: 0.28 + 0.17*2 + 0.30 = 0.92, Rest auf Q2
        var tot = sess.reduce(function (a, s) { return a + (s.type === 'L' ? 0 : s.km); }, 0);
        var diff = rest - tot; var q2 = sess.filter(function (s) { return s.type === 'Q2'; })[0]; if (q2) q2.km = Math.max(3, round05(q2.km + diff));
      }
      var date = mon0 ? addDays(mon0, 7 * i) : null;
      var raceNote = null;
      if (isRace) {
        var raceIdx = raceDate ? (raceDate.getDay() + 6) % 7 : 6;
        sess = sess.filter(function (s) { return s.dayIdx < raceIdx - 1; });
        var remain = Math.max(0, V - DIST[dkey]);
        var each = sess.length ? Math.max(3, round05(Math.min(6, remain / sess.length))) : 0;
        sess.forEach(function (s, k) { s.type = k === sess.length - 1 ? 'S' : 'E'; s.km = each; });
        raceNote = { dayIdx: raceIdx, day: DN[raceIdx] };
      }
      sess.forEach(function (s) {
        var ty = s.type, ph = phase === 'Tapering' ? 'Spezifisch' : phase;
        if (phase === 'Tapering' && s.type !== 'S') { ty = s.type === 'L' ? 'L' : (s.type === 'E' ? 'E' : 'Q2'); ph = 'Grundlage'; }
        s.desc = s.type === 'S' ? 'Kurzer lockerer Lauf mit 4 × 80 m Steigerungen. Zielpace kurz anfühlen.' : describe(ty, ph, dkey, s.km, pc);
        s.steps = stepsFor(s.type === 'S' ? 'E' : ty, ph, dkey, s.km, pc);
        if (date) s.date = addDays(date, s.dayIdx);
      });
      var sum = sess.reduce(function (a, s) { return a + s.km; }, 0) + (isRace ? DIST[dkey] : 0);
      var kraft = o.kraft ? kraftFor(i + 1, phase, ((i + 1) % 4 === 0) && i < vs.build - 1, R, isRace) : [];
      kraft.forEach(function (k) { if (date) k.date = addDays(date, k.dayIdx); });
      weeks.push({ n: i + 1, phase: phase, monday: date, volume: sum, sessions: sess, kraft: kraft, race: raceNote, raceDay: isRace });
    }
    var warn = [];
    if (vs.peak < PEAK4[dkey] * ({ 3: 0.8, 4: 1, 5: 1.2 }[R]) * 0.8) warn.push('Dein Umfang steigt in den gewählten Wochen nur bis etwa ' + Math.round(vs.peak) + ' km pro Woche. Für diese Zielzeit ist das knapp. Mehr Wochen oder ein höherer Startumfang helfen.');
    if ((dkey === '21' || dkey === '42') && vs.maxLong < vs.longCap * 0.85) warn.push('Dein längster Lauf erreicht nur etwa ' + Math.round(vs.maxLong) + ' km (Plan-Annahme für diese Distanz: ' + vs.longCap + ' km). Die Wochen reichen für einen vorsichtigen Aufbau nicht ganz. Plane mehr Wochen ein oder wähle ein vorsichtigeres Ziel.');
    if (cur < 0.35 * vs.peak && W < 12 && dkey !== '5') warn.push('Der Sprung vom heutigen Umfang zur Spitze ist groß für ' + W + ' Wochen. Plane lieber mehr Zeit ein.');
    var check = realityCheck({ dkey: dkey, goal: goal, W: W, R: R, cur: cur, peak: vs.peak, maxLong: vs.maxLong, easySec: pc.easy, ref: o.ref || null, raceDate: raceDate });
    return { dist: dkey, distName: NAME[dkey], goalMin: goal, weeks: W, runs: R, curKm: cur, peak: vs.peak, paces: pc, plan: weeks, raceDate: raceDate, warnings: warn, check: check, interactive: !!o.interactive };
  }

  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function toICS(p) {
    if (!p.raceDate) return '';
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Laufplan//DE', 'CALSCALE:GREGORIAN'];
    var stamp = '20260101T000000Z', n = 0;
    p.plan.forEach(function (w) {
      w.sessions.forEach(function (s) {
        var d = s.date, d2 = addDays(d, 1);
        L.push('BEGIN:VEVENT', 'UID:laufplan-' + (++n) + '-' + iso(d) + '@laufplan', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + iso(d).replace(/-/g, ''), 'DTEND;VALUE=DATE:' + iso(d2).replace(/-/g, ''),
          'SUMMARY:' + icsEscape('Lauf ' + km(s.km) + ' (' + labelType(s.type) + ')'), 'DESCRIPTION:' + icsEscape(s.desc), 'END:VEVENT');
      });
      (w.kraft || []).forEach(function (k) {
        var d = k.date, d2 = addDays(d, 1);
        L.push('BEGIN:VEVENT', 'UID:laufplan-kraft-' + (++n) + '-' + iso(d) + '@laufplan', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + iso(d).replace(/-/g, ''), 'DTEND;VALUE=DATE:' + iso(d2).replace(/-/g, ''), 'SUMMARY:' + icsEscape('Kraft ' + k.set + ' und Mobilität'), 'DESCRIPTION:' + icsEscape(k.desc), 'END:VEVENT');
      });
      if (w.raceDay) {
        var rd = p.raceDate, rd2 = addDays(rd, 1);
        L.push('BEGIN:VEVENT', 'UID:laufplan-race@laufplan', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + iso(rd).replace(/-/g, ''), 'DTEND;VALUE=DATE:' + iso(rd2).replace(/-/g, ''), 'SUMMARY:' + icsEscape('Zieltag: ' + p.distName + ' in ' + fmtTime(p.goalMin)), 'END:VEVENT');
      }
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }
  function labelType(t) { return { E: 'locker', L: 'lang', Q1: 'Intervall', Q2: 'Tempo', S: 'locker vor dem Zieltag' }[t] || t; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function renderHTML(p) {
    var h = '<h2>' + esc(p.distName) + ' in ' + fmtTime(p.goalMin) + ' · ' + p.weeks + ' Wochen · ' + p.runs + ' Läufe pro Woche</h2>';
    h += '<table class="paces"><thead><tr><th>Locker</th><th>Lang</th><th>Tempo</th><th>Intervall</th><th>Zielpace</th></tr></thead><tbody><tr><td>' + fmtPace(p.paces.easy) + '</td><td>' + fmtPace(p.paces.long) + '</td><td>' + fmtPace(p.paces.tempo) + '</td><td>' + fmtPace(p.paces.intervall) + '</td><td>' + fmtPace(p.paces.ziel) + '</td></tr></tbody></table>';
    var ck = p.check;
    if (ck) {
      h += '<div class="check"><h3>Ehrliche Einschätzung</h3><p class="' + (ck.level === 0 ? 'ok' : 'warn') + '"><b>' + esc(ck.headline) + '</b></p><ul>';
      ck.lines.forEach(function (l) { h += '<li>' + esc(l) + '</li>'; });
      if (ck.noRef && p.interactive) h += '<li>Ohne eine aktuelle Bestzeit kann ich nicht prüfen, wie weit dein Ziel von deiner heutigen Form entfernt ist. Trag oben eine Bestzeit ein, dann wird die Einschätzung ehrlicher.</li>';
      h += '</ul></div>';
    }
    p.warnings.forEach(function (w) { h += '<p class="warn">' + esc(w) + '</p>'; });
    h += '<table class="weeks"><thead><tr><th>Woche</th><th>Phase</th><th>Umfang</th><th>Einheiten</th></tr></thead><tbody>';
    p.plan.forEach(function (w) {
      h += '<tr><td>' + w.n + (w.monday ? '<br><small>ab ' + de(w.monday) + '</small>' : '') + '</td><td>' + w.phase + '</td><td>' + km(w.volume) + '</td><td>';
      w.sessions.forEach(function (s) { h += '<div><b>' + s.day + (s.date ? ' ' + ('0' + s.date.getDate()).slice(-2) + '.' + ('0' + (s.date.getMonth() + 1)).slice(-2) + '.' : '') + ' · ' + km(s.km) + '</b> ' + esc(s.desc) + '</div>'; });
      (w.kraft || []).forEach(function (k) { h += '<div><b>' + k.day + (k.date ? ' ' + ('0' + k.date.getDate()).slice(-2) + '.' + ('0' + (k.date.getMonth() + 1)).slice(-2) + '.' : '') + ' · Kraft ' + k.set + '</b> ' + esc(k.desc) + '</div>'; });
      if (w.raceDay) h += '<div><b>' + w.race.day + (p.raceDate ? ' ' + de(p.raceDate) : '') + ' · Zieltag</b> ' + esc(p.distName) + ' in Zielzeit ' + fmtTime(p.goalMin) + '. Die ersten Kilometer eher ruhig, dann Zielpace halten.</div>';
      h += '</td></tr>';
    });
    h += '</tbody></table>';
    return h;
  }

  /* Zeit mit Distanz deuten: "1:50" ist bei einem Halbmarathon 1 Std 50 Min, "25:30" bei 5 km 25 Min 30 Sek. */
  function parseTimeFor(str, distKm) {
    var p = String(str).trim().split(':').map(Number);
    if (p.some(function (n) { return !isFinite(n) || n < 0; }) || p.length < 2 || p.length > 3) return NaN;
    if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
    var ms = p[0] + p[1] / 60, hm = p[0] * 60 + p[1];
    var ok = function (m) { var pace = m / distKm; return pace >= 2.5 && pace <= 12; };
    if (ok(ms) && ok(hm)) return distKm >= 21 ? hm : ms;
    if (ok(hm)) return hm;
    if (ok(ms)) return ms;
    return NaN;
  }

  var API = { parseTimeFor: parseTimeFor, weeksUntil: weeksUntil, recVolume: recVolume, buildPlan: buildPlan, toICS: toICS, renderHTML: renderHTML, parseTime: parseTime, fmtTime: fmtTime, fmtPace: fmtPace, NAME: NAME, DIST: DIST, mondayOf: mondayOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Laufplan = API;
})(typeof window !== 'undefined' ? window : this);
