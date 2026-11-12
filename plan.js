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
    if (o && o.sport && sportKey(o.sport) !== 'lauf') return buildMulti(o);
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
          'SUMMARY:' + icsEscape(p.sport ? (p.sport === 'rad' ? 'Rad ' : 'Schwimmen ') + s.amount + ' (' + s.chip[1] + ')' : 'Lauf ' + km(s.km) + ' (' + labelType(s.type) + ')'), 'DESCRIPTION:' + icsEscape(s.desc), 'END:VEVENT');
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
    var h = '<h2>' + esc(p.distName) + ' in ' + fmtTime(p.goalMin) + ' · ' + p.weeks + ' Wochen · ' + p.runs + ' ' + (p.sessWord || 'Läufe pro Woche') + '</h2>';
    if (p.zones) h += '<table class="paces"><thead><tr>' + p.zones.map(function (z) { return '<th>' + esc(z.label) + '</th>'; }).join('') + '</tr></thead><tbody><tr>' + p.zones.map(function (z) { return '<td>' + esc(z.val + ' ' + z.unit) + '</td>'; }).join('') + '</tr></tbody></table>';
    else h += '<table class="paces"><thead><tr><th>Locker</th><th>Lang</th><th>Tempo</th><th>Intervall</th><th>Zielpace</th></tr></thead><tbody><tr><td>' + fmtPace(p.paces.easy) + '</td><td>' + fmtPace(p.paces.long) + '</td><td>' + fmtPace(p.paces.tempo) + '</td><td>' + fmtPace(p.paces.intervall) + '</td><td>' + fmtPace(p.paces.ziel) + '</td></tr></tbody></table>';
    var ck = p.check;
    if (ck) {
      h += '<div class="check"><h3>Ehrliche Einschätzung</h3><p class="' + (ck.level === 0 ? 'ok' : 'warn') + '"><b>' + esc(ck.headline) + '</b></p><ul>';
      ck.lines.forEach(function (l) { h += '<li>' + esc(l) + '</li>'; });
      if (ck.noRef && p.interactive && ck.refHint) h += '<li>' + esc(ck.refHint) + '</li>';
      else if (ck.noRef && p.interactive) h += '<li>Ohne eine aktuelle Bestzeit kann ich nicht prüfen, wie weit dein Ziel von deiner heutigen Form entfernt ist. Trag oben eine Bestzeit ein, dann wird die Einschätzung ehrlicher.</li>';
      h += '</ul></div>';
    }
    p.warnings.forEach(function (w) { h += '<p class="warn">' + esc(w) + '</p>'; });
    h += '<table class="weeks"><thead><tr><th>Woche</th><th>Phase</th><th>Umfang</th><th>Einheiten</th></tr></thead><tbody>';
    p.plan.forEach(function (w) {
      h += '<tr><td>' + w.n + (w.monday ? '<br><small>ab ' + de(w.monday) + '</small>' : '') + '</td><td>' + w.phase + '</td><td>' + (w.volumeText || km(w.volume)) + '</td><td>';
      w.sessions.forEach(function (s) { h += '<div><b>' + s.day + (s.date ? ' ' + ('0' + s.date.getDate()).slice(-2) + '.' + ('0' + (s.date.getMonth() + 1)).slice(-2) + '.' : '') + ' · ' + (s.amount || km(s.km)) + '</b> ' + esc(s.desc) + '</div>'; });
      (w.kraft || []).forEach(function (k) { h += '<div><b>' + k.day + (k.date ? ' ' + ('0' + k.date.getDate()).slice(-2) + '.' + ('0' + (k.date.getMonth() + 1)).slice(-2) + '.' : '') + ' · Kraft ' + k.set + '</b> ' + esc(k.desc) + '</div>'; });
      if (w.raceDay) h += '<div><b>' + w.race.day + (p.raceDate ? ' ' + de(p.raceDate) : '') + ' · Zieltag</b> ' + esc(p.distName) + (p.raceText ? '. ' + esc(p.raceText) : ' in Zielzeit ' + fmtTime(p.goalMin) + '. Die ersten Kilometer eher ruhig, dann Zielpace halten.') + '</div>';
      h += '</td></tr>';
    });
    h += '</tbody></table>';
    return h;
  }

  /* ---- Moderne Ansicht: Einschätzung, Diagramm, Tempo-Chips, Wochenkarten ---- */
  function chipFor(s) {
    var d = s.desc || '';
    if (s.type === 'S') return ['Z', 'Locker'];
    if (/^Langer Lauf/.test(d)) return ['L', 'Lang'];
    if (/^Fahrtspiel/.test(d)) return ['Q', 'Fahrtspiel'];
    if (/× (1000|2000) m/.test(d)) return ['Q', 'Intervall'];
    if (/^Tempodauerlauf/.test(d)) return ['T', 'Tempo'];
    if (/^Renntempo/.test(d)) return ['T', 'Renntempo'];
    return ['E', 'Locker'];
  }
  function dd(d) { return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.'; }
  var PHC = { 'Grundlage': 'g', 'Aufbau': 'a', 'Spezifisch': 's', 'Tapering': 't' };
  function renderVerdict(p) {
    var ck = p.check; if (!ck) return '';
    var h = '<section class="verdict v' + ck.level + '"><div class="vhead"><span class="vbadge">' + ['Machbar', 'Ambitioniert', 'Sehr ambitioniert', 'Nicht realistisch'][ck.level] + '</span><h3>' + esc(ck.headline) + '</h3></div><ul>';
    ck.lines.forEach(function (l) { h += '<li>' + esc(l) + '</li>'; });
    if (ck.noRef && p.interactive && ck.refHint) h += '<li class="hint">' + esc(ck.refHint) + '</li>';
    else if (ck.noRef && p.interactive) h += '<li class="hint">Mit deiner letzten Bestzeit (oben, optional) prüfe ich ehrlicher, wie weit dein Ziel von deiner heutigen Form entfernt ist.</li>';
    return h + '</ul></section>';
  }
  function renderChart(p) {
    var W = 720, H = 230, L = 40, R = 10, T = 18, B = 34, n = p.plan.length, ck = p.check, rec = ck ? ck.rec : null;
    var max = Math.max.apply(null, p.plan.map(function (w) { return w.volume; }).concat(rec ? [rec[1]] : [])) * 1.1;
    var bw = (W - L - R) / n, s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Wochenumfang in Kilometern pro Woche">';
    var step = !p.sport ? (max > 80 ? 20 : 10) : max > 400 ? 100 : max > 200 ? 50 : max > 80 ? 20 : max > 40 ? 10 : max > 16 ? 5 : max > 8 ? 2 : 1;
    for (var g = 0; g <= max; g += step) { var y = T + (1 - g / max) * (H - T - B); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" class="ax">' + g + '</text>'; }
    if (rec) {
      var yr0 = T + (1 - rec[0] / max) * (H - T - B), yr1 = T + (1 - rec[1] / max) * (H - T - B);
      s += '<rect x="' + L + '" y="' + yr1.toFixed(1) + '" width="' + (W - L - R) + '" height="' + Math.max(1, yr0 - yr1).toFixed(1) + '" class="recband"/><text x="' + (W - R - 4) + '" y="' + (yr1 + 12).toFixed(1) + '" text-anchor="end" class="reclabel">Richtwert Spitze ' + rec[0] + ' bis ' + rec[1] + ' km</text>';
    }
    p.plan.forEach(function (w, i) {
      var h = (w.volume / max) * (H - T - B), x = L + i * bw + bw * 0.14, y2 = H - B - h;
      s += '<rect x="' + x.toFixed(1) + '" y="' + y2.toFixed(1) + '" width="' + (bw * 0.72).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" class="bar ph-' + PHC[w.phase] + '"><title>Woche ' + w.n + ': ' + (w.volumeText || Math.round(w.volume) + ' km') + ' (' + w.phase + ')</title></rect>';
      if (n <= 14 || (i + 1) % 2 === 1 || w.raceDay) s += '<text x="' + (x + bw * 0.36).toFixed(1) + '" y="' + (H - B + 14) + '" text-anchor="middle" class="ax">' + w.n + '</text>';
    });
    s += '<text x="' + L + '" y="' + (H - 4) + '" class="ax">Woche</text></svg>';
    s += '<div class="legend"><span><i class="ph-g"></i>Grundlage</span><span><i class="ph-a"></i>Aufbau</span><span><i class="ph-s"></i>Spezifisch</span><span><i class="ph-t"></i>Tapering</span><span><i class="rb"></i>Richtwert</span></div>';
    return s;
  }
  function renderPaces(p) {
    if (p.zones) return '<div class="paces">' + p.zones.map(function (z) { return '<div class="pace pc-' + z.cls + '"><span>' + esc(z.label) + '</span><b>' + esc(z.val) + '</b><small>' + esc(z.unit) + '</small></div>'; }).join('') + '</div>';
    var pc = p.paces, items = [['Locker', pc.easy, 'e'], ['Lang', pc.long, 'l'], ['Tempo', pc.tempo, 't'], ['Intervall', pc.intervall, 'q'], ['Zielpace', pc.ziel, 'z']], h = '<div class="paces">';
    items.forEach(function (it) { h += '<div class="pace pc-' + it[2] + '"><span>' + it[0] + '</span><b>' + fmtPace(it[1]).replace(' min/km', '') + '</b><small>min/km</small></div>'; });
    return h + '</div>';
  }
  function renderWeeks(p) {
    var h = '<div class="weeks">';
    p.plan.forEach(function (w, i) {
      h += '<details class="week"' + (i < 2 ? ' open' : '') + '><summary><span class="wn">Woche ' + w.n + '</span>' + (w.monday ? '<span class="wd">ab ' + dd(w.monday) + '</span>' : '') + '<span class="pill ph-' + PHC[w.phase] + '">' + w.phase + '</span><span class="wv">' + (w.volumeText || Math.round(w.volume) + ' km') + '</span></summary><ul class="sess">';
      w.sessions.forEach(function (s) {
        var c = s.chip || chipFor(s);
        h += '<li><span class="day">' + s.day + (s.date ? '<small>' + dd(s.date) + '</small>' : '') + '</span><span class="chip t-' + c[0] + '">' + c[1] + '</span><b class="km">' + (s.amount || km(s.km)) + '</b><span class="desc">' + esc(s.desc) + '</span></li>';
      });
      (w.kraft || []).forEach(function (k) {
        h += '<li><span class="day">' + k.day + (k.date ? '<small>' + dd(k.date) + '</small>' : '') + '</span><span class="chip t-K">Kraft ' + k.set + '</span><b class="km">45 Min</b><span class="desc">' + esc(k.desc) + '</span></li>';
      });
      if (w.raceDay) h += '<li class="race"><span class="day">' + w.race.day + (p.raceDate ? '<small>' + dd(p.raceDate) + '</small>' : '') + '</span><span class="chip t-F">Zieltag</span><b class="km">' + esc(p.distName) + '</b><span class="desc">' + (p.raceText ? esc(p.raceText) : 'Zielzeit ' + fmtTime(p.goalMin) + '. Die ersten Kilometer eher ruhig, dann Zielpace halten.') + '</span></li>';
      h += '</ul></details>';
    });
    return h + '</div>';
  }

  /* Zeit mit Distanz deuten: "1:50" ist bei einem Halbmarathon 1 Std 50 Min, "25:30" bei 5 km 25 Min 30 Sek.
     Optional sport: 'rad' (plausibel 10 bis 50 km/h) oder 'schwimmen' (plausibel 0:55 bis 4:00 min pro 100 m). Ohne sport: Laufen wie bisher. */
  function parseTimeFor(str, distKm, sport) {
    var p = String(str).trim().split(':').map(Number);
    if (p.some(function (n) { return !isFinite(n) || n < 0; }) || p.length < 2 || p.length > 3) return NaN;
    if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
    var ms = p[0] + p[1] / 60, hm = p[0] * 60 + p[1];
    var sk = sportKey(sport);
    var ok = sk === 'rad' ? function (m) { var v = distKm / (m / 60); return v >= 10 && v <= 50; }
      : sk === 'schwimmen' ? function (m) { var s100 = m * 60 / (distKm * 10); return s100 >= 55 && s100 <= 240; }
      : function (m) { var pace = m / distKm; return pace >= 2.5 && pace <= 12; };
    if (sk === 'rad' && ok(ms) && ok(hm)) return hm;
    if (sk === 'schwimmen' && ok(ms) && ok(hm)) return ms;
    if (ok(ms) && ok(hm)) return distKm >= 21 ? hm : ms;
    if (ok(hm)) return hm;
    if (ok(ms)) return ms;
    return NaN;
  }

  /* ================= Multisport: Radfahren und Schwimmen =================
     Aufruf: buildPlan({ sport: 'rad' | 'schwimmen', dist, goalMin, weeks, runs (= Einheiten pro Woche), curKm, raceDate, ... }).
     Ohne sport (oder sport 'lauf') rechnet buildPlan exakt wie bisher. Alles Faustwerte, Quellen im README. */
  function sportKey(s) {
    s = String(s || '').toLowerCase();
    if (s === 'rad' || s === 'radfahren' || s === 'bike' || s === 'cycling' || s === 'rennrad') return 'rad';
    if (s === 'schwimmen' || s === 'swim' || s === 'swimming') return 'schwimmen';
    return 'lauf';
  }
  var SPORTS = {
    lauf: { name: 'Laufen', unit: 'km', sessions: [3, 4, 5], sessDefault: 4, sessWord: 'Läufe pro Woche', cur: { min: 5, max: 120, def: 25, step: 1 },
      dists: [['5', '5 km'], ['10', '10 km'], ['21', 'Halbmarathon'], ['42', 'Marathon']], distDefault: '21', goalDefault: '2:00:00' },
    rad: { name: 'Radfahren', unit: 'km', sessions: [3, 4, 5], sessDefault: 3, sessWord: 'Ausfahrten pro Woche', cur: { min: 0, max: 500, def: 60, step: 5 },
      dists: [['50', '50 km'], ['100', '100 km'], ['160', '160 km'], ['200', '200 km']], distDefault: '100', goalDefault: '4:00',
      D: { '50': 50, '100': 100, '160': 160, '200': 200 }, N: { '50': '50 km Rad', '100': '100 km Rad', '160': '160 km Rad (100 Meilen)', '200': '200 km Rad' },
      longCap: { '50': 60, '100': 85, '160': 130, '200': 160 },   // längste Ausfahrt: etwa 75 bis 85 % der Strecke (bei 50 km etwas mehr)
      taper: { '50': 1, '100': 1, '160': 2, '200': 2 }, ramp: 1.10, longStep: 15, longShare: 0.6, minSess: 20, minWeek: 30, rnd: 5,
      rf: { 3: 0.9, 4: 1, 5: 1.1 },   // Spitzenumfang = Mitte des Richtwerts × Faktor je Anzahl Ausfahrten
      days: { 3: [[1, 'Q2'], [3, 'E'], [5, 'L']], 4: [[1, 'Q1'], [2, 'E'], [3, 'Q2'], [5, 'L']], 5: [[1, 'Q1'], [2, 'E'], [3, 'Q2'], [5, 'L'], [6, 'E']] },
      kday: { 3: [2, 4], 4: [4, 0], 5: [4, 0] } },
    schwimmen: { name: 'Schwimmen', unit: 'km', sessions: [2, 3, 4], sessDefault: 3, sessWord: 'Einheiten pro Woche', cur: { min: 0, max: 30, def: 3, step: 0.5 },
      dists: [['0.75', '750 m'], ['1.5', '1,5 km'], ['2.5', '2,5 km'], ['3.8', '3,8 km']], distDefault: '1.5', goalDefault: '35:00',
      D: { '0.75': 0.75, '1.5': 1.5, '2.5': 2.5, '3.8': 3.8 }, N: { '0.75': '750 m Schwimmen', '1.5': '1,5 km Schwimmen', '2.5': '2,5 km Schwimmen', '3.8': '3,8 km Schwimmen' },
      longCap: { '0.75': 2, '1.5': 2.8, '2.5': 3.4, '3.8': 4.2 },  // längste Einheit in km (Hauptsatz bis etwa Wettkampfstrecke)
      taper: { '0.75': 1, '1.5': 1, '2.5': 1, '3.8': 2 }, ramp: 1.10, longStep: 0.4, longShare: 0.5, minSess: 1, minWeek: 1.5, rnd: 0.1,
      rf: { 2: 0.8, 3: 1, 4: 1.15 }, cssOff: { '0.75': -2, '1.5': 0, '2.5': 3, '3.8': 5 },
      days: { 2: [[1, 'Q'], [4, 'L']], 3: [[0, 'T'], [2, 'Q'], [5, 'L']], 4: [[0, 'T'], [2, 'Q'], [3, 'T'], [5, 'L']] },
      kday: { 2: [2, 5], 3: [1, 4], 4: [1, 4] } }
  };
  function sportInfo(s) { var k = sportKey(s), c = SPORTS[k]; return { key: k, name: c.name, unit: c.unit, sessions: c.sessions, sessDefault: c.sessDefault, sessWord: c.sessWord, cur: c.cur, dists: c.dists, distDefault: c.distDefault, goalDefault: c.goalDefault }; }
  function nf(x, d) { return (Math.round(x * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toString().replace('.', ','); }
  function rndTo(x, r) { return Math.round(x / r) * r; }
  function fmtDur(min) { min = Math.round(min / 5) * 5; var h = Math.floor(min / 60), m = min % 60; return h ? h + ' Std' + (m ? ' ' + m + ' Min' : '') : m + ' Min'; }
  function fmtHM(min) { var t = Math.round(min), h = Math.floor(t / 60), m = t % 60; return h + ':' + (m < 10 ? '0' : '') + m; }
  function fmtSwim(sec) { var m = Math.floor(sec / 60), s = Math.round(sec - m * 60); if (s === 60) { m++; s = 0; } return m + ':' + (s < 10 ? '0' : '') + s + ' /100 m'; }
  function meters(k) { var m = Math.round(k * 1000); return (m >= 1000 ? Math.floor(m / 1000) + '.' + ('00' + (m % 1000)).slice(-3) : String(m)) + ' m'; }

  /* Umfang: gleiche Logik wie beim Laufen (höchstens 10 % mehr pro Woche, jede vierte Woche leichter, lange Einheit wächst schrittweise). */
  function genVolumes(c, dkey, W, R, cur, peakT) {
    var tap = c.taper[dkey], build = W - tap, cap = c.longCap[dkey];
    var v = [], lg = [], x = Math.max(cur, c.minWeek), prevX = x, prevL = 0, baseLong = clamp(cur * 0.4, c.minSess, cap * 0.6);
    for (var i = 0; i < build; i++) {
      var deload = ((i + 1) % 4 === 0) && i < build - 1, vi, li;
      if (!deload) {
        if (i > 0) x = Math.min(Math.max(peakT, prevX), x * c.ramp);
        var tL = baseLong + (cap - baseLong) * (build > 1 ? i / (build - 1) : 1);
        var l = i === 0 ? baseLong : Math.min(tL, prevL + c.longStep);
        var need = l / c.longShare;
        if (need > x) { var lim = i === 0 ? need : prevX * 1.12; x = Math.min(need, Math.max(x, lim)); }
        l = Math.min(l, x * c.longShare);
        prevL = l; prevX = x; vi = x; li = l;
      } else { vi = prevX * 0.75; li = prevL * 0.8; }
      v.push(vi); lg.push(li);
    }
    var peak = Math.max.apply(null, v), maxLong = Math.max.apply(null, lg);
    TAPERM[tap].forEach(function (m) { v.push(peak * m); lg.push(Math.max(c.minSess, maxLong * m * 0.8)); });
    return { vol: v, longs: lg, peak: peak, build: build, maxLong: maxLong, longCap: cap };
  }

  /* ---- Rad: Leistung nach Coggan-Zonen (% FTP), Tempo über ein einfaches Fahrphysik-Modell ---- */
  var BIKE = { cda: 0.32, crr: 0.005, rho: 1.2, eta: 0.96, bike: 9, weight: 75 };  // Oberlenker, Rennrad auf Asphalt, Meereshöhe
  var TERRAIN = { flach: { f: 1, name: 'flach' }, huegelig: { f: 0.88, name: 'hügelig' }, bergig: { f: 0.75, name: 'bergig' } };
  var BZ = { G: [56, 75, 'Grundlage'], T: [76, 87, 'Tempo'], SS: [88, 94, 'Sweet Spot'], S: [95, 105, 'Schwelle'], V: [106, 120, 'VO2max'] };
  var RPE = { G: 'Gefühl 3 bis 4 von 10', T: 'Gefühl 5 bis 6 von 10', SS: 'Gefühl 6 bis 7 von 10', S: 'Gefühl 7 bis 8 von 10', V: 'Gefühl 8 bis 9 von 10' };
  function bikePower(kmh, mass) { var v = kmh / 3.6; return (0.5 * BIKE.rho * BIKE.cda * v * v * v + BIKE.crr * mass * 9.81 * v) / BIKE.eta; }
  function bikeSpeed(P, mass) { var lo = 1, hi = 90; for (var k = 0; k < 60; k++) { var mid = (lo + hi) / 2; if (bikePower(mid, mass) > P) hi = mid; else lo = mid; } return (lo + hi) / 2; }
  function holdFrac(h) { return clamp(0.92 - 0.09 * Math.log(Math.max(h, 0.5)) / Math.LN2, 0.6, 0.95); } // Anteil der FTP, den Hobbysportler über h Stunden halten
  function bikeZone(pc, z) { var b = BZ[z]; return pc.ftp ? Math.round(pc.ftp * b[0] / 100) + ' bis ' + Math.round(pc.ftp * b[1] / 100) + ' W' : b[0] + ' bis ' + b[1] + ' % FTP, ' + RPE[z]; }
  function bikeZiel(pc) { return nf(pc.ziel, 1) + ' km/h' + (pc.ftp ? ', etwa ' + Math.round(pc.ftp * pc.hold) + ' W' : ', etwa ' + Math.round(pc.hold * 100) + ' % FTP'); }
  function bikePaces(dkey, goalMin, o) {
    var c = SPORTS.rad, d = c.D[dkey], h = goalMin / 60, v = d / h, ter = TERRAIN[o.terrain] || TERRAIN.flach;
    var wt = clamp(Number(o.weightKg) || BIKE.weight, 40, 150), mass = wt + BIKE.bike, ftp = Number(o.ftp) > 0 ? clamp(Number(o.ftp), 60, 500) : null;
    var hold = holdFrac(h), needP = bikePower(v / ter.f, mass), easy = ftp ? bikeSpeed(ftp * 0.65, mass) * ter.f : v * 0.88;
    return { ziel: v, easy: clamp(easy, 14, 34), ftp: ftp, hold: hold, needP: needP, needFtp: needP / hold, mass: mass, weight: wt, terrain: ter, hours: h };
  }
  function bikeDesc(type, phase, dkey, kmv, pc) {
    var dur = kmv / pc.easy * 60, n;
    if (type === 'E') return { chip: ['E', 'Grundlage'], desc: 'Grundlagenfahrt, etwa ' + fmtDur(dur) + ' in ' + bikeZone(pc, 'G') + '. Du kannst dich in ganzen Sätzen unterhalten. Trittfrequenz eher hoch, etwa 85 bis 95 pro Minute.' };
    if (type === 'L') {
      var t = 'Lange Ausfahrt, etwa ' + fmtDur(dur) + ' in ' + bikeZone(pc, 'G') + '. Alle 30 bis 45 Minuten essen und trinken, so wie am Zieltag.';
      if (phase === 'Spezifisch' && SPORTS.rad.D[dkey] >= 100) t += ' Die letzten ' + fmtDur(clamp(dur * 0.25, 20, 60)) + ' im Zieltempo (' + bikeZiel(pc) + ').';
      return { chip: ['L', 'Lang'], desc: t };
    }
    if (type === 'Q1') {
      if (phase === 'Grundlage') return { chip: ['Q', 'Trittfrequenz'], desc: 'Grundlagenfahrt, etwa ' + fmtDur(dur) + ', darin 6 × 1 Min mit hoher Trittfrequenz (über 100 pro Minute), 2 Min locker dazwischen.' };
      if (phase === 'Aufbau') { n = clamp(Math.round((dur - 35) / 8), 3, 6); return { chip: ['Q', 'VO2max'], desc: n + ' × 4 Min in ' + bikeZone(pc, 'V') + ', 4 Min locker dazwischen. Davor und danach je 15 Min einrollen. Rest Grundlage, insgesamt etwa ' + fmtDur(dur) + '.' }; }
      n = clamp(Math.round((dur - 35) / 12), 2, 4); return { chip: ['Q', 'Schwelle'], desc: n + ' × 8 Min an der Schwelle (' + bikeZone(pc, 'S') + '), 4 Min locker dazwischen. Rest Grundlage, insgesamt etwa ' + fmtDur(dur) + '.' };
    }
    if (phase === 'Grundlage') { n = clamp(Math.round((dur - 30) / 15), 2, 4); return { chip: ['T', 'Tempo'], desc: n + ' × 10 Min Tempo (' + bikeZone(pc, 'T') + '), 5 Min locker dazwischen. Rest Grundlage, insgesamt etwa ' + fmtDur(dur) + '.' }; }
    if (phase === 'Aufbau') { n = clamp(Math.round((dur - 30) / 17), 2, 4); return { chip: ['T', 'Sweet Spot'], desc: n + ' × 12 Min Sweet Spot (' + bikeZone(pc, 'SS') + '), 5 Min locker dazwischen. Rest Grundlage, insgesamt etwa ' + fmtDur(dur) + '.' }; }
    return { chip: ['T', 'Zieltempo'], desc: 'Zieltempo-Block: ' + fmtDur(clamp(dur * 0.5, 20, 90)) + ' am Stück im Zieltempo (' + bikeZiel(pc) + '). Rest Grundlage, insgesamt etwa ' + fmtDur(dur) + '.' };
  }
  function bikeZones(pc) {
    var z = ['G', 'T', 'SS', 'S', 'V'].map(function (k, i) {
      var b = BZ[k]; return { label: b[2], val: pc.ftp ? Math.round(pc.ftp * b[0] / 100) + '–' + Math.round(pc.ftp * b[1] / 100) : b[0] + '–' + b[1], unit: pc.ftp ? 'Watt' : '% FTP', cls: ['e', 'l', 't', 'q', 'q'][i] };
    });
    z.push({ label: 'Zieltempo', val: nf(pc.ziel, 1), unit: 'km/h im Schnitt', cls: 'z' });
    return z;
  }
  function bikeRec(dkey, v) { // Spitzenwoche in Stunden, nach nötigem Schnitt
    var t = { '50': [[30, [7, 9]], [26, [5, 7]], [22, [4, 5]], [0, [3, 4]]], '100': [[30, [8, 11]], [26, [6, 9]], [22, [5, 7]], [0, [4, 6]]],
      '160': [[30, [10, 13]], [26, [8, 11]], [22, [6, 9]], [0, [5, 7]]], '200': [[30, [11, 14]], [26, [9, 12]], [22, [7, 10]], [0, [6, 8]]] }[dkey];
    for (var i = 0; i < t.length; i++) if (v >= t[i][0]) return t[i][1];
    return t[t.length - 1][1];
  }
  function bikeCheck(c) {
    var pc = c.pc, d = SPORTS.rad.D[c.dkey], lines = [], recH = bikeRec(c.dkey, pc.ziel), trainV = pc.easy, rec = [rndTo(recH[0] * trainV, 10), rndTo(recH[1] * trainV, 10)];
    var ratio = c.peak / rec[0], volLevel = ratio >= 1 ? 0 : ratio >= 0.85 ? 1 : ratio >= 0.7 ? 2 : 3, impLevel = null;
    lines.push('Für ' + nf(pc.ziel, 1) + ' km/h im Schnitt über ' + d + ' km sind etwa ' + recH[0] + ' bis ' + recH[1] + ' Stunden Training pro Woche in der Spitze üblich, bei deinem Grundlagentempo also etwa ' + rec[0] + ' bis ' + rec[1] + ' km. Dein Plan erreicht ungefähr ' + Math.round(c.peak) + ' km (etwa ' + nf(c.peak / trainV, 1) + ' Std), die längste Ausfahrt ' + Math.round(c.maxLong) + ' km.');
    lines.push('Kraftbedarf: Allein im Wind auf ' + pc.terrain.name + 'er Strecke brauchst du für diesen Schnitt etwa ' + Math.round(pc.needP) + ' Watt über ' + fmtHM(c.goal) + ' Std. Das schaffen Hobbysportler mit einer FTP (Leistung, die du etwa eine Stunde halten kannst) von ungefähr ' + Math.round(pc.needFtp) + ' Watt' + (pc.weight !== BIKE.weight || c.weightGiven ? '' : ' (gerechnet mit 75 kg Körpergewicht)') + '. In einer Gruppe im Windschatten geht es spürbar leichter.');
    if (c.maxLong < d * 0.7 && d >= 100) lines.push('Deine längste Ausfahrt im Plan bleibt unter 70 % der Strecke. Üblich sind etwa 75 bis 85 %. Mehr Wochen helfen.');
    var weeksNeeded = c.cur >= rec[0] ? 0 : Math.ceil(Math.log(rec[0] / Math.max(c.cur, SPORTS.rad.minWeek)) / Math.log(1.10) * 1.25) + SPORTS.rad.taper[c.dkey] + 1;
    if (weeksNeeded > c.W) {
      var more = weeksNeeded - c.W, extra = c.raceDate ? ' Verschiebe dein Zieldatum auf etwa ' + de(addDays(c.raceDate, more * 7)) + '.' : '';
      lines.push('Vom heutigen Umfang (' + Math.round(c.cur) + ' km) bis zum Richtwert brauchst du vorsichtig etwa ' + weeksNeeded + ' Wochen (höchstens 10 % mehr pro Woche, jede vierte Woche weniger). Du hast ' + c.W + '.' + extra);
    }
    if (pc.ftp) {
      var allowP = Math.min(0.12, 0.006 * c.W + 0.02), gap = pc.needFtp / pc.ftp - 1;
      impLevel = gap <= allowP * 0.5 ? 0 : gap <= allowP ? 1 : gap <= allowP * 1.5 ? 2 : 3;
      var predV = bikeSpeed(pc.ftp * pc.hold, pc.mass) * pc.terrain.f, predMin = d / predV * 60;
      lines.push('Mit deiner FTP von ' + Math.round(pc.ftp) + ' Watt schaffst du heute etwa ' + nf(predV, 1) + ' km/h, also rund ' + fmtHM(predMin) + ' Std. ' + (gap > 0 ? 'Für dein Ziel fehlen etwa ' + nf(gap * 100, 0) + ' % FTP. In ' + c.W + ' Wochen sind etwa ' + nf(allowP * 100, 0) + ' % mehr FTP machbar, wenn du konsequent trainierst.' : 'Dein Ziel liegt auf dem Niveau deiner heutigen Form oder darunter.'));
      if (impLevel >= 2) lines.push('Realistischer wären etwa ' + fmtHM(d / (bikeSpeed(pc.ftp * (1 + allowP * 0.5) * pc.hold, pc.mass) * pc.terrain.f) * 60) + ' bis ' + fmtHM(predMin * 0.99) + ' Std.');
    }
    var level = Math.max(volLevel, impLevel === null ? 0 : impLevel);
    lines.push('Das sind Faustwerte. Wind, Höhenmeter, Rad, Sitzposition und Gruppe ändern den Schnitt stark. Im Zweifel nimm lieber ein vorsichtigeres Ziel oder mehr Zeit.');
    return { level: level, headline: HEADS[level], lines: lines, noRef: !pc.ftp, rec: rec, refHint: 'Mit deiner FTP und deinem Gewicht (oben, optional) prüfe ich ehrlicher, ob dein Schnitt zu deiner heutigen Form passt.' };
  }
  var HEADS = ['Machbar nach diesen Richtwerten.', 'Ambitioniert, aber möglich, wenn du den Plan konsequent durchziehst.', 'Sehr ambitioniert. Rechne mit Rückschlägen und einem erhöhten Verletzungsrisiko.', 'Aus meiner Sicht in dieser Zeit nicht realistisch.'];

  /* ---- Schwimmen: Tempo pro 100 m rund um die kritische Schwimmgeschwindigkeit (CSS) ---- */
  function swimPaces(dkey, goalMin) {
    var c = SPORTS.schwimmen, ziel = goalMin * 60 / (c.D[dkey] * 10), css = ziel - c.cssOff[dkey];
    return { ziel: ziel, css: css, easy: css + 15, ausdauer: css + 6, schwelle: css, schnell: css - 4 };
  }
  function swimSession(type, phase, dkey, kmv, pc) {
    var T = Math.round(kmv * 10) * 100, dist = SPORTS.schwimmen.D[dkey] * 1000;
    var ein = T >= 2500 ? 400 : T >= 1500 ? 300 : 200, aus = T >= 2000 ? 200 : 100, tech = type === 'T' ? (T >= 2000 ? 400 : 300) : (T >= 1800 ? 200 : 0);
    var main = Math.max(200, T - ein - aus - tech), L, pace, pn, rest, chip, cont = 0;
    if (type === 'T') { L = main >= 800 ? 200 : 100; pace = pc.ausdauer; pn = 'Ausdauer'; rest = 20; chip = ['E', 'Technik']; }
    else if (type === 'Q') {
      chip = ['Q', 'Intervall'];
      if (phase === 'Grundlage') { L = 100; pace = pc.schwelle + 3; pn = 'knapp unter Schwelle'; rest = 15; }
      else if (phase === 'Aufbau') { L = 200; pace = pc.schwelle; pn = 'Schwelle (CSS)'; rest = 20; }
      else if (dist >= 2500) { L = 400; pace = pc.ziel; pn = 'Zielpace'; rest = 30; chip = ['T', 'Zielpace']; }
      else { L = 100; pace = pc.schnell; pn = 'schnell'; rest = 20; }
    } else {
      chip = ['L', 'Lang'];
      if (phase === 'Spezifisch') { cont = Math.min(Math.floor(main / 50) * 50, dist); L = 200; pace = pc.ausdauer; pn = 'Ausdauer'; rest = 20; }
      else { L = phase === 'Aufbau' && main >= 1600 ? 800 : 400; pace = pc.ausdauer; pn = 'Ausdauer'; rest = 30; }
    }
    while (!cont && main / L > 10) L *= 2;   // keine endlosen Serien: höchstens etwa 10 Wiederholungen
    var reps = Math.max(cont ? 0 : 1, Math.round((main - cont) / L)), mainM = cont + reps * L, total = ein + tech + mainM + aus;
    var t = 'Einschwimmen ' + ein + ' m locker' + (tech ? ', ' + (tech / 50) + ' × 50 m Technik (z. B. Abschlagschwimmen, Faustschwimmen, Zählen der Züge)' : '') + ', Hauptsatz ';
    if (cont) t += meters(cont / 1000) + ' am Stück in Zielpace ' + fmtSwim(pc.ziel) + (reps ? ', danach ' + reps + ' × ' + L + ' m ' + pn + ' in ' + fmtSwim(pace) + ' mit ' + rest + ' Sek Pause' : '');
    else t += reps + ' × ' + L + ' m ' + pn + ' in ' + fmtSwim(pace) + ' mit ' + rest + ' Sek Pause';
    t += ', Ausschwimmen ' + aus + ' m locker.';
    return { km: total / 1000, chip: chip, desc: t };
  }
  function swimZones(pc) {
    return [['Locker', pc.easy, 'e'], ['Ausdauer', pc.ausdauer, 'l'], ['Schwelle (CSS)', pc.schwelle, 't'], ['Schnell', pc.schnell, 'q'], ['Zielpace', pc.ziel, 'z']]
      .map(function (x) { return { label: x[0], val: fmtSwim(x[1]).replace(' /100 m', ''), unit: 'min/100 m', cls: x[2] }; });
  }
  function swimRec(dkey, s100) {
    var t = { '0.75': [[150, [3, 5]], [120, [4, 6]], [100, [6, 9]], [0, [8, 12]]], '1.5': [[150, [4, 6]], [120, [5, 8]], [100, [7, 10]], [0, [10, 15]]],
      '2.5': [[150, [5, 7]], [120, [6, 9]], [100, [8, 12]], [0, [12, 18]]], '3.8': [[150, [6, 9]], [120, [8, 11]], [100, [10, 14]], [0, [14, 20]]] }[dkey];
    for (var i = 0; i < t.length; i++) if (s100 >= t[i][0]) return t[i][1];
    return t[t.length - 1][1];
  }
  function swimCheck(c) {
    var pc = c.pc, d = SPORTS.schwimmen.D[c.dkey], rec = swimRec(c.dkey, pc.ziel), lines = [], impLevel = null, allowed = Math.min(0.10, 0.004 * c.W + 0.02);
    var ratio = c.peak / rec[0], volLevel = ratio >= 1 ? 0 : ratio >= 0.85 ? 1 : ratio >= 0.7 ? 2 : 3;
    lines.push('Richtwert für ' + fmtSwim(pc.ziel) + ' über ' + meters(d) + ': etwa ' + rec[0] + ' bis ' + rec[1] + ' km pro Woche in der Spitze. Dein Plan erreicht ungefähr ' + nf(c.peak, 1) + ' km, die längste Einheit ' + meters(c.maxLong) + '.');
    lines.push('Zeitaufwand in der Spitzenwoche: etwa ' + nf(Math.round(c.peak * 10 * (pc.ausdauer + 12) / 3600 * 2) / 2, 1) + ' Stunden im Wasser (mit Pausen). Beim Schwimmen bringt Technik oft mehr als Umfang. Ein Techniktraining mit Videoanalyse lohnt sich.');
    var weeksNeeded = c.cur >= rec[0] ? 0 : Math.ceil(Math.log(rec[0] / Math.max(c.cur, SPORTS.schwimmen.minWeek)) / Math.log(1.10) * 1.25) + SPORTS.schwimmen.taper[c.dkey] + 1;
    if (weeksNeeded > c.W) {
      var more = weeksNeeded - c.W, extra = c.raceDate ? ' Verschiebe dein Zieldatum auf etwa ' + de(addDays(c.raceDate, more * 7)) + '.' : '';
      lines.push('Vom heutigen Umfang (' + nf(c.cur, 1) + ' km) bis zum Richtwert brauchst du vorsichtig etwa ' + weeksNeeded + ' Wochen (höchstens 10 % mehr pro Woche, jede vierte Woche weniger). Du hast ' + c.W + '.' + extra);
    }
    if (c.ref) {
      var pred = c.ref.min * Math.pow(d / c.ref.d, 1.06), imp = (pred - c.goal) / pred;
      impLevel = imp <= allowed * 0.5 ? 0 : imp <= allowed ? 1 : imp <= allowed * 1.5 ? 2 : 3;
      lines.push('Deine Bestzeit (' + fmtTime(c.ref.min) + ' über ' + meters(c.ref.d) + ') entspricht heute etwa ' + fmtTime(pred) + ' über ' + meters(d) + '. ' + (imp > 0 ? 'Dein Ziel ist ' + nf(imp * 100, 1) + ' % schneller. Bei ' + c.W + ' Wochen halte ich bis etwa ' + nf(allowed * 100, 1) + ' % für machbar.' : 'Dein Ziel liegt auf dem Niveau deiner heutigen Form oder darunter.'));
      if (impLevel >= 2) lines.push('Realistischer wären etwa ' + fmtTime(pred * (1 - allowed * 0.5)) + ' bis ' + fmtTime(pred * 0.99) + '.');
    }
    lines.push('Im Freiwasser ohne Wende und Bahnleine bist du meist etwas langsamer als im Becken, mit Neoprenanzug oft schneller. Schwimm nie allein im offenen Wasser.');
    var level = Math.max(volLevel, impLevel === null ? 0 : impLevel);
    lines.push('Das sind Faustwerte. Technik, Alter, Schlaf und Alltag zählen oft mehr als jede Tabelle. Im Zweifel nimm lieber ein vorsichtigeres Ziel oder mehr Zeit.');
    return { level: level, headline: HEADS[level], lines: lines, noRef: !c.ref, rec: rec, refHint: 'Mit einer aktuellen Bestzeit (oben, optional) prüfe ich ehrlicher, wie weit dein Ziel von deiner heutigen Form entfernt ist.' };
  }

  var KSWIM_A = ['Liegestütz (auch an der Wand oder auf Knien)', 'Rudern mit Band', 'Außenrotation mit Band', 'Kniebeuge', 'Unterarmstütz', 'Superman'];
  var KSWIM_B = ['Schulterdrücken leicht', 'Latzug mit Band', 'Y-T-W in Bauchlage', 'Ausfallschritt', 'Seitstütz', 'Dead Bug'];
  function kraftMulti(sk, phase, deload, R, raceWeek) {
    var c = SPORTS[sk], out = kraftFor(0, phase, deload, 3, raceWeek);
    out.forEach(function (k, i) {
      k.dayIdx = c.kday[R][i]; k.day = DN[k.dayIdx];
      if (sk === 'schwimmen') k.desc = k.desc.replace(KA.join(', '), KSWIM_A.join(', ')).replace(KB.join(', '), KSWIM_B.join(', ')).replace('Hüftbeuger dehnen', 'Brustmuskel dehnen').replace('Waden dehnen', 'Schultern kreisen');
    });
    return out;
  }

  function buildMulti(o) {
    var sk = sportKey(o.sport), c = SPORTS[sk], dkey = String(o.dist);
    if (!c.D[dkey]) { var alt = Object.keys(c.D).filter(function (k) { return Math.abs(c.D[k] - Number(o.dist)) < 1e-6; })[0]; if (alt) dkey = alt; }
    if (!c.D[dkey]) throw new Error('Unbekannte Distanz');
    var W = clamp(parseInt(o.weeks, 10) || 12, 6, 24), R = clamp(parseInt(o.runs != null ? o.runs : o.sessions, 10) || c.sessDefault, c.sessions[0], c.sessions[c.sessions.length - 1]);
    var goal = o.goalMin, cur = clamp(Number(o.curKm), c.cur.min, c.cur.max); if (!isFinite(cur)) cur = c.cur.def;
    if (!(goal > 0)) throw new Error('Zielzeit fehlt oder ist ungültig');
    var d = c.D[dkey], pc = sk === 'rad' ? bikePaces(dkey, goal, o) : swimPaces(dkey, goal), recMid = sk === 'rad' ? (function (h) { return (h[0] + h[1]) / 2 * pc.easy; })(bikeRec(dkey, pc.ziel)) : (function (r) { return (r[0] + r[1]) / 2; })(swimRec(dkey, pc.ziel));
    var peakT = recMid * c.rf[R], vs = genVolumes(c, dkey, W, R, cur, peakT);
    var raceDate = o.raceDate ? new Date(o.raceDate + 'T00:00:00') : null, mon0 = null;
    if (raceDate) { var dow = (raceDate.getDay() + 6) % 7; mon0 = addDays(raceDate, -dow - 7 * (W - 1)); }
    var weeks = [], tmpl = c.days[R], rnd = function (x) { return Math.max(c.minSess, rndTo(x, c.rnd)); };
    var fmtAmt = sk === 'schwimmen' ? meters : function (k) { return Math.round(k) + ' km'; };
    for (var i = 0; i < W; i++) {
      var isRace = i === W - 1, phase = i >= vs.build ? 'Tapering' : phaseOf(i, vs.build), V = vs.vol[i], date = mon0 ? addDays(mon0, 7 * i) : null, raceNote = null;
      var longKm = rnd(vs.longs[i]), others = tmpl.filter(function (t) { return t[1] !== 'L'; }), restV = Math.max(0, V - longKm);
      var wsum = others.reduce(function (a, t) { return a + (t[1] === 'E' || t[1] === 'T' ? 0.8 : 1); }, 0);
      var sess = tmpl.map(function (t) {
        var kmv = t[1] === 'L' ? longKm : rnd(restV * (t[1] === 'E' || t[1] === 'T' ? 0.8 : 1) / wsum);
        return { dayIdx: t[0], day: DN[t[0]], type: t[1], km: kmv };
      });
      if (isRace) {
        var raceIdx = raceDate ? (raceDate.getDay() + 6) % 7 : 6;
        sess = sess.filter(function (s) { return s.dayIdx < raceIdx - 1; });
        var each = sess.length ? clamp(rndTo(Math.max(0, V - d) / sess.length, c.rnd), c.minSess, sk === 'rad' ? 40 : 1.5) : 0;
        sess.forEach(function (s, k) { s.type = k === sess.length - 1 ? 'S' : (sk === 'rad' ? 'E' : 'T'); s.km = each; });
        raceNote = { dayIdx: raceIdx, day: DN[raceIdx] };
      }
      sess.forEach(function (s) {
        var ty = s.type, ph = phase === 'Tapering' ? 'Spezifisch' : phase, r;
        if (phase === 'Tapering' && s.type !== 'S') { ph = 'Grundlage'; if (sk === 'rad' && ty === 'Q1') ty = 'Q2'; }
        if (s.type === 'S') r = sk === 'rad' ? { chip: ['Z', 'Locker'], desc: 'Kurze lockere Ausfahrt, etwa ' + fmtDur(s.km / pc.easy * 60) + ', mit 3 × 1 Min zügig. Rad und Ausrüstung prüfen.' }
          : { chip: ['Z', 'Locker'], km: s.km, desc: 'Kurz und locker: Einschwimmen, 4 × 50 m zügig in Zielpace ' + fmtSwim(pc.ziel) + ', Rest locker. Brille und Anzug testen.' };
        else r = sk === 'rad' ? bikeDesc(ty, ph, dkey, s.km, pc) : swimSession(ty, ph, dkey, s.km, pc);
        if (r.km != null && s.type !== 'S') s.km = r.km;
        s.chip = r.chip; s.desc = r.desc; s.amount = fmtAmt(s.km); s.steps = null;
        if (date) s.date = addDays(date, s.dayIdx);
      });
      var sum = sess.reduce(function (a, s) { return a + s.km; }, 0) + (isRace ? d : 0);
      var kraft = o.kraft ? kraftMulti(sk, phase, ((i + 1) % 4 === 0) && i < vs.build - 1, R, isRace) : [];
      kraft.forEach(function (k) { if (date) k.date = addDays(date, k.dayIdx); });
      weeks.push({ n: i + 1, phase: phase, monday: date, volume: sum, volumeText: sk === 'schwimmen' ? nf(sum, 1) + ' km' : Math.round(sum) + ' km', sessions: sess, kraft: kraft, race: raceNote, raceDay: isRace });
    }
    var actualPeak = Math.max.apply(null, weeks.slice(0, vs.build).map(function (w) { return w.volume; }));
    var actualLong = Math.max.apply(null, weeks.map(function (w) { return Math.max.apply(null, w.sessions.filter(function (s) { return s.type === 'L'; }).map(function (s) { return s.km; }).concat([0])); }));
    var warn = [];
    if (actualPeak < peakT * 0.8) warn.push('Dein Umfang steigt in den gewählten Wochen nur bis etwa ' + (sk === 'schwimmen' ? nf(actualPeak, 1) : Math.round(actualPeak)) + ' km pro Woche. Für dieses Ziel ist das knapp. Mehr Wochen oder ein höherer Startumfang helfen.');
    var ck = { dkey: dkey, goal: goal, W: W, R: R, cur: cur, peak: actualPeak, maxLong: actualLong, pc: pc, raceDate: raceDate, ref: o.ref || null, weightGiven: Number(o.weightKg) > 0 };
    var check = sk === 'rad' ? bikeCheck(ck) : swimCheck(ck);
    var raceText = sk === 'rad' ? 'Zielzeit ' + fmtHM(goal) + ' Std, Schnitt ' + nf(pc.ziel, 1) + ' km/h. Die erste Stunde eher ruhig, regelmäßig essen und trinken.'
      : 'Zielzeit ' + fmtTime(goal) + ', also ' + fmtSwim(pc.ziel) + '. Ruhig starten, nach 200 m in deinen Rhythmus finden.';
    return { sport: sk, sportName: c.name, dist: dkey, distName: c.N[dkey], goalMin: goal, weeks: W, runs: R, sessWord: c.sessWord, curKm: cur, peak: actualPeak, paces: pc,
      zones: sk === 'rad' ? bikeZones(pc) : swimZones(pc), plan: weeks, raceDate: raceDate, warnings: warn, check: check, interactive: !!o.interactive, raceText: raceText };
  }

  var API = { buildMulti: buildMulti, sportKey: sportKey, sportInfo: sportInfo, SPORTS: SPORTS, renderVerdict: renderVerdict, renderChart: renderChart, renderPaces: renderPaces, renderWeeks: renderWeeks, parseTimeFor: parseTimeFor, weeksUntil: weeksUntil, recVolume: recVolume, buildPlan: buildPlan, toICS: toICS, renderHTML: renderHTML, parseTime: parseTime, fmtTime: fmtTime, fmtPace: fmtPace, NAME: NAME, DIST: DIST, mondayOf: mondayOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Laufplan = API;
})(typeof window !== 'undefined' ? window : this);
