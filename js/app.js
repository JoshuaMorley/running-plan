(function () {
  var P = window.PLAN;
  var MARATHON_KM = 42.195;
  var RACE_DATE = "2026-11-01";
  var KK_DATE = "2026-11-21";
  var TARGETS = {
    "259": { sec: 255 * 42.195 },
    "305": { sec: 11100 },
    "310": { sec: 11400 },
    "315": { sec: 11700 }
  };
  var ALLOWED = { A1: ["259", "305", "310"], A2: ["305", "310", "315"], S1: ["305", "310", "315"] };
  var TABS = ["overview", "plan", "decisions", "stats", "fivek", "course", "fuel", "race", "kerikeri", "rules"];
  var HALF_KM = 21.0975;
  /* The North Shore hills and the bridge are in the first half, so halfway is planned 25 s behind even pace. */
  var HALF_BANK = 25;
  var TYPE_LABEL = { rest: "Rest", easy: "Easy", int: "Intervals", long: "Long", race: "Race", test: "Test" };
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* ---------- storage ---------- */
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function loadJSON(k, fallback) {
    try { var v = JSON.parse(store.get(k)); return v && typeof v === "object" ? v : fallback; } catch (e) { return fallback; }
  }

  var st = loadJSON("akl-route", { d0: "A", d1: "pass", d2: "259" });
  if (st.d0 !== "A" && st.d0 !== "S") st.d0 = "A";
  if (st.d1 !== "pass" && st.d1 !== "fail") st.d1 = "pass";
  if (!TARGETS[st.d2]) st.d2 = "259";

  var INP_DEFAULTS = { gel: 26, gph: 70, kg: 80, cpkm: "21.0975", cpt: "1:30:10", start: "06:00",
    c1pace: "4:15", c1hr: "168", c1slow: "no", c2pace: "4:15", c2hr: "170", c2feel: "just", watch: "42.8", kkt: "5100", kkstart: "07:00", thw: "6" };
  var inp = loadJSON("akl-inputs", {});
  Object.keys(INP_DEFAULTS).forEach(function (k) { if (inp[k] === undefined || inp[k] === null) inp[k] = INP_DEFAULTS[k]; });

  var ui = { tab: "overview", week: 0 };

  function l2() { return st.d0 === "S" ? "S1" : (st.d1 === "pass" ? "A1" : "A2"); }
  function halfKey() { return l2() === "A1" ? "A" : "S"; }
  function normalize() { if (ALLOWED[l2()].indexOf(st.d2) < 0) st.d2 = l2() === "A1" ? "259" : "310"; }
  function saveRoute() { store.set("akl-route", JSON.stringify(st)); }
  function saveInputs() { store.set("akl-inputs", JSON.stringify(inp)); }
  normalize();

  /* ---------- formatting ---------- */
  function targetSec() { return TARGETS[st.d2].sec; }
  function mpSec() { return targetSec() / MARATHON_KM; }
  function fmtPace(sec) {
    sec = Math.round(sec);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function fmtClock(sec) {
    var neg = sec < 0; sec = Math.round(Math.abs(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (neg ? "-" : "") + (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function fmtTarget() { return fmtClock(targetSec()).replace(/:00$/, ""); }
  function parseClock(str) {
    var parts = String(str).trim().split(":");
    if (parts.length < 2 || parts.length > 3) return NaN;
    var n = parts.map(function (x) { return /^\d{1,2}$/.test(x) ? parseInt(x, 10) : NaN; });
    if (n.some(isNaN)) return NaN;
    if (n.length === 2) return n[0] * 60 + n[1];
    return n[0] * 3600 + n[1] * 60 + n[2];
  }
  function parsePace(str) { var s = parseClock(str); return s > 120 && s < 600 ? s : NaN; }
  function clampNum(v, lo, hi, dflt) { v = parseFloat(v); if (isNaN(v)) return dflt; return Math.min(hi, Math.max(lo, v)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function kg() { return clampNum(inp.kg, 40, 130, 80); }
  function loadText() { return "8–10 g of carbs per kg, about " + Math.round(kg() * 8) + "–" + Math.round(kg() * 10) + " g"; }
  function halfAdj() { return HALF_BANK / HALF_KM; }

  /* ---------- course + per-km pace plan ---------- */
  var COURSE = (function () {
    var C = window.COURSE, scale = MARATHON_KM / C.total;
    var pts = C.pts.map(function (p) { return { k: p[0] * scale, e: p[1], lat: p[2], lon: p[3] }; });
    /* 1 km moving average to damp the file's elevation noise before measuring climbs. */
    pts.forEach(function (p, i) {
      var s = 0, n = 0;
      for (var j = Math.max(0, i - 5); j <= Math.min(pts.length - 1, i + 5); j++) { s += pts[j].e; n++; }
      p.es = s / n;
    });
    var gain = 0, hi = pts[0];
    for (var i = 1; i < pts.length; i++) { var de = pts[i].e - pts[i - 1].e; if (de > 0) gain += de; if (pts[i].e > hi.e) hi = pts[i]; }
    var perKm = [];
    for (var km = 0; km < 43; km++) {
      var len = Math.min(1, MARATHON_KM - km);
      if (len <= 0) break;
      var g = 0, l = 0;
      for (var q = 1; q < pts.length; q++) {
        if (pts[q].k <= km || pts[q - 1].k >= km + len) continue;
        var d = pts[q].es - pts[q - 1].es;
        if (d > 0) g += d; else l -= d;
      }
      perKm.push({ km: km, len: len, gain: g, loss: l });
    }
    return { raw: C, scale: scale, pts: pts, gain: gain, hi: hi, perKm: perKm,
      bridge: [C.bridge[0] * scale, C.bridge[1] * scale], turn: C.turn * scale, fileTotal: C.total };
  })();

  /* Effort-based pacing: about 0.9 s per metre climbed and 0.5 s back per metre descended, plus the
     plan's 10-20 s bridge allowance (the file has no bridge height), then each half is rebalanced
     so halfway stays about 25 s behind even pace and the finish hits the target. */
  var planCache = { key: null, plan: null };
  function kmPlan() {
    var key = targetSec();
    if (planCache.key === key) return planCache.plan;
    var mp = mpSec(), adj = halfAdj();
    var rows = COURSE.perKm.map(function (r) {
      var off = 0.9 * r.gain - 0.5 * r.loss;
      off = Math.max(-8, Math.min(8, off));
      var ov = Math.max(0, Math.min(r.km + r.len, COURSE.bridge[1]) - Math.max(r.km, COURSE.bridge[0]));
      off += ov * 10;
      return { km: r.km, len: r.len, gain: r.gain, loss: r.loss, off: off, bridge: ov > 0.3 };
    });
    function balance(from, to, base) {
      var w = 0, s = 0, i;
      for (i = from; i <= to; i++) { w += rows[i].len; s += rows[i].off * rows[i].len; }
      for (i = from; i <= to; i++) rows[i].pace = base + rows[i].off - s / w;
    }
    balance(0, 20, mp + adj);
    balance(21, rows.length - 1, mp - adj);
    var cum = [0];
    rows.forEach(function (r, i) { cum[i + 1] = cum[i] + r.pace * r.len; });
    var scaleFix = targetSec() / cum[cum.length - 1];
    rows.forEach(function (r) { r.pace *= scaleFix; });
    cum = [0];
    rows.forEach(function (r, i) { cum[i + 1] = cum[i] + r.pace * r.len; });
    planCache = { key: key, plan: { rows: rows, cum: cum } };
    return planCache.plan;
  }
  function plannedClock(km) {
    var p = kmPlan(), j = Math.max(0, Math.min(p.rows.length - 1, Math.floor(km)));
    return p.cum[j] + (km - j) * p.rows[j].pace;
  }
  function fill(str) {
    var mp = mpSec();
    return String(str)
      .replace(/\{mp([+-]\d+)?\}/g, function (_, off) { return fmtPace(mp + (off ? parseInt(off, 10) : 0)); })
      .replace(/\{half\}/g, fmtClock(plannedClock(HALF_KM)))
      .replace(/\{c30\}/g, fmtClock(plannedClock(30)))
      .replace(/\{bail\}/g, fmtClock(plannedClock(HALF_KM) + (mp + 10) * HALF_KM))
      .replace(/\{fast\}/g, fmtClock(plannedClock(30) + (mp - 7) * 12.195))
      .replace(/\{full\}/g, fmtTarget())
      .replace(/\{load\}/g, loadText());
  }

  /* ---------- dates ---------- */
  function isoLocal(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  var today = isoLocal(new Date());
  function dateObj(iso) { return new Date(iso + "T12:00:00"); }
  function daysBetween(a, b) { return Math.round((dateObj(b) - dateObj(a)) / 86400000); }
  function niceDate(iso) { var d = dateObj(iso); return DOW[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()]; }
  function relDays(iso) {
    var n = daysBetween(today, iso);
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n > 1) return "in " + n + " days";
    return "done";
  }
  function currentWeekIndex() {
    for (var i = P.WEEKS.length - 1; i >= 0; i--) if (today >= P.WEEKS[i].days[0].d) return i;
    return 0;
  }

  /* ---------- plan resolution ---------- */
  function resolve(day) {
    var key = day.altBy === "half" ? halfKey() : st.d0;
    if (key === "A" && day.alt) {
      var r = {}, k;
      for (k in day) r[k] = day[k];
      for (k in day.alt) r[k] = day.alt[k];
      return r;
    }
    return day;
  }
  function weekDays(w) { return w.days.map(resolve); }
  function weekKm(w) { return weekDays(w).reduce(function (t, d) { return t + (d.km || 0); }, 0); }
  function allDays() { var out = []; P.WEEKS.forEach(function (w, i) { weekDays(w).forEach(function (d) { d._w = i; out.push(d); }); }); return out; }
  function isDone(day) {
    var v = store.get("akl-done-" + day.d);
    if (v === "1") return true;
    if (v === "0") return false;
    return !!day.done || runsOn(day.d).length > 0;
  }

  /* ---------- Strava results (js/results.js, written by scripts/sync-strava.mjs) ---------- */
  var RUNS = (window.RESULTS && window.RESULTS.runs) || [];
  function runsOn(iso) { return RUNS.filter(function (r) { return r.date === iso; }); }
  function runsBetween(a, b) { return RUNS.filter(function (r) { return r.date >= a && r.date <= b; }); }
  /* Several runs on one day (say a warm-up saved separately) count as one. HR is time-weighted. */
  function combine(list) {
    if (!list.length) return null;
    var m = 0, sec = 0, hrT = 0, hrS = 0;
    list.forEach(function (r) { m += r.m; sec += r.sec; if (r.hr) { hrT += r.hr * r.sec; hrS += r.sec; } });
    return { m: m, sec: sec, pace: sec / m * 1000, hr: hrS ? Math.round(hrT / hrS) : null, n: list.length };
  }
  function splitsTotal(run) { return run.splits.reduce(function (t, s) { return t + s[0]; }, 0); }
  /* Pace and HR between two distances (metres) in a run, pro-rating the splits at each end. */
  function segment(run, from, to) {
    var pos = 0, m = 0, sec = 0, hrT = 0, hrS = 0;
    run.splits.forEach(function (s) {
      var a = pos, b = pos + s[0];
      pos = b;
      var ov = Math.min(b, to) - Math.max(a, from);
      if (ov <= 0) return;
      var t = s[1] * ov / s[0];
      m += ov; sec += t;
      if (s[2]) { hrT += s[2] * t; hrS += t; }
    });
    return m > 0 ? { m: m, pace: sec / m * 1000, hr: hrS ? Math.round(hrT / hrS) : null } : null;
  }
  /* The longest run on a test day, which is the test itself. */
  function testRun(iso) {
    return runsOn(iso).sort(function (a, b) { return b.m - a.m; })[0] || null;
  }

  /* The day's pace target, when every paced step shares one range (easy runs, steady runs). */
  function dayPaceRange(d) {
    if (!d.steps) return null;
    var found = null, many = false;
    d.steps.forEach(function (s) {
      var m = fill(s).match(/(\d+):(\d\d)-(\d+):(\d\d)\/km Pace/);
      if (!m) return;
      var r = [Math.min(+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]), Math.max(+m[1] * 60 + +m[2], +m[3] * 60 + +m[4])];
      if (found && (found[0] !== r[0] || found[1] !== r[1])) many = true;
      found = r;
    });
    return many ? null : found;
  }
  var GRADE = { ok: "on plan", meh: "a bit off", off: "well off" };
  function pill(grade, text) {
    return "<span class=\"pill" + (grade ? " " + grade : "") + "\"" + (grade ? " title=\"" + GRADE[grade] + "\"" : "") + ">" + esc(text) + (grade ? "<span class=\"sr\"> (" + GRADE[grade] + ")</span>" : "") + "</span>";
  }
  /* Strava's numbers for the day next to the plan: distance against planned km, pace against the
     day's single pace range (±5 s is on plan), and HR against the 150 cap on easy days. */
  function actualHTML(d) {
    var a = combine(runsOn(d.d));
    if (!a) return "";
    var km = a.m / 1000, plan = d.km || d.optKm || 0, bits = [], g = "";
    if (plan) { var off = Math.abs(km / plan - 1); g = off <= 0.1 ? "ok" : off <= 0.25 ? "meh" : "off"; }
    bits.push(pill(g, (Math.round(km * 10) / 10) + (plan ? " of " + plan : "") + " km"));
    var pr = dayPaceRange(d);
    g = "";
    if (pr) g = a.pace >= pr[0] - 5 && a.pace <= pr[1] + 5 ? "ok" : a.pace >= pr[0] - 15 && a.pace <= pr[1] + 15 ? "meh" : "off";
    bits.push(pill(g, fmtPace(a.pace) + "/km"));
    if (a.hr) {
      g = "";
      if (pr && pr[0] >= 300) g = a.hr <= 150 ? "ok" : a.hr <= 155 ? "meh" : "off";
      bits.push(pill(g, "HR " + a.hr));
    }
    var label = d.t === "rest" && !d.optKm ? "Extra run" : "Strava" + (a.n > 1 ? " · " + a.n + " runs" : "");
    return "<div class=\"d-actual\"><span class=\"d-actual-l\">" + label + "</span>" + bits.join("") + "</div>";
  }

  /* HR range for each paced step, from the bands in js/data.js. Same logic as hrGuide in scripts/plan.mjs, which puts these in Garmin and the calendar. */
  function hrLines(d) {
    var out = [];
    (d.steps || []).forEach(function (s) {
      var m = fill(s).match(/(\d+):(\d\d)-(\d+):(\d\d)\/km Pace/), line = null;
      if (m) {
        var lo = Math.min(+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]), hi = Math.max(+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]);
        line = fmtPace(lo) + "–" + fmtPace(hi) + "/km: " + P.HR_BANDS.filter(function (b) { return lo >= b[0]; })[0][1];
      } else if (d.t === "race" && /^- \d+(\.\d+)?km$/.test(s.trim())) {
        line = P.HR_RACE;
      }
      if (line && out.indexOf(line) < 0) out.push(line);
    });
    return out;
  }

  /* ---------- shared pieces ---------- */
  function detailHTML(d) {
    var h = "";
    if (d.detail) {
      if (Array.isArray(d.detail)) h += "<div class=\"d-detail\"><ul>" + d.detail.map(function (x) { return "<li>" + esc(fill(x)) + "</li>"; }).join("") + "</ul></div>";
      else h += "<div class=\"d-detail\">" + esc(fill(d.detail)) + "</div>";
    }
    if (d.result) h += "<span class=\"d-result\">" + esc(d.result) + "</span>";
    if (d.why) h += "<p class=\"d-note\"><b>Why</b>" + esc(fill(d.why)) + "</p>";
    if (d.fuel) h += "<p class=\"d-note fuel\"><b>Fuel</b>" + esc(fill(d.fuel)) + "</p>";
    if (d.t !== "rest" && (d.guide || hrLines(d).length)) h += "<button type=\"button\" class=\"guide-btn\" data-guide=\"" + d.d + "\">Run guide</button>";
    return h;
  }

  /* ---------- run guide popup ---------- */
  function ulHTML(list) { return "<ul>" + list.map(function (x) { return "<li>" + esc(fill(x)) + "</li>"; }).join("") + "</ul>"; }
  function guideHTML(d) {
    var g = d.guide || {}, hr = (g.hr || []).concat(hrLines(d)), dt = dateObj(d.d), h = "";
    h += "<span class=\"eyebrow\">" + DOW[dt.getDay()] + " " + dt.getDate() + " " + MON[dt.getMonth()] + "</span>";
    h += "<h3>" + esc(fill(d.title)) + (d.km ? " · " + d.km + " km" : "") + "</h3>";
    if (g.feel) h += "<section><h4>How it should feel</h4><p>" + esc(fill(g.feel)) + "</p></section>";
    if (g.how) h += "<section><h4>How to run it</h4>" + ulHTML(g.how) + "</section>";
    else if (d.detail) h += "<section><h4>The session</h4>" + ulHTML([].concat(d.detail)) + "</section>";
    if (hr.length) h += "<section><h4>Heart rate</h4>" + ulHTML(hr) + "</section>";
    if (g.elev) h += "<section><h4>Elevation</h4><p>" + esc(fill(g.elev)) + "</p></section>";
    if (g.stop) h += "<section class=\"g-stop\"><h4>Back off if</h4>" + ulHTML(g.stop) + "</section>";
    if (g.after) h += "<section><h4>Afterwards</h4><p>" + esc(fill(g.after)) + "</p></section>";
    if (d.why) h += "<section><h4>Why this run</h4><p>" + esc(fill(d.why)) + "</p></section>";
    if (d.fuel) h += "<section class=\"g-fuel\"><h4>Fuel</h4><p>" + esc(fill(d.fuel)) + "</p></section>";
    if (d.result) h += "<section><h4>What you did</h4><p>" + esc(d.result) + "</p></section>";
    return h + "<p class=\"muted g-foot\">HR and elevation are estimates from your Strava runs and the course GPX, so they may be off.</p>";
  }
  function openGuide(iso) {
    var d = allDays().filter(function (x) { return x.d === iso; })[0], dlg = document.getElementById("guide");
    if (!d || !dlg) return;
    document.getElementById("guide-body").innerHTML = guideHTML(d);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function shoesChip(d) { return d.shoes ? "<span class=\"chip t-shoes\">Race shoes</span>" : ""; }
  function dayRowHTML(d) {
    var dt = dateObj(d.d), done = d.t !== "rest" && isDone(d);
    var h = "<div class=\"day" + (d.t === "rest" ? " rest" : "") + (d.d === today ? " today" : "") + (done ? " done" : "") + "\">";
    h += "<div class=\"d-date\"><b>" + DOW[dt.getDay()] + "</b><span class=\"num\">" + dt.getDate() + " " + MON[dt.getMonth()] + (d.d === today ? " · today" : "") + "</span></div>";
    h += "<span class=\"chip t-" + d.t + "\">" + TYPE_LABEL[d.t] + "</span>";
    h += "<div class=\"d-body\"><span class=\"d-title\">" + esc(fill(d.title)) + "</span>" + shoesChip(d) + detailHTML(d) + actualHTML(d) + "</div>";
    if (d.km) h += "<span class=\"d-km num\">" + d.km + " km</span>";
    else if (d.optKm) h += "<span class=\"d-km opt num\">opt. " + d.optKm + " km</span>";
    else h += "<span class=\"d-km\"></span>";
    if (d.t !== "rest") h += "<label class=\"check\"><input type=\"checkbox\" id=\"done-" + d.d + "\" data-day=\"" + d.d + "\"" + (done ? " checked" : "") + " aria-label=\"Mark " + esc(d.title) + " done\"></label>";
    else h += "<span></span>";
    return h + "</div>";
  }
  function optsFor(key) {
    if (key === "d2") return l2() === "A1" ? P.OPTS.d2A : P.OPTS.d2S;
    return P.OPTS[key];
  }
  function decisionHTML(key, withLink) {
    var D = P.DEC[key];
    var head = "<h3>Decision " + D.n + " · " + esc(D.q) + "</h3><span class=\"d-when\">" + esc(D.when) + "</span>";
    if (key === "d1" && st.d0 === "S") {
      return "<div class=\"decide off\">" + head + "<span>This decision is only on the sub-3 build. On the 3:10 build, the 33 km stays easy with a 4:35 finish.</span></div>";
    }
    var opts = optsFor(key);
    var h = "<div class=\"decide\">" + head + "<div class=\"decide-grid\" style=\"grid-template-columns: repeat(" + opts.length + ", minmax(0, 1fr))\">";
    opts.forEach(function (o) {
      var on = st[key] === o.v;
      h += "<button type=\"button\" class=\"opt-card\" data-dec=\"" + key + "\" data-val=\"" + o.v + "\" aria-pressed=\"" + on + "\">";
      h += "<b>" + esc(o.b) + "</b><span>" + esc(o.s) + "</span>" + (on ? "<em class=\"picked\">Planning for this</em>" : "") + "</button>";
    });
    h += "</div>";
    if (withLink && key !== "d0") h += "<button type=\"button\" class=\"link-btn\" data-goto=\"decisions\">Enter your test numbers</button>";
    return h + "</div>";
  }

  /* ---------- header, route, tree ---------- */
  function renderHeader() {
    document.getElementById("target-read").textContent = fmtTarget() + " · " + fmtPace(mpSec()) + "/km";
    var steps = [P.NODES[st.d0].t, P.NODES[l2()].t, fmtTarget()];
    document.getElementById("route").innerHTML = steps.map(function (s, i) {
      return "<button type=\"button\" class=\"step" + (i === steps.length - 1 ? " last" : "") + "\" data-goto=\"decisions\">" + esc(s) + "</button>";
    }).join("<span class=\"arrow\" aria-hidden=\"true\">→</span>");
    document.querySelectorAll("[data-tpl]").forEach(function (el) { el.textContent = fill(el.getAttribute("data-tpl")); });

    /* After Auckland the countdown moves on to the Kerikeri Half. */
    var kk = today > RACE_DATE, n = daysBetween(today, kk ? KK_DATE : RACE_DATE);
    var el = document.getElementById("countdown"), lab = document.getElementById("countdown-label");
    if (n > 1) { el.textContent = n; lab.textContent = kk ? "days to Kerikeri" : "days to go"; }
    else if (n === 1) { el.textContent = "1"; lab.textContent = kk ? "day to Kerikeri" : "day to go"; }
    else if (n === 0) { el.textContent = "Today"; lab.textContent = "race day"; }
    else { el.textContent = "Done"; lab.textContent = "season complete"; }
  }

  var COLX = [0, 230, 460, 690], NW = 172, NH = 50;
  var COLH = ["Today", "10 Oct · 33 km", "18 Oct · Half", "1 Nov · Race"];
  function renderTree() {
    var path = ["root", st.d0, l2(), "T" + st.d2];
    function onEdge(a, b) { for (var i = 0; i < path.length - 1; i++) if (path[i] === a && path[i + 1] === b) return true; return false; }
    var svg = "";
    COLH.forEach(function (h, i) { svg += "<text class=\"col-h\" x=\"" + COLX[i] + "\" y=\"14\">" + esc(h) + "</text>"; });
    var off = "", on = "";
    P.EDGES.forEach(function (e) {
      var a = P.NODES[e[0]], b = P.NODES[e[1]];
      var x1 = COLX[a.c] + NW, x2 = COLX[b.c], mid = (x1 + x2) / 2, active = onEdge(e[0], e[1]);
      var p = "<path class=\"edge" + (active ? " on" : "") + "\" d=\"M" + x1 + " " + a.y + " C" + mid + " " + a.y + " " + mid + " " + b.y + " " + x2 + " " + b.y + "\"></path>";
      if (active) on += p; else off += p;
    });
    svg += off + on;
    Object.keys(P.NODES).forEach(function (id) {
      var n = P.NODES[id], x = COLX[n.c], y = n.y - NH / 2, active = path.indexOf(id) >= 0;
      svg += "<g class=\"node " + (n.cls || "") + (active ? " on" : "") + "\" data-node=\"" + id + "\"" + (id === "root" ? "" : " tabindex=\"0\" role=\"button\" aria-pressed=\"" + active + "\"") + " aria-label=\"" + esc(n.t + ", " + n.s) + "\">";
      svg += "<rect x=\"" + x + "\" y=\"" + y + "\" width=\"" + NW + "\" height=\"" + NH + "\" rx=\"8\"></rect>";
      svg += "<text class=\"n-t\" x=\"" + (x + 12) + "\" y=\"" + (n.y - 3) + "\">" + esc(n.t) + "</text>";
      svg += "<text class=\"n-s\" x=\"" + (x + 12) + "\" y=\"" + (n.y + 14) + "\">" + esc(n.s) + "</text></g>";
    });
    document.getElementById("tree").innerHTML = svg;
  }
  function pickNode(id) {
    if (id === "A" || id === "A1" || id === "A2") st.d0 = "A";
    if (id === "S" || id === "S1") st.d0 = "S";
    if (id === "A1") st.d1 = "pass";
    if (id === "A2") st.d1 = "fail";
    if (id.charAt(0) === "T") {
      var t = id.slice(1);
      if (t === "259") { st.d0 = "A"; st.d1 = "pass"; }
      if (t === "315" && l2() === "A1") st.d1 = "fail";
      st.d2 = t;
    }
    normalize(); saveRoute(); renderAll();
  }

  /* ---------- overview ---------- */
  function renderToday() {
    var days = allDays(), first = days[0].d, html = "";
    var cur = null, next = null;
    days.forEach(function (d) {
      if (d.d === today) cur = d;
      if (!next && d.d > today && d.t !== "rest") next = d;
    });
    if (today < first) {
      html += "<div class=\"card today-card\"><span class=\"eyebrow\">Before the plan</span><h3>Plan starts Mon 28 Sep</h3></div>";
    } else if (today > days[days.length - 1].d) {
      html += "<div class=\"card today-card\"><span class=\"eyebrow\">Finished</span><h3>Plan complete</h3><p class=\"muted\">Both races done. Rest up, then easy running only for the next 1–2 weeks.</p></div>";
    } else if (cur) {
      html += "<div class=\"card today-card\"><span class=\"eyebrow\">Today · " + niceDate(cur.d) + "</span><div class=\"chips\"><span class=\"chip t-" + cur.t + "\">" + TYPE_LABEL[cur.t] + "</span>" + shoesChip(cur) + "</div><h3>" + esc(fill(cur.title)) + (cur.km ? " · " + cur.km + " km" : "") + "</h3>" + detailHTML(cur) + actualHTML(cur) + "<button type=\"button\" class=\"link-btn\" data-goto=\"plan\" data-week=\"" + cur._w + "\">Open this week</button></div>";
    }
    if (next) {
      html += "<div class=\"card today-card next\"><span class=\"eyebrow\">Next session · " + niceDate(next.d) + " · " + relDays(next.d) + "</span><div class=\"chips\"><span class=\"chip t-" + next.t + "\">" + TYPE_LABEL[next.t] + "</span>" + shoesChip(next) + "</div><h3>" + esc(fill(next.title)) + (next.km ? " · " + next.km + " km" : "") + "</h3>" + detailHTML(next) + "</div>";
    }
    document.getElementById("today-cards").innerHTML = html;
  }
  function renderVolume() {
    var PREV_PEAK = 51, cw = currentWeekIndex();
    var totals = P.WEEKS.map(weekKm);
    /* Every Strava run in the week counts, planned or not. Future weeks have nothing to show yet. */
    var ran = P.WEEKS.map(function (w) {
      var a = combine(runsBetween(w.days[0].d, w.days[w.days.length - 1].d));
      return a ? a.m / 1000 : (w.days[0].d <= today ? 0 : null);
    });
    var max = Math.max.apply(null, totals.concat(ran, [PREV_PEAK])) * 1.05;
    function r1(x) { return Math.round(x * 10) / 10; }
    var h = totals.map(function (km, i) {
      var w = P.WEEKS[i], act = ran[i];
      var tip = "Week " + w.n + ": " + r1(km) + " km planned" + (act === null ? "" : ", " + r1(act) + " km run");
      return "<div class=\"vol-row" + (i === cw ? " cur" : "") + "\" title=\"" + tip + "\"><span><b>Week " + w.n + "</b><br><span class=\"muted\" style=\"font-size:12px\">" + esc(w.range) + "</span></span>" +
        "<div class=\"vol-track\"><div class=\"vol-bar\" style=\"width:" + (km / max * 100).toFixed(1) + "%\"></div>" +
        (act === null ? "" : "<div class=\"vol-act\" style=\"width:" + (act / max * 100).toFixed(1) + "%\"></div>") +
        "<div class=\"vol-mark\" style=\"left:" + (PREV_PEAK / max * 100).toFixed(1) + "%\"></div></div>" +
        "<span class=\"num\" style=\"text-align:right\"><b>" + r1(km) + " km</b>" + (act === null ? "" : "<br><span class=\"muted\" style=\"font-size:12px\">" + r1(act) + " run</span>") + "</span></div>";
    }).join("");
    h += "<div class=\"vol-key\"><span><i class=\"sw-plan\"></i>Planned</span><span><i class=\"sw-act\"></i>Run, from Strava</span><span><i class=\"sw-peak\"></i>Previous biggest week, 51 km</span></div>";
    h += "<p class=\"vol-legend\">Week 5 includes the marathon and week 8 the Kerikeri Half. The current week is in orange.</p>";
    document.getElementById("volume").innerHTML = h;
  }
  /* Heart rate drift (aerobic decoupling): how much less pace each heartbeat buys in the second half of
     the easy kilometres than the first. Uses easy-paced splits (slower than 5:00/km, at least 900 m),
     skips the first km as warm-up, and needs 4 or more. Only easy, long and unplanned runs count. */
  function drift(run) {
    var s = run.splits.slice(1).filter(function (x) { return x[0] >= 900 && x[2] && x[1] / x[0] * 1000 >= 300; });
    if (s.length < 4) return null;
    function ef(part) {
      var m = 0, t = 0, hb = 0;
      part.forEach(function (x) { m += x[0]; t += x[1]; hb += x[2] * x[1]; });
      return (m / t) / (hb / t);
    }
    var half = Math.floor(s.length / 2);
    return { pct: (ef(s.slice(0, half)) / ef(s.slice(half)) - 1) * 100, km: s.length };
  }
  function renderDrift() {
    var byDate = {};
    allDays().forEach(function (d) { byDate[d.d] = d; });
    var rows = RUNS.filter(function (r) {
      var d = byDate[r.date];
      return !d || d.t === "easy" || d.t === "long" || d.t === "rest";
    }).map(function (r) { return { r: r, x: drift(r) }; }).filter(function (o) { return o.x; });
    var el = document.getElementById("drift");
    if (!rows.length) { el.innerHTML = "<p class=\"muted\" style=\"padding:16px 18px;margin:0\">No easy runs long enough to measure yet.</p>"; return; }
    var MAX = 10;
    el.innerHTML = rows.map(function (o) {
      var p = o.x.pct, g = p < 5 ? ["ok", "Steady"] : p < 8 ? ["meh", "Some drift"] : ["off", "High drift"];
      var w = Math.max(0, Math.min(p, MAX)) / MAX * 100;
      return "<div class=\"drift-row\" title=\"" + esc(o.r.name) + ": " + p.toFixed(1) + "% over " + o.x.km + " easy km\">" +
        "<span><b>" + niceDate(o.r.date) + "</b><br><span class=\"muted\" style=\"font-size:12px\">" + (Math.round(o.r.m / 100) / 10) + " km · " + o.x.km + " easy km</span></span>" +
        "<div class=\"vol-track\"><div class=\"drift-bar " + g[0] + "\" style=\"width:" + w.toFixed(1) + "%\"></div><div class=\"vol-mark\" style=\"left:50%\"></div></div>" +
        "<span class=\"num\" style=\"text-align:right\"><b>" + (p < 0 ? "−" : "") + Math.abs(p).toFixed(1) + "%</b><br>" + pill(g[0], g[1]) + "</span></div>";
    }).join("") +
      "<p class=\"vol-legend\">Dashed line: 5%. Under 5% is a sign of good aerobic fitness, and below zero means HR fell as the run went on (often a hilly start), and it should hold or fall through the taper. Hills, heat, wind and stops all push it up, so watch the trend, not one run. It's an estimate from Strava splits.</p>";
  }
  function renderDates() {
    var subA = st.d0 === "A";
    var list = [
      ["2026-10-04", "29 km long run", subA ? "Easy, last 5 km at 4:20 if recovered" : "All easy"],
      ["2026-10-10", subA ? "33 km · Test 1" : "33 km long run", subA ? "Last 8 km at 4:15" : "Longest run ever"],
      ["2026-10-18", l2() === "A1" ? "Half · Test 2" : "Half · pace test", l2() === "A1" ? "16 km at 4:15" : "14 km at 4:30"],
      ["2026-10-19", "Taper starts", "Less volume, same sharpness"],
      ["2026-10-22", "Last race-pace session", "4 km at " + fmtPace(mpSec()) + "/km"],
      ["2026-10-30", "Carb load starts", loadText() + " a day"],
      [RACE_DATE, "Auckland Marathon", fmtTarget() + " at " + fmtPace(mpSec()) + "/km"],
      ["2026-11-12", "Kerikeri readiness check", "Easy 6 km: HR under 150 at 5:20–5:30?"],
      [KK_DATE, "Kerikeri Half Marathon", "Target " + kkTargetLabel() + ", Okaihau to Kerikeri"]
    ];
    document.getElementById("dates").innerHTML = list.map(function (x) {
      return "<div class=\"date-row\"><b>" + niceDate(x[0]) + "</b><span><strong>" + esc(x[1]) + "</strong><br><span class=\"muted\" style=\"font-size:13px\">" + esc(x[2]) + "</span></span><span class=\"muted num\" style=\"font-size:13px\">" + relDays(x[0]) + "</span></div>";
    }).join("");
  }

  /* The feed in plan.ics is built for one route (scripts/build-ics.mjs), so say which and flag a mismatch. */
  var feedRoute = null;
  function renderCalRoute() {
    var el = document.getElementById("cal-route");
    if (!feedRoute || !TARGETS[feedRoute[2]]) { el.hidden = true; return; }
    var f = { d0: feedRoute[0], d1: feedRoute[1], d2: feedRoute[2] };
    var label = (f.d0 === "A" ? "sub-3 build" : "3:10 build") + ", target " + fmtClock(TARGETS[f.d2].sec).replace(/:00$/, "");
    var same = f.d0 === st.d0 && f.d2 === st.d2 && (st.d0 === "S" || f.d1 === st.d1);
    var want = JSON.stringify({ build: st.d0, d1: st.d1, target: st.d2 });
    el.innerHTML = esc("The calendar follows the " + label + ".") + (same ? "" :
      " That's not the route picked here. To switch, set <a href=\"https://github.com/JoshuaMorley/running-plan/edit/main/route.json\" target=\"_blank\" rel=\"noopener\">route.json</a> to <code>" + esc(want) + "</code>. The next sync updates the calendar, and Garmin too if it's set up.");
    el.hidden = false;
  }
  function loadFeedRoute() {
    if (!window.fetch) return;
    fetch("plan.ics", { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
      var m = /^X-AKL-ROUTE:(\w)-(\w+)-(\d+)/m.exec(t);
      if (m) { feedRoute = [m[1], m[2], m[3]]; renderCalRoute(); }
    }).catch(function () {});
  }

  /* ---------- stats ---------- */
  var MARATHON_HR = [165, 172], MARATHON_HR_MID = 168;
  /* Weighted least squares, y = a + b·x. Points are [x, y, weight]. */
  function fitLine(pts) {
    var n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (p) { var w = p[2] || 1; n += w; sx += p[0] * w; sy += p[1] * w; sxx += p[0] * p[0] * w; sxy += p[0] * p[1] * w; });
    var b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n, ss = 0, st = 0, my = sy / n;
    pts.forEach(function (p) { var w = p[2] || 1; ss += w * Math.pow(p[1] - a - b * p[0], 2); st += w * Math.pow(p[1] - my, 2); });
    return { a: a, b: b, r2: st ? 1 - ss / st : 0, at: function (x) { return a + b * x; } };
  }
  /* Runs that aren't interval sessions on the current route. */
  function steadyRuns() {
    var byDate = {};
    allDays().forEach(function (d) { byDate[d.d] = d; });
    return RUNS.filter(function (r) { var d = byDate[r.date]; return !d || d.t !== "int"; });
  }

  /* A small SVG scatter: dots with hover tips, an optional trend curve and reference lines.
     Domains may run backwards (pace axes put faster to the right or top). */
  function scatterSVG(o) {
    var W = o.w || 640, H = o.h || 300, L = 52, R = 16, T = 14, B = 38;
    function sx(x) { return L + (x - o.x[0]) / (o.x[1] - o.x[0]) * (W - L - R); }
    function sy(y) { return T + (1 - (y - o.y[0]) / (o.y[1] - o.y[0])) * (H - T - B); }
    var g = "";
    (o.band || []).forEach(function (b) { g += "<rect class=\"sc-band\" x=\"" + Math.min(sx(b[0]), sx(b[1])) + "\" y=\"" + T + "\" width=\"" + Math.abs(sx(b[1]) - sx(b[0])) + "\" height=\"" + (H - T - B) + "\"></rect>"; });
    o.yTicks.forEach(function (v) { g += "<line class=\"sc-grid\" x1=\"" + L + "\" x2=\"" + (W - R) + "\" y1=\"" + sy(v) + "\" y2=\"" + sy(v) + "\"></line><text class=\"sc-ax\" x=\"" + (L - 8) + "\" y=\"" + (sy(v) + 4) + "\" text-anchor=\"end\">" + esc(o.fy(v)) + "</text>"; });
    o.xTicks.forEach(function (v) { g += "<text class=\"sc-ax\" x=\"" + sx(v) + "\" y=\"" + (H - B + 18) + "\" text-anchor=\"middle\">" + esc(o.fx(v)) + "</text>"; });
    g += "<text class=\"sc-ax sc-title\" x=\"" + (W - R) + "\" y=\"" + (H - 4) + "\" text-anchor=\"end\">" + esc(o.xLabel) + "</text>";
    (o.refs || []).forEach(function (r) {
      if (r.y !== undefined) g += "<line class=\"sc-ref\" x1=\"" + L + "\" x2=\"" + (W - R) + "\" y1=\"" + sy(r.y) + "\" y2=\"" + sy(r.y) + "\"></line><text class=\"sc-ref-l\" x=\"" + (L + 6) + "\" y=\"" + (sy(r.y) - 6) + "\">" + esc(r.label) + "</text>";
    });
    if (o.curve) {
      var d = "";
      for (var i = 0; i <= 40; i++) {
        var x = o.x[0] + (o.x[1] - o.x[0]) * i / 40, y = o.curve(x);
        if (!(y >= Math.min(o.y[0], o.y[1]) && y <= Math.max(o.y[0], o.y[1]))) continue;
        d += (d ? " L" : "M") + sx(x).toFixed(1) + " " + sy(y).toFixed(1);
      }
      g += "<path class=\"sc-fit\" d=\"" + d + "\"></path>";
    }
    (o.vrefs || []).forEach(function (r) {
      g += "<line class=\"sc-ref" + (r.cls ? " " + r.cls : "") + "\" x1=\"" + sx(r.x) + "\" x2=\"" + sx(r.x) + "\" y1=\"" + T + "\" y2=\"" + (H - B) + "\"></line><text class=\"sc-ref-l" + (r.cls ? " " + r.cls : "") + "\" x=\"" + (sx(r.x) + (r.end ? -6 : 6)) + "\" y=\"" + (T + 12) + "\" text-anchor=\"" + (r.end ? "end" : "start") + "\">" + esc(r.label) + "</text>";
    });
    (o.segs || []).forEach(function (s) {
      g += "<line class=\"" + (s.cls || "sc-fit") + "\" x1=\"" + sx(s.x0).toFixed(1) + "\" y1=\"" + sy(s.y0).toFixed(1) + "\" x2=\"" + sx(s.x1).toFixed(1) + "\" y2=\"" + sy(s.y1).toFixed(1) + "\"></line>";
    });
    o.pts.forEach(function (p) {
      var cx = sx(p.x).toFixed(1), cy = sy(p.y).toFixed(1);
      g += "<circle class=\"sc-dot" + (p.cls ? " " + p.cls : "") + "\" cx=\"" + cx + "\" cy=\"" + cy + "\" r=\"" + (p.r || 4.5) + "\"></circle>";
      g += "<circle class=\"sc-hit\" cx=\"" + cx + "\" cy=\"" + cy + "\" r=\"10\" data-tip=\"" + esc(p.tip) + "\"></circle>";
    });
    return "<svg class=\"scatter\" viewBox=\"0 0 " + W + " " + H + "\" role=\"img\" aria-label=\"" + esc(o.label) + "\">" + g + "</svg>";
  }
  function paceTicks(lo, hi) { var t = []; for (var p = Math.ceil(lo / 30) * 30; p <= hi; p += 30) t.push(p); return t; }

  function renderStats() {
    var runs = RUNS, el = document.getElementById("st-totals");
    if (!runs.length) { el.innerHTML = "<p class=\"muted\">No runs synced from Strava yet.</p>"; return; }
    var km = 0, sec = 0, elev = 0, kcal = 0, beats = 0;
    runs.forEach(function (r) { km += r.m / 1000; sec += r.sec; elev += r.elev || 0; kcal += r.kcal || 0; if (r.hr) beats += r.hr * r.sec / 60; });
    var gelKcal = clampNum(inp.gel, 10, 50, 26) * 4;
    el.innerHTML = [
      [Math.round(km * 10) / 10 + " km", runs.length + " runs since 28 Sep"],
      [fmtClock(sec).replace(/:\d\d$/, "") + " h", "on your feet"],
      [elev + " m", "climbed, " + (Math.round(elev / 328 * 10) / 10) + " Sky Towers"],
      [Math.round(beats).toLocaleString("en-NZ"), "heartbeats"],
      [kcal.toLocaleString("en-NZ") + " kcal", "about " + Math.round(kcal / gelKcal) + " gels' worth"]
    ].map(function (s) { return "<div class=\"stat\"><b class=\"num\">" + esc(s[0]) + "</b><span>" + esc(s[1]) + "</span></div>"; }).join("");

    renderLoad();
    renderMonthly();
    renderEasyHR();
    renderPredictor();
    renderThreshold();
    renderBeats();
    renderStride();
    renderCadence();
    renderHills();
    renderTimeOfDay();
    renderRecords();
    renderFun();
  }

  /* Speed is close to linear in HR across easy to race efforts, so fit speed on HR and read it at the
     middle of the marathon HR band. Skips each run's first km (HR still rising), partial and walking kms. */
  function renderPredictor() {
    var pts = [];
    steadyRuns().forEach(function (r) {
      var pos = 0;
      r.splits.forEach(function (s, i) {
        pos += s[0];
        if (i === 0 || s[0] < 900 || !s[2] || s[1] / s[0] * 1000 > 420) return;
        pts.push({ hr: s[2], v: s[0] / s[1], w: s[1], tip: niceDate(r.date) + " · km " + Math.round(pos / 1000) + " · " + fmtPace(s[1] / s[0] * 1000) + "/km · HR " + s[2], fast: s[1] / s[0] * 1000 < 290 });
      });
    });
    var head = document.getElementById("st-predict-head"), box = document.getElementById("st-predict");
    if (pts.length < 10) { head.innerHTML = "<p class=\"muted\">Needs at least 10 steady km splits.</p>"; box.innerHTML = ""; return; }
    var f = fitLine(pts.map(function (p) { return [p.hr, p.v, p.w]; }));
    var mid = MARATHON_HR_MID, v = f.at(mid), pace = 1000 / v, T = MARATHON_KM * 1000 / v;
    var gap = pace - mpSec();
    head.innerHTML = "<div class=\"stats\">" +
      "<div class=\"stat\"><b class=\"num\">" + fmtPace(pace) + "/km</b><span>at HR " + mid.toFixed(0) + ", from your trend</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + fmtClock(T).replace(/:\d\d$/, "") + "</b><span>marathon at that pace</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + (Math.abs(gap) < 2 ? "On target" : Math.round(Math.abs(gap)) + " s/km " + (gap > 0 ? "slower" : "faster")) + "</b><span>than your " + fmtPace(mpSec()) + "/km target</span></div></div>" +
      "<p class=\"muted chart-note\">Based on " + pts.length + " km splits, mostly easy ones, so it's a stretch to read off at marathon effort. Fit R² " + f.r2.toFixed(2) + ". Your fast kms (orange) show what you've actually run near that heart rate. Race-day fatigue and heat push it slower, and the 33 km and the half will sharpen it. An estimate, not a promise.</p>";
    var hrs = pts.map(function (p) { return p.hr; }), paces = pts.map(function (p) { return 1000 / p.v; });
    var x0 = Math.floor((Math.min.apply(null, hrs) - 5) / 10) * 10, x1 = Math.ceil((Math.max.apply(null, hrs) + 5) / 10) * 10;
    var ySlow = Math.ceil((Math.max.apply(null, paces) + 10) / 30) * 30, yFast = Math.floor((Math.min.apply(null, paces.concat([pace, mpSec()])) - 10) / 30) * 30;
    var xt = []; for (var x = x0; x <= x1; x += 10) xt.push(x);
    box.innerHTML = scatterSVG({
      x: [x0, x1], y: [ySlow, yFast], xTicks: xt, yTicks: paceTicks(yFast, ySlow), fx: String, fy: fmtPace,
      xLabel: "Heart rate (bpm) →", label: "Pace against heart rate for each km split, with a trend line",
      band: [MARATHON_HR], refs: [{ y: mpSec(), label: "Target " + fmtPace(mpSec()) + "/km" }],
      curve: function (hr) { return 1000 / f.at(hr); },
      pts: pts.map(function (p) { return { x: p.hr, y: 1000 / p.v, tip: p.tip, cls: p.fast ? "hot" : "" }; })
    }) + "<div class=\"vol-key\"><span><i class=\"sw-dot\"></i>Steady km</span><span><i class=\"sw-dot hot\"></i>Faster than 4:50/km</span><span><i class=\"sw-fit\"></i>Trend</span><span><i class=\"sw-band\"></i>Marathon HR 165–172</span></div>";
  }

  /* ---------- threshold finder ---------- */
  /* Heart rate climbs in a straight line with speed until around lactate threshold, then bends away and flattens
     (the idea behind the Conconi test). Every km split from runs of 5 km or more is plotted as HR against speed, a
     smooth curve is fitted, and the bend is found by Dmax: the point on the curve farthest from the straight line
     joining its two ends. Dmax held steady on your data where a two-straight-lines fit jumped between 3:45 and 4:40.
     Skips each run's first km (HR still rising), partial and walking kms, and interval days.
     Refitting on runs picked at random, with repeats, gives a likely range. */
  var TH_WINDOWS = [["3", "3 months"], ["6", "6 months"], ["12", "12 months"], ["all", "Everything"]];
  function thresholdRuns(win) {
    var byDate = {}, seen = {}, out = [], R = window.RESULTS || {};
    allDays().forEach(function (d) { byDate[d.d] = d; });
    var from = win === "all" ? "0000" : addDays(today, -Math.round(+win * 30.44));
    RUNS.map(function (r) { return { id: r.id, d: r.date, m: r.m, splits: r.splits }; }).concat(R.fives || [], R.longs || []).forEach(function (r) {
      if (!r.splits || seen[r.id] || r.d < from || r.m < 4800 || (byDate[r.d] && byDate[r.d].t === "int")) return;
      seen[r.id] = true;
      var pos = 0, kms = [];
      r.splits.forEach(function (s, i) {
        pos += s[0];
        var pace = s[1] / s[0] * 1000;
        if (i > 0 && s[0] >= 900 && s[2] && pace >= 180 && pace <= 420) {
          kms.push({ v: 3.6 * s[0] / s[1], hr: s[2], tip: niceDate(r.d) + " · km " + Math.round(pos / 1000) + " · " + fmtPace(pace) + "/km · HR " + s[2] });
        }
      });
      if (kms.length) out.push(kms);
    });
    return out;
  }
  /* Least squares cubic, HR on speed, centred on the mean speed to keep the sums well behaved. */
  function cubicFit(pts) {
    var mv = pts.reduce(function (t, p) { return t + p.v; }, 0) / pts.length, A = [], B = [0, 0, 0, 0], i, j, k;
    for (i = 0; i < 4; i++) A.push([0, 0, 0, 0]);
    pts.forEach(function (p) {
      var d = p.v - mv, x = [1, d, d * d, d * d * d];
      for (j = 0; j < 4; j++) { B[j] += x[j] * p.hr; for (k = 0; k < 4; k++) A[j][k] += x[j] * x[k]; }
    });
    var m = A.map(function (r, n) { return r.concat([B[n]]); });
    for (i = 0; i < 4; i++) {
      var piv = i;
      for (j = i + 1; j < 4; j++) if (Math.abs(m[j][i]) > Math.abs(m[piv][i])) piv = j;
      var t = m[i]; m[i] = m[piv]; m[piv] = t;
      if (Math.abs(m[i][i]) < 1e-9) return null;
      for (j = 0; j < 4; j++) if (j !== i) { var f = m[j][i] / m[i][i]; for (k = i; k < 5; k++) m[j][k] -= f * m[i][k]; }
    }
    var c = m.map(function (r, n) { return r[4] / r[n]; });
    return function (v) { var d = v - mv; return c[0] + d * (c[1] + d * (c[2] + d * c[3])); };
  }
  /* Dmax over the 5th to 98th percentile of speeds, which keeps a stray km at either end from steering it. */
  function dmaxOf(pts) {
    var vs = pts.map(function (p) { return p.v; }).sort(function (a, b) { return a - b; });
    var lo = vs[Math.floor(vs.length * 0.05)], hi = vs[Math.floor(vs.length * 0.98)], f = cubicFit(pts);
    if (!f || hi - lo < 1) return null;
    var y0 = f(lo), y1 = f(hi), best = null;
    for (var v = lo; v <= hi; v += 0.02) {
      var d = f(v) - (y0 + (y1 - y0) * (v - lo) / (hi - lo));
      if (!best || d > best.d) best = { v: v, hr: f(v), d: d };
    }
    return best && best.d > 0 ? { v: best.v, hr: best.hr, d: best.d, lo: lo, hi: hi, f: f, chord: function (x) { return y0 + (y1 - y0) * (x - lo) / (hi - lo); } } : null;
  }
  /* The bend for a window, plus its 10th–90th percentile range over 150 resamples of whole runs. */
  function thresholdFor(win) {
    var runs = thresholdRuns(win), pts = [].concat.apply([], runs);
    var fast = pts.filter(function (p) { return p.v >= 14; }).length;
    var res = { runs: runs, pts: pts, fast: fast, dm: pts.length >= 40 && fast >= 8 ? dmaxOf(pts) : null, vs: [], hs: [] };
    if (!res.dm) return res;
    var rand = seeded(pts.length * 7919 + runs.length);
    for (var b = 0; b < 150; b++) {
      var sample = [];
      for (var i = 0; i < runs.length; i++) sample = sample.concat(runs[Math.floor(rand() * runs.length)]);
      var x = dmaxOf(sample);
      if (x) { res.vs.push(x.v); res.hs.push(x.hr); }
    }
    res.vs.sort(function (a, c) { return a - c; }); res.hs.sort(function (a, c) { return a - c; });
    res.ranged = res.vs.length >= 50;
    return res;
  }
  /* Small seeded random generator, so the range doesn't change on every render. */
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pct(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]; }

  function renderThreshold() {
    var head = document.getElementById("st-th-head"), box = document.getElementById("st-th");
    var win = TH_WINDOWS.some(function (w) { return w[0] === inp.thw; }) ? inp.thw : "6";
    var picker = "<div class=\"th-pick\" role=\"group\" aria-label=\"How far back to look\">" + TH_WINDOWS.map(function (w) {
      return "<button type=\"button\" class=\"link-btn\" data-thw=\"" + w[0] + "\" aria-pressed=\"" + (w[0] === win) + "\">" + esc(w[1]) + "</button>";
    }).join("") + "</div>";
    var res = thresholdFor(win), runs = res.runs, pts = res.pts, dm = res.dm;
    if (pts.length < 40 || res.fast < 8) {
      head.innerHTML = picker + "<p class=\"muted chart-note\">Not enough to go on here: " + pts.length + " km splits, " + res.fast + " of them faster than 4:17/km. Try a longer window.</p>";
      box.innerHTML = "";
      return;
    }
    var vSamp = res.vs, hSamp = res.hs, enough = res.ranged;

    var vs = pts.map(function (p) { return p.v; }), hrs = pts.map(function (p) { return p.hr; });
    var x0 = Math.floor(Math.min.apply(null, vs) * 2) / 2, x1 = Math.ceil(Math.max.apply(null, vs) * 2) / 2;
    var y0 = Math.floor((Math.min.apply(null, hrs) - 4) / 10) * 10, y1 = Math.ceil((Math.max.apply(null, hrs) + 4) / 10) * 10;
    var xt = [420, 390, 360, 330, 300, 270, 240, 210, 180].map(function (p) { return 3600 / p; }).filter(function (v) { return v >= x0 && v <= x1; });
    var yt = []; for (var y = y0; y <= y1; y += 10) yt.push(y);

    /* Median HR in 10 s/km pace bins, to show the shape through the scatter. */
    var bins = {};
    pts.forEach(function (p) { var k = Math.round(3600 / p.v / 10) * 10; (bins[k] = bins[k] || []).push(p.hr); });
    var meds = Object.keys(bins).filter(function (k) { return bins[k].length >= 3; }).map(function (k) {
      var h = bins[k].sort(function (a, c) { return a - c; });
      return { x: 3600 / +k, y: pct(h, 0.5), r: 6.5, tip: fmtPace(+k) + "/km · median HR " + pct(h, 0.5) + " from " + h.length + " kms" };
    });

    var o = { x: [x0, x1], y: [y0, y1], xTicks: xt, yTicks: yt, fx: function (v) { return fmtPace(3600 / v); }, fy: String,
      xLabel: "Pace, faster to the right →", label: "Heart rate against speed for each km split, with a two-line fit",
      pts: pts.map(function (p) { return { x: p.v, y: p.hr, r: 3, cls: "faint", tip: p.tip }; }).concat(meds),
      vrefs: [{ x: 3600 / mpSec(), label: "Race pace", end: false }] };
    var stats = "", note, table = "";
    if (dm) {
      var v0 = dm.v, h0 = dm.hr, gap = mpSec() - 3600 / v0;
      /* The fitted curve, the straight line joining its ends, and the gap between them at the bend. */
      o.curve = function (v) { return v >= dm.lo && v <= dm.hi ? dm.f(v) : NaN; };
      o.segs = [
        { x0: dm.lo, y0: dm.chord(dm.lo), x1: dm.hi, y1: dm.chord(dm.hi), cls: "sc-fit th-ext" },
        { x0: v0, y0: dm.chord(v0), x1: v0, y1: h0, cls: "sc-fit th-above" }
      ];
      o.vrefs.push({ x: v0, label: "Bend " + fmtPace(3600 / v0), cls: "th-mark", end: true });
      if (enough) o.band = [[pct(vSamp, 0.1), pct(vSamp, 0.9)]];
      stats = "<div class=\"stats\">" +
        "<div class=\"stat\"><b class=\"num\">" + fmtPace(3600 / v0) + "/km</b><span>where your HR bends away from speed</span></div>" +
        "<div class=\"stat\"><b class=\"num\">" + Math.round(h0) + " bpm</b><span>HR at the bend</span></div>" +
        (enough ? "<div class=\"stat\"><b class=\"num\">" + fmtPace(3600 / pct(vSamp, 0.9)) + "–" + fmtPace(3600 / pct(vSamp, 0.1)) + "</b><span>likely range, HR " + Math.round(pct(hSamp, 0.1)) + "–" + Math.round(pct(hSamp, 0.9)) + "</span></div>" : "") +
        "<div class=\"stat\"><b class=\"num\">" + (Math.abs(gap) < 1 ? "Same" : Math.round(Math.abs(gap)) + " s/km " + (gap > 0 ? "slower" : "faster")) + "</b><span>race pace " + fmtPace(mpSec()) + " against the bend</span></div></div>";
      note = "From " + pts.length + " km splits in " + runs.length + " runs. The dashed line joins the two ends of the curve, and the bend is where the curve sits farthest above it" +
        (enough ? ". The shaded band is where the bend lands in 80% of refits on runs picked at random" : "") + ". " +
        "This is one estimate, and it reads slower than the others: your 17:44 5k suggests a threshold nearer 3:45–3:50/km and HR 176–180, and the fitness chart assumes " + LTHR + ". " +
        "Field data drags the bend slower. Your fastest kms come mostly from 5k races, where HR is still catching up, and many 4:15–4:30 kms come late in long runs, where HR has drifted up. " +
        (gap < 8 ? "So race pace close to the bend doesn't by itself mean " + fmtPace(mpSec()) + " is too fast. Test 1 (8 km at 4:15 after 25 km) is better evidence. " : "") +
        "A proper test is one run that speeds up in steps, such as 1 km at a time from 5:00/km down to 3:40/km, after Kerikeri.";
      table = "<div class=\"table-box\"><table><thead><tr><th>Looking back</th><th class=\"r\">Bend</th><th class=\"r\">HR</th><th class=\"r\">Likely range</th><th class=\"r\">kms</th></tr></thead><tbody>" +
        TH_WINDOWS.map(function (w) {
          var r = w[0] === win ? res : thresholdFor(w[0]);
          if (!r.dm) return "<tr><td>" + esc(w[1]) + "</td><td class=\"r\" colspan=\"4\">not enough fast kms</td></tr>";
          return "<tr" + (w[0] === win ? " class=\"cur\"" : "") + "><td>" + esc(w[1]) + "</td><td class=\"r\">" + fmtPace(3600 / r.dm.v) + "</td><td class=\"r\">" + Math.round(r.dm.hr) + "</td><td class=\"r\">" + (r.ranged ? fmtPace(3600 / pct(r.vs, 0.9)) + "–" + fmtPace(3600 / pct(r.vs, 0.1)) : "–") + "</td><td class=\"r\">" + r.pts.length + "</td></tr>";
        }).join("") + "</tbody></table></div><p class=\"vol-legend\">Longer windows mix in older, less fit months, so they read slower. A bend moving faster over time means your threshold is improving.</p>";
    } else {
      var line = fitLine(pts.map(function (p) { return [p.v, p.hr]; }));
      o.curve = function (v) { return line.at(v); };
      note = "No bend in this window: HR keeps rising in a straight line with speed (" + pts.length + " km splits, " + runs.length + " runs). That can mean too few fast kms, or a mix of fitness levels. Try another window.";
    }
    head.innerHTML = picker + stats + "<p class=\"muted chart-note\">" + esc(note) + "</p>";
    box.innerHTML = scatterSVG(o) + "<div class=\"vol-key\"><span><i class=\"sw-dot faint\"></i>Km split</span><span><i class=\"sw-dot\"></i>Median HR for each 10 s of pace</span>" +
      (dm ? "<span><i class=\"sw-fit\"></i>Fitted curve</span><span><i class=\"sw-fit th-ext\"></i>Straight line between its ends</span><span><i class=\"sw-fit th-above\"></i>Biggest gap: the bend</span>" + (enough ? "<span><i class=\"sw-band\"></i>Likely range</span>" : "") : "<span><i class=\"sw-fit\"></i>Straight-line fit</span>") + "</div>" + table;
  }

  function renderBeats() {
    var rows = RUNS.filter(function (r) { return r.hr; }).map(function (r) { return { r: r, b: r.hr * r.sec / 60 / (r.m / 1000) }; });
    var max = Math.max.apply(null, rows.map(function (x) { return x.b; })) * 1.05;
    document.getElementById("st-beats").innerHTML = rows.map(function (x) {
      var r = x.r;
      return "<div class=\"vol-row beats-row\" title=\"" + esc(r.name) + "\"><span><b>" + niceDate(r.date) + "</b><br><span class=\"muted\" style=\"font-size:12px\">" + (Math.round(r.m / 100) / 10) + " km · " + fmtPace(r.sec / r.m * 1000) + "/km · HR " + r.hr + "</span></span>" +
        "<div class=\"vol-track\"><div class=\"vol-act\" style=\"top:0;bottom:0;width:" + (x.b / max * 100).toFixed(1) + "%\"></div></div>" +
        "<span class=\"num\" style=\"text-align:right\"><b>" + Math.round(x.b) + "</b></span></div>";
    }).join("") + "<p class=\"vol-legend\">Beats per km. Faster running costs more beats per minute but fewer per km, so a flat-out 5k can come out the lowest. Watch easy runs at similar paces for the trend.</p>";
  }

  /* Stride length = speed ÷ steps per second. Laps over 200 m and 30 s, with walking recoveries left out. */
  function renderStride() {
    var laps = [];
    RUNS.forEach(function (r) {
      (r.laps || []).forEach(function (l) {
        if (l[0] < 200 || l[1] < 30 || !l[3] || l[3] < 70) return;
        var sp = l[0] / l[1], pace = 1000 / sp, spm = l[3] * 2;
        if (pace > 450 || pace < 150) return;
        laps.push({ sp: sp, pace: pace, spm: spm, stride: sp / (spm / 60), w: l[1], tip: niceDate(r.date) + " · " + Math.round(l[0]) + " m at " + fmtPace(pace) + "/km · " + Math.round(spm) + " spm · " + (sp / (spm / 60)).toFixed(2) + " m stride" });
      });
    });
    var head = document.getElementById("st-stride-head");
    if (laps.length < 10) { head.innerHTML = "<p class=\"muted\">Needs at least 10 laps with cadence.</p>"; return; }
    var fs = fitLine(laps.map(function (l) { return [l.sp, l.stride, l.w]; })), fc = fitLine(laps.map(function (l) { return [l.sp, l.spm, l.w]; }));
    var easy = 335, mp = mpSec();
    var s1 = fs.at(1000 / easy), s2 = fs.at(1000 / mp), c1 = fc.at(1000 / easy), c2 = fc.at(1000 / mp);
    var ds = (s2 / s1 - 1) * 100, dc = (c2 / c1 - 1) * 100;
    head.innerHTML = "<div class=\"stats\" style=\"padding:0\">" +
      "<div class=\"stat\"><b class=\"num\">+" + Math.round(ds) + "%</b><span>stride, " + s1.toFixed(2) + " → " + s2.toFixed(2) + " m from 5:35 to " + fmtPace(mp) + "/km</span></div>" +
      "<div class=\"stat\"><b class=\"num\">+" + Math.round(dc) + "%</b><span>cadence, " + Math.round(c1) + " → " + Math.round(c2) + " steps a minute</span></div></div>" +
      "<p class=\"muted chart-note\">" + (ds > dc * 2 ? "You speed up mostly by lengthening your stride. Long strides cost more on tired legs, so late in the race a few extra steps a minute is the cheaper way to hold pace." : "You speed up with both longer strides and quicker steps.") +
      " Strava gives run cadence for one foot, so it's doubled here. From " + laps.length + " laps. An estimate.</p>";
    var paces = laps.map(function (l) { return l.pace; });
    var xSlow = Math.ceil((Math.max.apply(null, paces) + 5) / 30) * 30, xFast = Math.floor((Math.min.apply(null, paces) - 5) / 30) * 30;
    function chart(key, fit, fy, step, label) {
      var vals = laps.map(function (l) { return l[key]; });
      var lo = Math.floor(Math.min.apply(null, vals) / step) * step, hi = Math.ceil(Math.max.apply(null, vals) / step) * step, ticks = [];
      for (var t = lo; t <= hi + 1e-9; t += step) ticks.push(t);
      return scatterSVG({
        w: 400, h: 260, x: [xSlow, xFast], y: [lo, hi], xTicks: paceTicks(xFast, xSlow).filter(function (p, i, a) { return (a.length - 1 - i) % 2 === 0; }), yTicks: ticks, fx: fmtPace, fy: fy,
        xLabel: "Pace (min/km), faster →", label: label,
        curve: function (p) { return fit.at(1000 / p); },
        pts: laps.map(function (l) { return { x: l.pace, y: l[key], tip: l.tip }; })
      });
    }
    document.getElementById("st-stride").innerHTML = chart("stride", fs, function (v) { return v.toFixed(1) + " m"; }, 0.2, "Stride length against pace for each lap, with a trend line");
    document.getElementById("st-cadence").innerHTML = chart("spm", fc, function (v) { return Math.round(v); }, 10, "Cadence against pace for each lap, with a trend line");
  }

  /* ---------- every run since 2025 ---------- */
  /* From js/results.js as [date, start time, name, metres, seconds, HR, climb m, steps per minute]. */
  var ALL = ((window.RESULTS && window.RESULTS.all) || []).map(function (x) {
    return { d: x[0], hm: x[1], name: x[2], m: x[3], sec: x[4], hr: x[5], elev: x[6], spm: x[7], pace: x[3] ? x[4] / x[3] * 1000 : 0 };
  }).filter(function (r) { return r.m >= 1000 && r.pace > 150 && r.pace < 600; });
  function mean(list) { return list.length ? list.reduce(function (a, b) { return a + b; }, 0) / list.length : NaN; }
  function statTiles(list) { return "<div class=\"stats\" style=\"padding:0\">" + list.map(function (s) { return "<div class=\"stat\"><b class=\"num\">" + esc(s[0]) + "</b><span>" + esc(s[1]) + "</span></div>"; }).join("") + "</div>"; }

  /* Monthly distance, with the longest run of each month on the same km axis. */
  function renderMonthly() {
    var head = document.getElementById("st-month-head"), box = document.getElementById("st-month");
    if (!ALL.length) { head.innerHTML = "<p class=\"muted\">No runs synced yet.</p>"; box.innerHTML = ""; return; }
    var months = [], d = dateObj(ALL[0].d), end = dateObj(today);
    for (var y = d.getFullYear(), m = d.getMonth(); y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth()); m === 11 ? (y++, m = 0) : m++) {
      var key = y + "-" + String(m + 1).padStart(2, "0"), runs = ALL.filter(function (r) { return r.d.slice(0, 7) === key; });
      months.push({ key: key, y: y, m: m, km: runs.reduce(function (a, r) { return a + r.m; }, 0) / 1000, n: runs.length,
        long: runs.reduce(function (a, r) { return !a || r.m > a.m ? r : a; }, null) });
    }
    var cur = months[months.length - 1], big = months.reduce(function (a, x) { return x.km > a.km ? x : a; }, months[0]);
    var total = months.reduce(function (a, x) { return a + x.km; }, 0), longest = ALL.reduce(function (a, r) { return r.m > a.m ? r : a; }, ALL[0]);
    function mLabel(x) { return MON[x.m] + " " + x.y; }
    head.innerHTML = statTiles([
      [Math.round(total).toLocaleString("en-NZ") + " km", ALL.length + " runs since " + mLabel(months[0])],
      [Math.round(big.km) + " km", "biggest month, " + mLabel(big)],
      [Math.round(cur.km) + " km", MON[cur.m] + " so far, " + cur.n + " runs"],
      [(Math.round(longest.m / 100) / 10) + " km", "longest run, " + niceDate(longest.d)]
    ]);
    var max = Math.ceil(Math.max.apply(null, months.map(function (x) { return x.km; }).concat([MARATHON_KM])) / 50) * 50, yt = [];
    for (var v = 0; v <= max; v += 50) yt.push(v);
    box.innerHTML = timeSVG({
      h: 260, x: [-0.6, months.length - 0.4], y: [0, max], yTicks: yt, fy: function (v) { return v + " km"; }, label: "Distance each month, with the longest run of each month",
      xTicks: months.map(function (x, i) { return { x: i, l: x.m % 3 === 0 || i === 0 ? MON[x.m] + (x.m === 0 || i === 0 ? " " + String(x.y).slice(2) : "") : "" }; }).filter(function (t) { return t.l; }),
      bars: months.map(function (x, i) { return { x: i, y: x.km, cls: "mo-bar" + (x === cur ? " proj" : "") }; }),
      dots: months.filter(function (x) { return x.long; }).map(function (x) { var i = months.indexOf(x); return { x: i, y: x.long.m / 1000, cls: "key", tip: mLabel(x) + " · longest " + (Math.round(x.long.m / 100) / 10) + " km, " + niceDate(x.long.d) }; }),
      cols: months.map(function (x, i) { return { x: i, tip: mLabel(x) + (x === cur ? " so far" : "") + " · " + (Math.round(x.km * 10) / 10) + " km in " + x.n + " runs" }; })
    }) + "<div class=\"vol-key\"><span><i class=\"sw-plan\" style=\"background:var(--accent);box-shadow:none\"></i>km in the month</span><span><i class=\"sw-dot key\"></i>Longest run that month</span></div>" +
      "<p class=\"muted chart-note\">Runs only, from Strava. The current month is paler because it isn't finished.</p>";
  }

  /* Cadence over time, split into easy runs (slower than 5:00/km) and fast ones (under 4:30/km), each with a trend.
     Watch glitches outside 140–200 steps a minute are left out. */
  function renderCadence() {
    var head = document.getElementById("st-cad-head"), box = document.getElementById("st-cad");
    var pts = ALL.filter(function (r) { return r.spm >= 140 && r.spm <= 200 && r.m >= 3000 && (r.pace >= 300 || r.pace < 270); });
    var easy = pts.filter(function (r) { return r.pace >= 300; }), fast = pts.filter(function (r) { return r.pace < 270; });
    if (easy.length < 5) { head.innerHTML = "<p class=\"muted\">Needs more runs with cadence.</p>"; box.innerHTML = ""; return; }
    function trend(list) {
      if (list.length < 4) return null;
      var f = fitLine(list.map(function (r) { return [dayNum(r.d), r.spm]; })), a = dayNum(list[0].d), b = dayNum(list[list.length - 1].d);
      return { f: f, a: a, b: b, from: f.at(a), to: f.at(b) };
    }
    var te = trend(easy), tf = trend(fast);
    function tile(t, label, first) { return [signed(t.to - t.from) + " spm", label + ", " + Math.round(t.from) + " → " + Math.round(t.to) + " since " + niceDate(first.d) + " " + first.d.slice(0, 4)]; }
    var tiles = [tile(te, "easy runs", easy[0])];
    if (tf) tiles.push(tile(tf, "fast runs", fast[0]));
    head.innerHTML = statTiles(tiles) + "<p class=\"muted chart-note\">Whole-run average steps a minute, from Strava. A few more steps a minute at the same pace usually means shorter, lighter strides, which cost less late in a marathon. Each run's average mixes warm-up and reps, so watch the trend, not single dots.</p>";
    var x0 = dayNum(pts[0].d) - 10, x1 = dayNum(today) + 10, sp = pts.map(function (r) { return r.spm; });
    var lo = Math.floor(Math.min.apply(null, sp) / 5) * 5, hi = Math.ceil(Math.max.apply(null, sp) / 5) * 5, yt = [];
    for (var v = lo; v <= hi; v += 5) yt.push(v);
    function tip(r) { return niceDate(r.d) + " · " + r.name + " · " + fmtPace(r.pace) + "/km · " + r.spm + " spm"; }
    box.innerHTML = timeSVG({
      h: 260, x: [x0, x1], y: [lo, hi], yTicks: yt, fy: String, xTicks: monthTicks(x0, x1, x1 - x0 > 300 ? 2 : 1), label: "Cadence for each run over time, easy and fast runs, with trends",
      lines: [te, tf].filter(Boolean).map(function (t, i) { return { cls: "ln " + (t === te ? "ln-fit" : "ln-last"), pts: [[t.a, t.from], [t.b, t.to]] }; }),
      dots: easy.map(function (r) { return { x: dayNum(r.d), y: r.spm, cls: "", tip: tip(r) }; }).concat(fast.map(function (r) { return { x: dayNum(r.d), y: r.spm, cls: "sat", tip: tip(r) }; }))
    }) + "<div class=\"vol-key\"><span><i class=\"sw-dot\"></i>Easy, slower than 5:00/km</span><span><i class=\"sw-dot sat\"></i>Fast, under 4:30/km</span><span><i class=\"sw-ln fit\"></i>Easy trend</span><span><i class=\"sw-ln last\"></i>Fast trend</span></div>";
  }

  /* Hills: your hilliest runs against the course's climbing, and what hills cost in heartbeats per km on easy runs. */
  var COURSE_CLIMB = 217;
  function renderHills() {
    var head = document.getElementById("st-hill-head"), box = document.getElementById("st-hill");
    var top = ALL.filter(function (r) { return r.elev > 0; }).sort(function (a, b) { return b.elev - a.elev; }).slice(0, 8);
    /* Steady easy runs, 5:00–6:30/km, over 4 km with HR: flat is under 5 m of climb per km, hilly 10 m or more. */
    var easy = ALL.filter(function (r) { return r.hr && r.m >= 4000 && r.pace >= 300 && r.pace <= 390 && r.d >= addDays(today, -365); });
    function bpk(r) { return r.hr * r.pace / 60; }
    var flat = easy.filter(function (r) { return r.elev / r.m * 1000 < 5; }), hilly = easy.filter(function (r) { return r.elev / r.m * 1000 >= 10; });
    var tiles = [[String(ALL.filter(function (r) { return r.elev >= 150; }).length), "runs with 150 m or more of climbing since " + ALL[0].d.slice(0, 4)]];
    var cost = null;
    if (flat.length >= 3 && hilly.length >= 3) {
      cost = (mean(hilly.map(bpk)) / mean(flat.map(bpk)) - 1) * 100;
      tiles.push([signed(cost) + "%", "heartbeats per km on hilly easy runs against flat ones (" + hilly.length + " hilly, " + flat.length + " flat, last 12 months)"]);
    }
    head.innerHTML = statTiles(tiles) + "<p class=\"muted chart-note\">" +
      (cost === null ? "" : Math.abs(cost) < 3 ? "Hills barely change what an easy km costs you in heartbeats, which usually means you ease the pace on climbs and keep the effort steady. That's exactly how to run the bridge and the North Shore. " : "Hilly easy runs cost you " + Math.abs(Math.round(cost)) + "% " + (cost > 0 ? "more" : "fewer") + " heartbeats per km. Hilly runs also tend to be slower, so pace explains part of that, not just the hills. ") +
      "Climbing is from your watch, which can be noisy. The race listing gives the course about " + COURSE_CLIMB + " m, mostly in the first half on the North Shore and the bridge.</p>";
    var max = Math.max(COURSE_CLIMB, top.length ? top[0].elev : 0) * 1.08;
    box.innerHTML = top.map(function (r) {
      return "<div class=\"vol-row\" title=\"" + esc(r.name) + "\"><span><b>" + niceDate(r.d) + " " + r.d.slice(2, 4) + "</b><br><span class=\"muted\" style=\"font-size:12px\">" + (Math.round(r.m / 100) / 10) + " km · " + fmtPace(r.pace) + "/km" + (r.hr ? " · HR " + r.hr : "") + "</span></span>" +
        "<div class=\"vol-track\"><div class=\"vol-act\" style=\"top:0;bottom:0;width:" + (r.elev / max * 100).toFixed(1) + "%\"></div><div class=\"vol-mark\" style=\"left:" + (COURSE_CLIMB / max * 100).toFixed(1) + "%\"></div></div>" +
        "<span class=\"num\" style=\"text-align:right\"><b>" + r.elev + " m</b><br><span class=\"muted\" style=\"font-size:12px\">" + (Math.round(r.elev / r.m * 10000) / 10) + " m/km</span></span></div>";
    }).join("") + "<p class=\"vol-legend\">Your 8 hilliest runs. Dashed line: the marathon's " + COURSE_CLIMB + " m. The course spreads it over 42 km, about " + (Math.round(COURSE_CLIMB / MARATHON_KM * 10) / 10) + " m per km.</p>";
  }

  /* Morning or evening: when you run, and your heart rate against pace for steady runs at each time of day.
     Last 6 months only, so fitness gains don't favour whichever time you ran more recently. */
  function renderTimeOfDay() {
    var head = document.getElementById("st-tod-head"), box = document.getElementById("st-tod");
    function hour(r) { return +r.hm.slice(0, 2) + +r.hm.slice(3, 5) / 60; }
    var recent = ALL.filter(function (r) { return r.d >= addDays(today, -183); });
    var steady = recent.filter(function (r) { return r.hr && r.m >= 4000 && r.pace >= 285 && r.pace <= 390; });
    var am = steady.filter(function (r) { return hour(r) < 10; }), pm = steady.filter(function (r) { return hour(r) >= 16; });
    var counts = []; for (var h = 0; h < 24; h++) counts.push(0);
    recent.forEach(function (r) { counts[Math.floor(hour(r))]++; });
    var start = parseInt(String(inp.start || "06:00").slice(0, 2), 10) || 6, early = recent.filter(function (r) { return hour(r) < 9; }).length;
    var tiles = [[Math.round(early / Math.max(1, recent.length) * 100) + "%", "of your runs in the last 6 months started before 9 am. The race starts at " + (inp.start || "06:00")]];
    var REF = 330, fa = am.length >= 4 ? fitLine(am.map(function (r) { return [r.pace, r.hr, r.sec]; })) : null, fp = pm.length >= 4 ? fitLine(pm.map(function (r) { return [r.pace, r.hr, r.sec]; })) : null;
    if (fa && fp) {
      var ha = fa.at(REF), hp = fp.at(REF);
      tiles.push([Math.round(ha) + " vs " + Math.round(hp), "HR at " + fmtPace(REF) + "/km, mornings vs evenings (" + am.length + " and " + pm.length + " steady runs)"]);
    }
    head.innerHTML = statTiles(tiles) + "<p class=\"muted chart-note\">Steady runs are 4:45–6:30/km and over 4 km. " + (fa && fp ? (Math.abs(ha - hp) < 3 ? "Your heart rate at the same pace is about the same at either time of day, so early starts don't cost you anything you can see here." : "Your heart rate at the same pace is " + Math.round(Math.abs(ha - hp)) + " beats " + (ha < hp ? "lower in the morning" : "higher in the morning") + ". Routes, heat and how tired you were also differ, so it's a hint, not proof.") : "Needs at least 4 steady morning and 4 steady evening runs to compare.") + "</p>";
    /* When you run: starts by hour of day. */
    var maxC = Math.max.apply(null, counts), yt = [];
    var stepC = maxC > 20 ? 10 : 5;
    for (var v = 0; v <= Math.ceil(maxC / stepC) * stepC; v += stepC) yt.push(v);
    var hist = timeSVG({
      w: 520, h: 200, x: [-0.6, 23.6], y: [0, yt[yt.length - 1]], yTicks: yt, fy: String, label: "Number of runs by start hour, last 6 months",
      xTicks: [0, 3, 6, 9, 12, 15, 18, 21].map(function (h) { return { x: h, l: String(h).padStart(2, "0") + ":00" }; }),
      marks: [{ x: start, l: "Race start" }],
      bars: counts.map(function (c, h) { return { x: h, y: c, cls: "mo-bar" + (h < 10 ? "" : " pm") }; }),
      cols: counts.map(function (c, h) { return { x: h, tip: String(h).padStart(2, "0") + ":00–" + String(h).padStart(2, "0") + ":59 · " + c + " runs" }; })
    });
    var sc = "";
    if (fa && fp) {
      var paces = am.concat(pm).map(function (r) { return r.pace; }), hrs = am.concat(pm).map(function (r) { return r.hr; });
      var xs = Math.ceil((Math.max.apply(null, paces) + 5) / 30) * 30, xf = Math.floor((Math.min.apply(null, paces) - 5) / 30) * 30;
      var y0 = Math.floor((Math.min.apply(null, hrs) - 3) / 10) * 10, y1 = Math.ceil((Math.max.apply(null, hrs) + 3) / 10) * 10, yt2 = [];
      for (v = y0; v <= y1; v += 10) yt2.push(v);
      var tip = function (r) { return niceDate(r.d) + " " + r.hm + " · " + r.name + " · " + fmtPace(r.pace) + "/km · HR " + r.hr; };
      sc = scatterSVG({
        w: 520, h: 240, x: [xs, xf], y: [y0, y1], xTicks: paceTicks(xf, xs), yTicks: yt2, fx: fmtPace, fy: String, xLabel: "Pace (min/km), faster →", label: "Heart rate against pace for steady morning and evening runs",
        pts: am.map(function (r) { return { x: r.pace, y: r.hr, tip: tip(r) }; }).concat(pm.map(function (r) { return { x: r.pace, y: r.hr, tip: tip(r), cls: "pm" }; }))
      }).replace("</svg>", ["am", "pm"].map(function (k) {
        var f = k === "am" ? fa : fp, W = 520, L = 52, R = 16, T = 14, B = 38, H = 240;
        function sx(x) { return L + (x - xs) / (xf - xs) * (W - L - R); }
        function sy(y) { return T + (1 - (y - y0) / (y1 - y0)) * (H - T - B); }
        return "<path class=\"ln " + (k === "am" ? "ln-fit" : "ln-last") + "\" d=\"M" + sx(xs).toFixed(1) + " " + sy(f.at(xs)).toFixed(1) + " L" + sx(xf).toFixed(1) + " " + sy(f.at(xf)).toFixed(1) + "\"></path>";
      }).join("") + "</svg>");
    }
    box.innerHTML = "<h3 class=\"chart-sub\">When you run</h3>" + hist + (sc ? "<h3 class=\"chart-sub\">Heart rate at the same pace</h3>" + sc : "") +
      "<div class=\"vol-key\"><span><i class=\"sw-dot\"></i>Morning, before 10 am</span><span><i class=\"sw-dot sat\"></i>Evening, from 4 pm</span>" + (sc ? "<span><i class=\"sw-ln fit\"></i>Morning trend</span><span><i class=\"sw-ln last\"></i>Evening trend</span>" : "") + "</div>";
  }

  /* Easy heart rate at a fixed 5:30/km: each steady easy run's average HR, moved to that pace along the slope of
     HR against pace across all of them, then averaged by month. */
  var EASY_REF = 330;
  function renderEasyHR() {
    var head = document.getElementById("st-ehr-head"), box = document.getElementById("st-ehr");
    var runs = ALL.filter(function (r) { return r.hr && r.m >= 4000 && r.pace >= 300 && r.pace <= 390; });
    if (runs.length < 10) { head.innerHTML = "<p class=\"muted\">Needs at least 10 easy runs with heart rate.</p>"; box.innerHTML = ""; return; }
    var slope = fitLine(runs.map(function (r) { return [r.pace, r.hr, r.sec]; })).b;
    runs.forEach(function (r) { r.adj = r.hr - slope * (r.pace - EASY_REF); });
    var months = {};
    runs.forEach(function (r) { (months[r.d.slice(0, 7)] = months[r.d.slice(0, 7)] || []).push(r); });
    var mk = Object.keys(months).sort().filter(function (k) { return months[k].length >= 2; });
    var line = mk.map(function (k) { return [dayNum(k + "-15"), mean(months[k].map(function (r) { return r.adj; })), k, months[k].length]; });
    var first = line.slice(0, 3), last = line.slice(-3);
    var a = mean(first.map(function (p) { return p[1]; })), b = mean(last.map(function (p) { return p[1]; }));
    /* "May–Jul 2025", or "Dec 2025–Feb 2026" across a new year. */
    function mRange(list) {
      var s = list[0][2], e = list[list.length - 1][2], ms = MON[+s.slice(5, 7) - 1], me = MON[+e.slice(5, 7) - 1];
      return s.slice(0, 4) === e.slice(0, 4) ? ms + "–" + me + " " + e.slice(0, 4) : ms + " " + s.slice(0, 4) + "–" + me + " " + e.slice(0, 4);
    }
    head.innerHTML = statTiles([
      [Math.round(a) + " → " + Math.round(b), "HR at " + fmtPace(EASY_REF) + "/km, " + mRange(first) + " against " + mRange(last)],
      [signed(b - a) + " bpm", b < a ? "the same easy pace now costs that many fewer beats a minute" : "no drop yet in what easy pace costs you"]
    ]) + "<p class=\"muted chart-note\">From " + runs.length + " easy runs (5:00–6:30/km, over 4 km). Each run's HR is shifted to 5:30/km using your own trend of " + Math.abs(slope * 10).toFixed(1) + " bpm per 10 s/km. Heat, hills, tiredness and different watches move single runs, so the monthly line matters more than any dot. Months with fewer than 2 easy runs are skipped.</p>";
    var x0 = dayNum(runs[0].d) - 10, x1 = dayNum(today) + 10, ys = runs.map(function (r) { return r.adj; });
    var lo = Math.floor((Math.min.apply(null, ys) - 2) / 10) * 10, hi = Math.ceil((Math.max.apply(null, ys) + 2) / 10) * 10, yt = [];
    for (var v = lo; v <= hi; v += hi - lo > 50 ? 10 : 5) yt.push(v);
    box.innerHTML = timeSVG({
      h: 260, x: [x0, x1], y: [lo, hi], yTicks: yt, fy: String, xTicks: monthTicks(x0, x1, x1 - x0 > 300 ? 2 : 1), label: "Easy-run heart rate adjusted to 5:30/km, with monthly averages",
      lines: [{ cls: "ln ln-avg", pts: line.map(function (p) { return [p[0], p[1]]; }) }],
      dots: runs.map(function (r) { return { x: dayNum(r.d), y: r.adj, cls: "", tip: niceDate(r.d) + " " + r.d.slice(0, 4) + " · " + r.name + " · " + fmtPace(r.pace) + "/km at HR " + r.hr + " · about " + Math.round(r.adj) + " at 5:30/km" }; }),
      cols: []
    }) + "<div class=\"vol-key\"><span><i class=\"sw-dot\"></i>Easy run, HR moved to 5:30/km</span><span><i class=\"sw-ln avg\"></i>Monthly average</span></div>";
  }

  /* Records since 2025. Fastest km comes from every km split the sync keeps: plan runs, hard 5ks and long runs. */
  function renderRecords() {
    var el = document.getElementById("st-records");
    if (!ALL.length) { el.innerHTML = ""; return; }
    function maxBy(list, f) { return list.reduce(function (a, x) { return f(x) > f(a) ? x : a; }, list[0]); }
    function minBy(list, f) { return list.reduce(function (a, x) { return f(x) < f(a) ? x : a; }, list[0]); }
    var recs = [];
    var lng = maxBy(ALL, function (r) { return r.m; });
    recs.push(["Longest run", (Math.round(lng.m / 100) / 10) + " km", lng.d, lng.name]);
    var tl = maxBy(ALL, function (r) { return r.sec; });
    recs.push(["Longest time out", fmtClock(tl.sec).replace(/:\d\d$/, "") + " h", tl.d, tl.name]);
    var best5 = FIVES.filter(function (f) { return f.hard; });
    if (best5.length) { var b5 = minBy(best5, function (f) { return f.t; }); recs.push(["Fastest 5k", fmtClock(b5.t), b5.d, b5.name]); }
    /* Every full km split the site has. */
    var km = [];
    RUNS.forEach(function (r) { r.splits.forEach(function (s) { km.push({ s: s, d: r.date, name: r.name }); }); });
    FIVES.concat(LONGS).forEach(function (r) { (r.splits || []).forEach(function (s) { km.push({ s: s, d: r.d, name: r.name }); }); });
    km = km.filter(function (k) { return k.s[0] >= 980 && k.s[1] / k.s[0] * 1000 > 150; });
    if (km.length) { var fk = minBy(km, function (k) { return k.s[1] / k.s[0]; }); recs.push(["Fastest km", fmtPace(fk.s[1] / fk.s[0] * 1000), fk.d, fk.name]); }
    /* Weeks run Monday to Sunday. */
    var weeks = {};
    ALL.forEach(function (r) { var w = addDays(r.d, -((dateObj(r.d).getDay() + 6) % 7)); weeks[w] = (weeks[w] || 0) + r.m / 1000; });
    var bw = maxBy(Object.keys(weeks), function (w) { return weeks[w]; });
    recs.push(["Biggest week", (Math.round(weeks[bw] * 10) / 10) + " km", bw, "Week of " + niceDate(bw)]);
    /* Days in a row with a run. */
    var days = {}, best = { n: 0 }, run = 0, prev = null;
    ALL.forEach(function (r) { days[r.d] = true; });
    Object.keys(days).sort().forEach(function (d) {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1;
      if (run > best.n) best = { n: run, end: d };
      prev = d;
    });
    recs.push(["Most days in a row", best.n + " days", best.end, "Ending " + niceDate(best.end)]);
    var climb = maxBy(ALL, function (r) { return r.elev; });
    recs.push(["Biggest climb", climb.elev + " m", climb.d, climb.name]);
    var early = minBy(ALL, function (r) { return r.hm; }), late = maxBy(ALL, function (r) { return r.hm; });
    recs.push(["Earliest start", early.hm, early.d, early.name], ["Latest start", late.hm, late.d, late.name]);
    el.innerHTML = recs.map(function (x) {
      return "<div class=\"card rec\"><span class=\"eyebrow\">" + esc(x[0]) + "</span><b class=\"num\">" + esc(x[1]) + "</b><span class=\"muted\">" + niceDate(x[2]) + " " + x[2].slice(0, 4) + " · " + esc(x[3]) + "</span></div>";
    }).join("");
  }

  /* Every run since 2025 in familiar units. Road distance Auckland to Wellington is about 640 km. */
  function renderFun() {
    var el = document.getElementById("st-fun");
    if (!ALL.length) { el.innerHTML = ""; return; }
    var km = 0, sec = 0, climb = 0, beats = 0;
    ALL.forEach(function (r) { km += r.m / 1000; sec += r.sec; climb += r.elev; if (r.hr) beats += r.hr * r.sec / 60; });
    el.innerHTML = [
      [Math.round(km).toLocaleString("en-NZ") + " km", "about " + (Math.round(km / 640 * 10) / 10) + " times Auckland to Wellington by road"],
      [String(Math.floor(km / MARATHON_KM)), "marathons' worth of running"],
      [Math.round(sec / 3600) + " h", "running, about " + (Math.round(sec / 86400 * 10) / 10) + " days non-stop"],
      [Math.round(climb).toLocaleString("en-NZ") + " m", "climbed: " + Math.round(climb / 328) + " Sky Towers, or " + (Math.round(climb / 8849 * 10) / 10) + " Everests"],
      [(Math.round(beats / 1e5) / 10) + " million", "heartbeats on runs with HR"],
      [(Math.round(km / ALL.length * 10) / 10) + " km", "average run, from " + ALL.length + " runs"]
    ].map(function (s) { return "<div class=\"stat\"><b class=\"num\">" + esc(s[0]) + "</b><span>" + esc(s[1]) + "</span></div>"; }).join("");
  }

  /* ---------- charts over time ---------- */
  var DAY0 = "2025-01-01";
  function dayNum(iso) { return daysBetween(DAY0, iso); }
  function addDays(iso, n) { return isoLocal(new Date(dateObj(iso).getTime() + n * 86400000)); }
  /* Month labels between two day numbers, every `every` months, with the year on January and the first label. */
  function monthTicks(x0, x1, every) {
    var d = dateObj(addDays(DAY0, x0)), out = [];
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12);
    for (; dayNum(isoLocal(d)) <= x1; d = new Date(d.getFullYear(), d.getMonth() + every, 1, 12)) {
      out.push({ x: dayNum(isoLocal(d)), l: MON[d.getMonth()] + (d.getMonth() === 0 || !out.length ? " " + d.getFullYear() : "") });
    }
    return out;
  }
  /* A small SVG chart against date (x in day numbers): lines, step lines, bars from zero, dots with tips,
     marker lines, and hover columns that show a tip for each day. y may run backwards (faster times up). */
  function timeSVG(o) {
    var W = o.w || 640, H = o.h || 260, L = 52, R = o.r || 16, T = 16, B = o.xTicks ? 30 : 10;
    function sx(x) { return L + (x - o.x[0]) / (o.x[1] - o.x[0]) * (W - L - R); }
    function sy(y) { return T + (1 - (y - o.y[0]) / (o.y[1] - o.y[0])) * (H - T - B); }
    function path(pts, step) {
      return pts.map(function (p, i) {
        var s = (i ? " L" : "M") + sx(p[0]).toFixed(1) + " " + sy(p[1]).toFixed(1);
        return step && i ? " L" + sx(p[0]).toFixed(1) + " " + sy(pts[i - 1][1]).toFixed(1) + s : s;
      }).join("");
    }
    var g = "", dayW = (W - L - R) / (o.x[1] - o.x[0]);
    o.yTicks.forEach(function (v) { g += "<line class=\"sc-grid" + (v === 0 && o.zero ? " zero" : "") + "\" x1=\"" + L + "\" x2=\"" + (W - R) + "\" y1=\"" + sy(v) + "\" y2=\"" + sy(v) + "\"></line><text class=\"sc-ax\" x=\"" + (L - 8) + "\" y=\"" + (sy(v) + 4) + "\" text-anchor=\"end\">" + esc(o.fy(v)) + "</text>"; });
    (o.xTicks || []).forEach(function (t) { g += "<text class=\"sc-ax\" x=\"" + sx(t.x) + "\" y=\"" + (H - B + 18) + "\" text-anchor=\"middle\">" + esc(t.l) + "</text>"; });
    (o.marks || []).forEach(function (m) {
      g += "<line class=\"tl-mark\" x1=\"" + sx(m.x) + "\" x2=\"" + sx(m.x) + "\" y1=\"" + T + "\" y2=\"" + (H - B) + "\"></line>";
      if (m.l) g += "<text class=\"sc-ref-l\" x=\"" + (sx(m.x) + (m.end ? -5 : 5)) + "\" y=\"" + (T + 8) + "\" text-anchor=\"" + (m.end ? "end" : "start") + "\">" + esc(m.l) + "</text>";
    });
    (o.bars || []).forEach(function (b) {
      var y0 = sy(0), y1 = sy(b.y), w = Math.max(1.5, dayW - 2);
      g += "<rect class=\"" + b.cls + "\" x=\"" + (sx(b.x) - w / 2).toFixed(1) + "\" y=\"" + Math.min(y0, y1).toFixed(1) + "\" width=\"" + w.toFixed(1) + "\" height=\"" + Math.max(0.5, Math.abs(y1 - y0)).toFixed(1) + "\" rx=\"1\"></rect>";
    });
    (o.lines || []).forEach(function (l) { if (l.pts.length > 1) g += "<path class=\"" + l.cls + "\" d=\"" + path(l.pts, l.step) + "\"></path>"; });
    (o.labels || []).forEach(function (t) { g += "<text class=\"tl-lab\" x=\"" + (sx(t.x) + 6) + "\" y=\"" + (sy(t.y) + 4) + "\">" + esc(t.l) + "</text>"; });
    (o.dots || []).forEach(function (p) {
      var cx = sx(p.x).toFixed(1), cy = sy(p.y).toFixed(1);
      g += "<circle class=\"sc-dot " + (p.cls || "") + "\" cx=\"" + cx + "\" cy=\"" + cy + "\" r=\"4.5\"></circle>";
      g += "<circle class=\"sc-hit\" cx=\"" + cx + "\" cy=\"" + cy + "\" r=\"10\" data-tip=\"" + esc(p.tip) + "\"></circle>";
    });
    (o.cols || []).forEach(function (c) { g += "<rect class=\"sc-col\" x=\"" + (sx(c.x) - dayW / 2).toFixed(1) + "\" y=\"" + T + "\" width=\"" + dayW.toFixed(1) + "\" height=\"" + (H - T - B) + "\" data-tip=\"" + esc(c.tip) + "\"></rect>"; });
    return "<svg class=\"scatter\" viewBox=\"0 0 " + W + " " + H + "\" role=\"img\" aria-label=\"" + esc(o.label) + "\">" + g + "</svg>";
  }

  /* ---------- fitness and freshness ---------- */
  /* Training load for each run from heart rate (Banister TRIMP), scaled so an hour at threshold scores 100.
     Max HR 201 matches your Strava zones and the 200 you hit in the 29 Sep 5k. Threshold HR 179 is 89% of that,
     the top of Strava's zone 3. Resting HR 50 is a guess; it shifts the numbers a little, not the shape.
     Runs without HR fall back to pace against a 3:57/km threshold pace. */
  var HR_MAX = 201, HR_REST = 50, LTHR = 179, THRESH_PACE = 237;
  function trimpMin(hr) { var x = Math.max(0, Math.min(1, (hr - HR_REST) / (HR_MAX - HR_REST))); return x * 0.64 * Math.exp(1.92 * x); }
  var LT_HOUR = 60 * trimpMin(LTHR);
  function hrLoad(sec, hr) { return sec / 60 * trimpMin(hr) / LT_HOUR * 100; }
  function paceLoad(sec, m) { var f = THRESH_PACE / (sec / m * 1000); return sec / 3600 * f * f * 100; }
  function runLoad(r) {
    if (!r.splits.some(function (s) { return s[2]; }) && !r.hr) return paceLoad(r.sec, r.m);
    return r.splits.reduce(function (t, s) { var hr = s[2] || r.hr; return t + (hr ? hrLoad(s[1], hr) : paceLoad(s[1], s[0])); }, 0);
  }
  /* Planned sessions count at a typical pace (s/km) and average HR for their type, from your runs so far. */
  var PLAN_EFFORT = { easy: [330, 141], long: [335, 145], int: [300, 152], race: [215, 184], test: [275, 162] };
  /* Fitness is the 42-day average load, fatigue the 7-day one, and freshness is fitness minus fatigue, each
     as it stands on the morning of the day. Planned sessions carry it on to race morning. */
  function loadSeries() {
    var hist = (window.RESULTS && window.RESULTS.history) || [], loads = {}, planned = {};
    function add(d, l) { loads[d] = (loads[d] || 0) + l; }
    hist.forEach(function (h) { add(h[0], h[3] ? hrLoad(h[1], h[3]) : paceLoad(h[1], h[2])); });
    RUNS.forEach(function (r) { add(r.date, runLoad(r)); });
    allDays().forEach(function (d) {
      var e = PLAN_EFFORT[d.t];
      if (!e || !d.km || d.d >= RACE_DATE || d.d < today || (d.d === today && runsOn(today).length)) return;
      add(d.d, hrLoad(d.km * e[0], e[1]));
      planned[d.d] = true;
    });
    var start = hist.length ? hist[0][0] : (RUNS.length ? RUNS[0].date : P.WEEKS[0].days[0].d);
    /* Start from the average of the first four weeks, not from zero. */
    var seed = 0;
    for (var i = 0; i < 28; i++) seed += loads[addDays(start, i)] || 0;
    var ctl = seed / 28, atl = ctl, out = [];
    for (var d = start; d <= RACE_DATE; d = addDays(d, 1)) {
      var l = loads[d] || 0;
      out.push({ d: d, ctl: ctl, atl: atl, tsb: ctl - atl, load: l, proj: d > today || !!planned[d] });
      ctl += (l - ctl) / 42;
      atl += (l - atl) / 7;
    }
    return out;
  }
  function signed(x) { x = Math.round(x); return (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x); }
  function renderLoad() {
    var head = document.getElementById("st-load-head"), box = document.getElementById("st-load");
    var all = loadSeries();
    if (all.length < 42) { head.innerHTML = "<p class=\"muted\">Needs about six weeks of runs.</p>"; box.innerHTML = ""; return; }
    var from = addDays(P.WEEKS[0].days[0].d, -42), s = all.filter(function (x) { return x.d >= from; });
    var now = s.filter(function (x) { return x.d <= today; }).pop() || s[0], race = s[s.length - 1];
    var peak = s.reduce(function (a, x) { return x.ctl > a.ctl ? x : a; }, s[0]);
    head.innerHTML = "<div class=\"stats\">" +
      "<div class=\"stat\"><b class=\"num\">" + Math.round(now.ctl) + "</b><span>fitness this morning, " + (peak.proj ? "heading for " : "peak ") + Math.round(peak.ctl) + " on " + niceDate(peak.d) + "</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + Math.round(now.atl) + "</b><span>fatigue this morning</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + signed(now.tsb) + "</b><span>freshness this morning, " + (now.tsb >= 0 ? "fresh" : "carrying fatigue") + "</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + signed(race.tsb) + "</b><span>freshness on race morning, keeping " + Math.round(race.ctl / peak.ctl * 100) + "% of peak fitness</span></div></div>" +
      "<p class=\"muted chart-note\">Load comes from heart rate in each km split, scaled so an hour at threshold (HR about 179) scores 100. An easy hour scores about 45. Fitness is your 42-day average load, fatigue the 7-day average, and freshness is the gap between them. After today the dashed lines follow the plan on your current route. A common rule of thumb is to race with freshness somewhere around +5 to +25. It's a model built on a guessed resting HR, so read the shape, not the exact numbers.</p>";

    var x0 = dayNum(s[0].d), x1 = dayNum(race.d), tx = dayNum(now.d);
    var xt = [];
    for (var d = P.WEEKS[0].days[0].d; d >= s[0].d; d = addDays(d, -14)) xt.unshift({ x: dayNum(d), l: niceDate(d).slice(4) });
    for (d = addDays(P.WEEKS[0].days[0].d, 14); d <= race.d; d = addDays(d, 14)) xt.push({ x: dayNum(d), l: niceDate(d).slice(4) });
    function pts(key, proj) {
      return s.filter(function (x) { return proj ? x.d >= now.d : x.d <= now.d; }).map(function (x) { return [dayNum(x.d), x[key]]; });
    }
    var yMax = Math.ceil(Math.max.apply(null, s.map(function (x) { return Math.max(x.ctl, x.atl); })) / 20) * 20, yt = [];
    for (var v = 0; v <= yMax; v += 20) yt.push(v);
    function tip(x) { return niceDate(x.d) + (x.proj ? " (planned)" : "") + " · fitness " + Math.round(x.ctl) + " · fatigue " + Math.round(x.atl) + " · freshness " + signed(x.tsb) + (x.load ? " · load that day " + Math.round(x.load) : ""); }
    var cols = s.map(function (x) { return { x: dayNum(x.d), tip: tip(x) }; });
    var marks = [{ x: tx, l: "Today" }, { x: dayNum(P.WEEKS[0].days[0].d), l: "Plan starts" }];
    var top = timeSVG({
      h: 230, r: 70, x: [x0 - 0.5, x1 + 0.5], y: [0, yMax], yTicks: yt, fy: String, label: "Fitness and fatigue by day, with the plan projected to race day",
      marks: marks,
      lines: [{ cls: "ln ln-fit", pts: pts("ctl") }, { cls: "ln ln-fit proj", pts: pts("ctl", true) }, { cls: "ln ln-fat", pts: pts("atl") }, { cls: "ln ln-fat proj", pts: pts("atl", true) }],
      labels: [{ x: x1, y: race.ctl, l: "Fitness" }, { x: x1, y: race.atl, l: "Fatigue" }],
      cols: cols
    });
    var lo = Math.floor(Math.min.apply(null, s.map(function (x) { return x.tsb; })) / 10) * 10, hi = Math.max(10, Math.ceil(Math.max.apply(null, s.map(function (x) { return x.tsb; })) / 10) * 10), yt2 = [];
    var step = hi - lo > 60 ? 20 : 10;
    for (v = Math.ceil(lo / step) * step; v <= hi; v += step) yt2.push(v);
    var bottom = timeSVG({
      h: 190, r: 70, x: [x0 - 0.5, x1 + 0.5], y: [lo, hi], yTicks: yt2, fy: signed, zero: true, label: "Freshness by day",
      xTicks: xt, marks: [{ x: tx }, { x: x1, l: "Race " + signed(race.tsb), end: true }],
      bars: s.map(function (x) { return { x: dayNum(x.d), y: x.tsb, cls: "fr-bar " + (x.tsb >= 0 ? "pos" : "neg") + (x.proj ? " proj" : "") }; }),
      cols: cols
    });
    box.innerHTML = "<h3 class=\"chart-sub\">Fitness and fatigue</h3>" + top + "<h3 class=\"chart-sub\">Freshness</h3>" + bottom +
      "<div class=\"vol-key\"><span><i class=\"sw-ln fit\"></i>Fitness</span><span><i class=\"sw-ln fat\"></i>Fatigue</span><span><i class=\"sw-ln proj\"></i>Planned, after today</span><span><i class=\"sw-fr pos\"></i>Fresh</span><span><i class=\"sw-fr neg\"></i>Tired</span></div>";
  }

  /* ---------- 5k page ---------- */
  /* Tuesday Good George runs and Saturday parkruns from js/results.js. Short courses are scaled up to 5 km;
     long ones keep their watch time, so nothing gets a time it didn't run. */
  var HARD_PACE = 290;
  var FIVES = ((window.RESULTS && window.RESULTS.fives) || []).filter(function (f) { return f && f.d; }).map(function (f) {
    var t = f.m >= 5000 ? f.sec : f.sec * 5000 / f.m;
    return { d: f.d, name: f.name, m: f.m, sec: f.sec, hr: f.hr, max: f.max, temp: f.temp, splits: f.splits, ll: f.ll, t: t, tue: dateObj(f.d).getDay() === 2, hard: t / 5 < HARD_PACE };
  });
  /* Tuesdays you raced, not just ran briskly: HR 170 or more, or under 4:10/km when the watch had no HR.
     Same flat course every week, so these are the cleanest measure of 5k fitness. */
  function raced(f) { return f.tue && f.hard && (f.hr ? f.hr >= 170 : f.t / 5 < 250); }
  /* Straight-line trend of raced Tuesday times over the last six months. */
  function fiveTrend() {
    var pts = FIVES.filter(function (f) { return raced(f) && daysBetween(f.d, today) <= 183; });
    if (pts.length < 5) return null;
    var fit = fitLine(pts.map(function (f) { return [dayNum(f.d), f.t]; }));
    return { fit: fit, pts: pts, last: pts[pts.length - 1] };
  }
  var LONGS = ((window.RESULTS && window.RESULTS.longs) || []);
  function riegel(t, from, to) { return t * Math.pow(to / from, 1.06); }
  (function () {
    var best = {};
    FIVES.forEach(function (f) {
      var k = f.tue ? "tue" : "sat";
      if (f.hard && (!best[k] || f.t < best[k].t)) { f.pb = best[k] ? best[k].t - f.t : 0; best[k] = f; }
    });
  })();
  function fiveLabel(f) { return f.tue ? "Tuesday" : "Saturday"; }
  function fiveTip(f) { return niceDate(f.d) + " · " + f.name + " · " + fmtClock(f.t) + " (" + fmtPace(f.t / 5) + "/km)" + (f.hr ? " · HR " + f.hr : "") + (f.pb !== undefined ? " · best so far" : ""); }
  function renderFiveK() {
    var el = document.getElementById("fk-stats");
    if (!FIVES.length) { el.innerHTML = "<p class=\"muted\">No Tuesday or Saturday 5ks synced from Strava yet.</p>"; return; }
    var tue = FIVES.filter(function (f) { return f.tue; }), sat = FIVES.filter(function (f) { return !f.tue; });
    function bestOf(list) { return list.filter(function (f) { return f.hard; }).reduce(function (a, f) { return !a || f.t < a.t ? f : a; }, null); }
    function firstHard(list) { return list.filter(function (f) { return f.hard; })[0]; }
    var bt = bestOf(tue), bs = bestOf(sat), ft = firstHard(tue), best = bestOf(FIVES);
    var tiles = [];
    if (bt) tiles.push([fmtClock(bt.t), "best Tuesday, " + niceDate(bt.d)]);
    if (bs) tiles.push([fmtClock(bs.t), "best Saturday, " + niceDate(bs.d)]);
    if (ft && bt && bt !== ft) tiles.push([fmtClock(ft.t - bt.t) + " faster", "on Tuesdays since " + niceDate(ft.d) + " (" + fmtClock(ft.t) + ")"]);
    tiles.push([String(FIVES.length), "5ks since " + MON[dateObj(FIVES[0].d).getMonth()] + " " + FIVES[0].d.slice(0, 4) + ", " + FIVES.filter(function (f) { return f.hard; }).length + " run hard"]);
    if (best) tiles.push([fmtClock(riegel(best.t, 5000, MARATHON_KM * 1000)).replace(/:\d\d$/, ""), "marathon your 5k best is worth, with the endurance to match"]);
    /* Where the raced-Tuesday trend points, six weeks out. Straight lines overshoot as gains slow, so it's capped there. */
    var tr = fiveTrend(), AHEAD = 42, projDay = addDays(today, AHEAD);
    if (tr) {
      var perMonth = tr.fit.b * 30;
      tiles.push(perMonth < -1 ? [fmtClock(tr.fit.at(dayNum(projDay))), "on trend by " + niceDate(projDay) + ", " + fmtClock(-perMonth) + " a month faster on raced Tuesdays"]
        : ["Levelled off", "raced Tuesday times over the last six months"]);
    }
    el.innerHTML = tiles.map(function (s) { return "<div class=\"stat\"><b class=\"num\">" + esc(s[0]) + "</b><span>" + esc(s[1]) + "</span></div>"; }).join("");

    var x0 = dayNum(FIVES[0].d) - 10, x1 = dayNum(today) + 10, span = x1 - x0;
    var xt = monthTicks(x0, x1, span > 300 ? 2 : 1);
    function dots(f, y) { return { x: dayNum(f.d), y: y, cls: (f.tue ? "tue" : "sat") + (f.hard ? "" : " easy"), tip: fiveTip(f) }; }
    function pbLine(list, cls) {
      var pts = [];
      list.forEach(function (f) { if (f.pb !== undefined) pts.push([dayNum(f.d), f.t]); });
      if (pts.length) pts.push([dayNum(today), pts[pts.length - 1][1]]);
      return { cls: "ln ln-pb " + cls, pts: pts, step: true };
    }

    /* Every 5k, faster up. */
    var trendLine = tr ? [[dayNum(tr.pts[0].d), tr.fit.at(dayNum(tr.pts[0].d))], [dayNum(projDay), tr.fit.at(dayNum(projDay))]] : [];
    var ts = FIVES.map(function (f) { return f.t; }).concat(trendLine.map(function (p) { return p[1]; }));
    var slow = Math.ceil((Math.max.apply(null, ts) + 20) / 60) * 60, fast = Math.floor((Math.min.apply(null, ts) - 20) / 60) * 60;
    var step = slow - fast > 600 ? 120 : 60, yt = [];
    for (var v = fast; v <= slow; v += step) yt.push(v);
    var tx1 = tr ? dayNum(projDay) + 5 : x1;
    document.getElementById("fk-times").innerHTML = timeSVG({
      h: 300, x: [x0, tx1], y: [slow, fast], yTicks: yt, fy: fmtClock, xTicks: monthTicks(x0, tx1, tx1 - x0 > 300 ? 2 : 1), label: "Time for every Tuesday and Saturday 5k, faster at the top, with the raced-Tuesday trend",
      marks: tr ? [{ x: dayNum(today), l: "Today", end: true }] : [],
      lines: [pbLine(tue, "tue"), pbLine(sat, "sat")].concat(tr ? [{ cls: "ln ln-trend proj", pts: trendLine }] : []),
      dots: FIVES.map(function (f) { return dots(f, f.t); })
    }) + "<div class=\"vol-key\"><span><i class=\"sw-dot\"></i>Tuesday · Good George</span><span><i class=\"sw-dot sat\"></i>Saturday · parkrun</span><span><i class=\"sw-dot ring\"></i>Jogged, slower than " + fmtPace(HARD_PACE) + "/km</span><span><i class=\"sw-ln tue\"></i>Best so far</span>" + (tr ? "<span><i class=\"sw-ln proj\"></i>Raced-Tuesday trend, six months, carried six weeks on</span>" : "") + "</div>" +
      "<p class=\"muted chart-note\">Watch times from Strava, so they can differ from the official results by a few seconds. Courses measured short by GPS are scaled up to 5 km. Saturdays move between parkruns, some of them hilly, so Tuesday's flat course is the cleaner comparison. The trend uses only Tuesdays you raced (HR 170 or more). It's a straight line, and gains usually slow as you get faster, so read it as an upper bound.</p>";

    /* Best-ever list. */
    var pbs = FIVES.filter(function (f) { return f.pb !== undefined; });
    document.getElementById("fk-pbs").innerHTML = pbs.slice().reverse().map(function (f) {
      return "<tr><td class=\"nw\">" + niceDate(f.d) + " " + f.d.slice(2, 4) + "</td><td>" + fiveLabel(f) + "<br><span class=\"muted\" style=\"font-size:12px\">" + esc(f.name) + "</span></td><td class=\"r num\">" + fmtClock(f.t) + "</td><td class=\"r num\">" + (f.pb ? "−" + fmtClock(f.pb) : "first") + "</td></tr>";
    }).join("");

    /* Metres per heartbeat on hard runs: more distance for each beat means a fitter engine. */
    var eff = FIVES.filter(function (f) { return f.hard && f.hr; }).map(function (f) { return { f: f, y: f.m / (f.hr * f.sec / 60) }; });
    var eh = document.getElementById("fk-eff-head"), eb = document.getElementById("fk-eff");
    if (eff.length < 4) { eh.innerHTML = "<p class=\"muted\">Needs at least 4 hard 5ks with heart rate.</p>"; eb.innerHTML = ""; }
    else {
      var fit = fitLine(eff.map(function (e) { return [dayNum(e.f.d), e.y]; }));
      var ex0 = dayNum(eff[0].f.d), ex1 = dayNum(eff[eff.length - 1].f.d);
      var gain = (fit.at(ex1) / fit.at(ex0) - 1) * 100;
      var ys = eff.map(function (e) { return e.y; });
      var lo = Math.floor(Math.min.apply(null, ys) * 20) / 20, hi = Math.ceil(Math.max.apply(null, ys) * 20) / 20, yt2 = [];
      for (v = lo; v <= hi + 1e-9; v += 0.05) yt2.push(Math.round(v * 100) / 100);
      eh.innerHTML = "<div class=\"stats\" style=\"padding:0\"><div class=\"stat\"><b class=\"num\">" + (gain >= 0 ? "+" : "−") + Math.abs(Math.round(gain)) + "%</b><span>distance per heartbeat on hard 5ks, " + niceDate(eff[0].f.d) + " to " + niceDate(eff[eff.length - 1].f.d) + ", from the trend</span></div></div>" +
        "<p class=\"muted chart-note\">Distance ÷ total heartbeats, for runs faster than " + fmtPace(HARD_PACE) + "/km. When it goes up, each beat moves you further, so you're running faster for the same heart rate. Heat, hills and how hard you pushed all move single runs around. " + eff.length + " runs.</p>";
      eb.innerHTML = timeSVG({
        h: 260, x: [x0, x1], y: [lo, hi], yTicks: yt2, fy: function (y) { return y.toFixed(2) + " m"; }, xTicks: xt, label: "Metres per heartbeat on hard 5ks, with a trend line",
        lines: [{ cls: "ln ln-trend", pts: [[ex0, fit.at(ex0)], [ex1, fit.at(ex1)]] }],
        dots: eff.map(function (e) { var p = dots(e.f, e.y); p.tip += " · " + e.y.toFixed(2) + " m per beat"; return p; })
      }) + "<div class=\"vol-key\"><span><i class=\"sw-dot\"></i>Tuesday</span><span><i class=\"sw-dot sat\"></i>Saturday</span><span><i class=\"sw-fit\"></i>Trend</span></div>";
    }

    /* Every run, newest first. */
    document.getElementById("fk-table").innerHTML = FIVES.slice().reverse().map(function (f) {
      return "<tr><td class=\"nw\">" + niceDate(f.d) + " " + f.d.slice(2, 4) + "</td><td>" + esc(f.name) + "</td><td class=\"r num\">" + (Math.round(f.m / 10) / 100) + " km</td><td class=\"r num\">" + fmtClock(f.t) + (f.pb !== undefined ? " ★" : "") + "</td><td class=\"r num\">" + fmtPace(f.t / 5) + "</td><td class=\"r num\">" + (f.hr || "–") + "</td></tr>";
    }).join("");

    renderEndurance();
    renderPacing();
    renderHeat(tr);
    renderStreak();
    renderCourses();
  }

  /* Courses: 5ks grouped by start point (within 500 m), named from run names like "Zoo Parkrun" or "Good George".
     Two parkruns that start in the same place share a group, so it gets both names. */
  function courseName(n) {
    if (/good george|\bgg\b/i.test(n)) return "Good George";
    var m = /^(.*?)\s*park\s*run/i.exec(n);
    if (!m) return null;
    var s = m[1].replace(/^first\s+/i, "").trim();
    return !s || /^(saturday|morning|evening|afternoon|outdoor)$/i.test(s) ? null : s + " parkrun";
  }
  function renderCourses() {
    var groups = [], noLoc = 0;
    FIVES.forEach(function (f) {
      if (!f.ll) { noLoc++; return; }
      var g = groups.filter(function (x) {
        var dy = (x.ll[0] - f.ll[0]) * 111, dx = (x.ll[1] - f.ll[1]) * 111 * Math.cos(f.ll[0] * Math.PI / 180);
        return Math.sqrt(dx * dx + dy * dy) < 0.5;
      })[0];
      if (!g) { g = { ll: f.ll, runs: [] }; groups.push(g); }
      g.runs.push(f);
    });
    var unnamed = 0;
    groups.forEach(function (g) {
      var counts = {};
      g.runs.forEach(function (f) { var n = courseName(f.name); if (n) counts[n] = (counts[n] || 0) + 1; });
      var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
      g.name = names.length ? names.join(" / ") : "Unnamed course";
      if (!names.length) unnamed++;
      g.best = g.runs.filter(function (f) { return f.hard; }).reduce(function (a, f) { return !a || f.t < a.t ? f : a; }, null);
      var tue = g.runs.filter(function (f) { return f.tue; }).length;
      g.days = tue === g.runs.length ? "Tuesdays" : tue ? "Tuesdays and Saturdays" : "Saturdays";
    });
    groups.sort(function (a, b) { return b.runs.length - a.runs.length; });
    document.getElementById("fk-courses").innerHTML = groups.map(function (g) {
      var last = g.runs[g.runs.length - 1];
      return "<tr><td>" + esc(g.name) + "<br><span class=\"muted\" style=\"font-size:12px\">" + g.days + "</span></td><td class=\"r num\">" + g.runs.length + "</td><td class=\"r num\">" +
        (g.best ? fmtClock(g.best.t) + "<br><span class=\"muted\" style=\"font-size:12px\">" + niceDate(g.best.d) + " " + g.best.d.slice(2, 4) + "</span>" : "–") + "</td><td class=\"r nw\">" + niceDate(last.d) + " " + last.d.slice(2, 4) + "</td></tr>";
    }).join("");
    var notes = [];
    if (unnamed) notes.push(unnamed === 1 ? "One course has no name yet, because none of its runs is called something like \"Ōrākei parkrun\". Rename one run on Strava and the next sync picks it up." : unnamed + " courses have no name yet, because none of their runs is called something like \"Ōrākei parkrun\". Rename one run at each on Strava and the next sync picks the names up.");
    if (noLoc) notes.push(noLoc + " runs had no start location, so they aren't counted here.");
    var el = document.getElementById("fk-courses-note");
    el.textContent = notes.join(" ");
    el.hidden = !notes.length;
  }

  /* Speed against endurance: each hard run of 8 km or more next to what your 5k best at the time predicts for
     that distance (Riegel, exponent 1.06). Hard means average HR 165 or more, which also drops GPS glitches. */
  function renderEndurance() {
    var head = document.getElementById("fk-end-head"), box = document.getElementById("fk-end");
    var hardFives = FIVES.filter(function (f) { return f.hard; });
    function fiveAt(iso) {
      return hardFives.filter(function (f) { return f.d <= iso && daysBetween(f.d, iso) <= 120; }).reduce(function (a, f) { return !a || f.t < a.t ? f : a; }, null);
    }
    var rows = LONGS.filter(function (l) { return l.hr && l.hr >= 165; }).map(function (l) {
      var f = fiveAt(l.d);
      return f ? { l: l, f: f, pred: riegel(f.t, 5000, l.m), held: riegel(f.t, 5000, l.m) / l.sec } : null;
    }).filter(Boolean);
    var best = hardFives.reduce(function (a, f) { return !a || f.t < a.t ? f : a; }, null);
    if (!best) { head.innerHTML = "<p class=\"muted\">Needs a hard 5k.</p>"; box.innerHTML = ""; return; }
    var mPred = riegel(best.t, 5000, MARATHON_KM * 1000), need = mPred / targetSec();
    var half = rows.filter(function (r) { return r.l.m >= 20000; }).pop();
    head.innerHTML = "<div class=\"stats\" style=\"padding:0\">" +
      (half ? "<div class=\"stat\"><b class=\"num\">" + Math.round(half.held * 100) + "%</b><span>of your 5k speed held over " + (Math.round(half.l.m / 100) / 10) + " km, " + esc(half.l.name.replace(/!+$/, "")) + ", " + niceDate(half.l.d) + " " + half.l.d.slice(0, 4) + "</span></div>" : "") +
      "<div class=\"stat\"><b class=\"num\">" + Math.round(need * 100) + "%</b><span>your " + fmtTarget() + " target needs, against the " + fmtClock(mPred).replace(/:\d\d$/, "") + " your " + fmtClock(best.t) + " 5k predicts</span></div></div>" +
      "<p class=\"muted chart-note\">100% means you ran exactly what your best 5k at the time predicted for that distance; under 100% is speed your endurance couldn't carry. Riegel's formula assumes your endurance is trained to match your speed. Your 5k has dropped by minutes since your last hard long effort, so the marathon is where the gap gets tested. Your 33 km, with its last 8 km at 4:15, is the best evidence you have.</p>";
    if (!rows.length) { box.innerHTML = ""; return; }
    var pts = [], x = [5, 43], ys = [];
    rows.forEach(function (r) { ys.push(r.l.sec / r.l.m * 1000, r.pred / r.l.m * 1000); });
    var fastNow = best.t / 5, slowNow = riegel(best.t, 5000, 42195) / 42.195;
    ys.push(fastNow, slowNow, mpSec());
    var lo = Math.floor((Math.min.apply(null, ys) - 5) / 15) * 15, hi = Math.ceil((Math.max.apply(null, ys) + 5) / 15) * 15, yt = [];
    for (var v = lo; v <= hi; v += 15) yt.push(v);
    /* Pace your 5k best predicts at every distance. */
    for (var km = 5; km <= 42.2; km += 0.5) pts.push([km, riegel(best.t, 5000, km * 1000) / km]);
    box.innerHTML = timeSVG({
      h: 260, x: x, y: [hi, lo], yTicks: yt.filter(function (v, i) { return i % 2 === 0; }), fy: fmtPace, label: "Pace against distance: hard long runs and what your 5k predicts",
      xTicks: [5, 10, 15, 21.1, 30, 42.2].map(function (k) { return { x: k, l: k === 21.1 ? "Half" : k === 42.2 ? "Full" : k + " km" }; }),
      lines: [{ cls: "ln ln-trend proj", pts: pts }],
      dots: rows.map(function (r) { return { x: r.l.m / 1000, y: r.l.sec / r.l.m * 1000, cls: "tue", tip: niceDate(r.l.d) + " " + r.l.d.slice(0, 4) + " · " + r.l.name + " · " + (Math.round(r.l.m / 100) / 10) + " km at " + fmtPace(r.l.sec / r.l.m * 1000) + "/km · HR " + r.l.hr + " · 5k then " + fmtClock(r.f.t) + " predicted " + fmtPace(r.pred / r.l.m * 1000) + "/km · " + Math.round(r.held * 100) + "% held" }; })
        .concat([{ x: 5, y: fastNow, cls: "sat", tip: "Best 5k " + fmtClock(best.t) + " · " + niceDate(best.d) }, { x: MARATHON_KM, y: mpSec(), cls: "key", tip: "Your target " + fmtTarget() + " · " + fmtPace(mpSec()) + "/km" }])
    }) + "<div class=\"vol-key\"><span><i class=\"sw-dot sat\"></i>Your best 5k</span><span><i class=\"sw-ln proj\"></i>What it predicts at each distance</span><span><i class=\"sw-dot\"></i>Hard runs of 8 km or more (HR 165+)</span><span><i class=\"sw-dot key\"></i>Marathon target</span></div>" +
      "<p class=\"muted chart-note\">Each long run is compared with your best 5k in the 4 months before it, not today's. Hover over a dot for the numbers.</p>";
  }

  /* How you pace a hard 5k: each km against that run's average, for runs with five full km splits. */
  function renderPacing() {
    var head = document.getElementById("fk-pace-head"), box = document.getElementById("fk-pace");
    var runs = FIVES.filter(function (f) { return f.hard && f.splits; }).map(function (f) {
      var k = f.splits.filter(function (s) { return s[0] >= 900; }).slice(0, 5);
      if (k.length < 5) return null;
      var p = k.map(function (s) { return s[1] / s[0] * 1000; }), avg = p.reduce(function (a, b) { return a + b; }, 0) / 5;
      return { f: f, dev: p.map(function (x) { return x - avg; }), p: p };
    }).filter(Boolean);
    if (runs.length < 4) { head.innerHTML = "<p class=\"muted\">Needs at least 4 hard 5ks with km splits.</p>"; box.innerHTML = ""; return; }
    function mean(list, i) { return list.reduce(function (a, r) { return a + r.dev[i]; }, 0) / list.length; }
    var avgDev = [0, 1, 2, 3, 4].map(function (i) { return mean(runs, i); });
    var byTime = runs.slice().sort(function (a, b) { return a.f.t - b.f.t; }), top = byTime.slice(0, 5), rest = byTime.slice(5);
    var spread = function (list) { return list.reduce(function (a, r) { return a + Math.max.apply(null, r.dev) - Math.min.apply(null, r.dev); }, 0) / list.length; };
    function sfx(x) { return Math.abs(Math.round(x)) + " s/km " + (x < 0 ? "faster" : "slower"); }
    head.innerHTML = "<div class=\"stats\" style=\"padding:0\">" +
      "<div class=\"stat\"><b class=\"num\">" + signed(avgDev[0]) + " s</b><span>km 1 against your average pace, " + sfx(avgDev[0]) + "</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + signed(avgDev[4]) + " s</b><span>km 5, " + sfx(avgDev[4]) + "</span></div>" +
      (rest.length ? "<div class=\"stat\"><b class=\"num\">" + Math.round(spread(top)) + " vs " + Math.round(spread(rest)) + " s</b><span>gap between your fastest and slowest km, in your 5 best runs vs the rest</span></div>" : "") + "</div>" +
      "<p class=\"muted chart-note\">Each line is one hard 5k: how many seconds per km faster (up) or slower (down) than that run's own average each km was. The thick line is your average. " +
      (avgDev[0] < -3 && avgDev[4] > 3 ? "You tend to go out fast and pay for it at the end. Even pacing is usually the quicker way round, and the same habit costs far more over 42 km." : "Your pacing is fairly even, which is what you want to carry into the marathon.") + " " + runs.length + " runs.</p>";
    var all = []; runs.forEach(function (r) { all = all.concat(r.dev); });
    var m = Math.ceil(Math.max(10, Math.max.apply(null, all.map(Math.abs))) / 5) * 5, yt = [];
    for (var v = -m; v <= m; v += m > 20 ? 10 : 5) yt.push(v);
    var last = runs[runs.length - 1];
    box.innerHTML = timeSVG({
      w: 520, h: 260, x: [0.7, 5.3], y: [m, -m], yTicks: yt, fy: function (y) { return y ? signed(y) + " s" : "avg"; }, zero: true, label: "Each km of every hard 5k against that run's average pace",
      xTicks: [1, 2, 3, 4, 5].map(function (k) { return { x: k, l: "km " + k }; }),
      lines: runs.map(function (r) { return { cls: "ln ln-faint", pts: r.dev.map(function (d, i) { return [i + 1, d]; }) }; })
        .concat([{ cls: "ln ln-last", pts: last.dev.map(function (d, i) { return [i + 1, d]; }) }, { cls: "ln ln-avg", pts: avgDev.map(function (d, i) { return [i + 1, d]; }) }]),
      dots: last.dev.map(function (d, i) { return { x: i + 1, y: d, cls: "sat", tip: niceDate(last.f.d) + " · km " + (i + 1) + " at " + fmtPace(last.p[i]) + "/km · " + signed(d) + " s against the run's average" }; })
    }) + "<div class=\"vol-key\"><span><i class=\"sw-ln avg\"></i>Average of all</span><span><i class=\"sw-ln last\"></i>Latest: " + esc(niceDate(last.f.d)) + "</span><span><i class=\"sw-ln faint\"></i>Each hard 5k</span></div>";
  }

  /* Heat: how far each raced Tuesday sat above or below the trend, against the temperature at the start
     (Open-Meteo weather archive). Taking the trend out stops a season of getting fitter looking like weather. */
  function renderHeat(tr) {
    var head = document.getElementById("fk-heat-head"), box = document.getElementById("fk-heat");
    var pts = tr ? tr.pts.filter(function (f) { return typeof f.temp === "number"; }).map(function (f) { return { f: f, r: f.t - tr.fit.at(dayNum(f.d)) }; }) : [];
    if (pts.length < 5) { head.innerHTML = "<p class=\"muted\">Needs at least 5 raced Tuesdays with weather.</p>"; box.innerHTML = ""; return; }
    var fit = fitLine(pts.map(function (p) { return [p.f.temp, p.r]; }));
    var temps = pts.map(function (p) { return p.f.temp; }), t0 = Math.floor(Math.min.apply(null, temps)) - 1, t1 = Math.ceil(Math.max.apply(null, temps)) + 1;
    var per5 = fit.b * 5;
    /* Under R² 0.2 the slope is mostly noise, so don't headline a number. */
    var clear = fit.r2 >= 0.2, range = Math.round(t0 + 1) + " and " + Math.round(t1 - 1) + "°C";
    head.innerHTML = "<div class=\"stats\" style=\"padding:0\"><div class=\"stat\"><b class=\"num\">" + (clear ? signed(per5) + " s" : "No clear link") + "</b><span>" + (clear ? "on a 5k for every 5°C warmer, between " + range : "between start temperature and your raced Tuesday times, between " + range) + "</span></div></div>" +
      "<p class=\"muted chart-note\">Dots above the line were faster than your trend for that date. " + pts.length + " runs over a narrow range of cool evenings (R² " + fit.r2.toFixed(2) + ")" + (clear ? ", so treat it as a hint, not a rule." : ": temperature explains almost none of the spread, so day-to-day form matters more at these temperatures.") + " Heat matters far more over 42 km than 5 km, so if race morning is warm, start a little slower.</p>";
    var rs = pts.map(function (p) { return Math.abs(p.r); }), m = Math.ceil((Math.max.apply(null, rs) + 5) / 10) * 10, yt = [];
    for (var v = -m; v <= m; v += m > 30 ? 20 : 10) yt.push(v);
    var xt = []; for (var t = Math.ceil(t0 / 2) * 2; t <= t1; t += 2) xt.push({ x: t, l: t + "°C" });
    box.innerHTML = timeSVG({
      w: 520, h: 240, x: [t0, t1], y: [m, -m], yTicks: yt, fy: function (y) { return y ? signed(y) + " s" : "trend"; }, zero: true, xTicks: xt, label: "Seconds faster or slower than trend against start temperature",
      lines: [{ cls: "ln ln-trend", pts: [[t0, fit.at(t0)], [t1, fit.at(t1)]] }],
      dots: pts.map(function (p) { return { x: p.f.temp, y: p.r, cls: "tue", tip: niceDate(p.f.d) + " · " + p.f.temp.toFixed(1) + "°C · " + fmtClock(p.f.t) + " · " + Math.abs(Math.round(p.r)) + " s " + (p.r < 0 ? "faster" : "slower") + " than trend" }; })
    });
  }

  /* Which Tuesdays and Saturdays you turned up, week by week, and your current run of Tuesdays. */
  function renderStreak() {
    var head = document.getElementById("fk-streak-head"), box = document.getElementById("fk-streak");
    var byDate = {}; FIVES.forEach(function (f) { byDate[f.d] = f; });
    var firstTue = FIVES.filter(function (f) { return f.tue && f.hard; })[0];
    if (!firstTue) { head.innerHTML = ""; box.innerHTML = ""; return; }
    /* Weeks run Monday to Sunday, from the week of your first hard Tuesday to this one. */
    function monday(iso) { var d = dateObj(iso).getDay(); return addDays(iso, -((d + 6) % 7)); }
    var weeks = [];
    for (var w = monday(firstTue.d); w <= today; w = addDays(w, 7)) weeks.push(w);
    var tueDone = weeks.map(function (w) { var t = addDays(w, 1); return t > today ? null : !!byDate[t]; });
    var streak = 0;
    for (var i = tueDone.length - 1; i >= 0; i--) { if (tueDone[i] === null) continue; if (!tueDone[i]) break; streak++; }
    var longest = 0, run = 0;
    tueDone.forEach(function (x) { if (x) { run++; longest = Math.max(longest, run); } else if (x === false) run = 0; });
    var nTue = tueDone.filter(Boolean).length, nPast = tueDone.filter(function (x) { return x !== null; }).length;
    var nSat = weeks.filter(function (w) { return byDate[addDays(w, 5)]; }).length;
    head.innerHTML = "<div class=\"stats\" style=\"padding:0\">" +
      "<div class=\"stat\"><b class=\"num\">" + streak + "</b><span>" + (streak === 1 ? "Tuesday" : "Tuesdays") + " in a row" + (longest > streak ? ", longest " + longest : "") + "</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + nTue + " of " + nPast + "</b><span>Tuesdays since " + niceDate(firstTue.d) + "</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + nSat + "</b><span>Saturday parkruns in that time</span></div></div>";
    var CW = 18, GAP = 3, L = 34, T = 18, W = L + weeks.length * (CW + GAP) + 4, H = T + 2 * (CW + GAP) + 18, g = "";
    ["Tue", "Sat"].forEach(function (lab, r) { g += "<text class=\"sc-ax\" x=\"" + (L - 6) + "\" y=\"" + (T + r * (CW + GAP) + 13) + "\" text-anchor=\"end\">" + lab + "</text>"; });
    weeks.forEach(function (wk, c) {
      var x = L + c * (CW + GAP);
      if (dateObj(wk).getDate() <= 7) g += "<text class=\"sc-ax\" x=\"" + x + "\" y=\"" + (T - 6) + "\">" + MON[dateObj(wk).getMonth()] + "</text>";
      [1, 5].forEach(function (off, r) {
        var d = addDays(wk, off), f = byDate[d], y = T + r * (CW + GAP);
        var cls = d > today ? "gc-future" : !f ? "gc-none" : (off === 1 ? "gc-tue" : "gc-sat") + (f.hard ? "" : " gc-easy");
        var tip = niceDate(d) + (f ? " · " + f.name + " · " + fmtClock(f.t) + (f.hard ? "" : " (jogged)") : d > today ? " · still to come" : " · no 5k");
        g += "<rect class=\"gc " + cls + "\" x=\"" + x + "\" y=\"" + y + "\" width=\"" + CW + "\" height=\"" + CW + "\" rx=\"4\" data-tip=\"" + esc(tip) + "\"></rect>";
      });
    });
    box.innerHTML = "<div class=\"grid-scroll\"><svg class=\"scatter gc-svg\" viewBox=\"0 0 " + W + " " + H + "\" style=\"min-width:" + W + "px\" role=\"img\" aria-label=\"Tuesday and Saturday 5ks by week\">" + g + "</svg></div>" +
      "<div class=\"vol-key\"><span><i class=\"sw-gc gc-tue\"></i>Tuesday, run hard</span><span><i class=\"sw-gc gc-sat\"></i>Saturday, run hard</span><span><i class=\"sw-gc gc-tue gc-easy\"></i>Jogged</span><span><i class=\"sw-gc gc-none\"></i>No 5k</span></div>";
    var sc = box.querySelector && box.querySelector(".grid-scroll");
    if (sc) sc.scrollLeft = sc.scrollWidth;
  }

  /* ---------- long-run fade ---------- */
  /* How each long run finished: pace, HR and distance per heartbeat over the last 5 km against km 2–10.
     Your planned fast finishes speed up on purpose, so efficiency is the fairer measure of fade. */
  function renderFade() {
    var el = document.getElementById("fade");
    var runs = LONGS.filter(function (l) { return l.splits && l.m >= 18000 && l.sec / l.m * 1000 < 420; }).map(function (l) {
      var k = l.splits.filter(function (s) { return s[0] >= 900 && s[2]; });
      if (k.length < 16) return null;
      function part(list) {
        var m = 0, t = 0, b = 0;
        list.forEach(function (s) { m += s[0]; t += s[1]; b += s[2] * s[1] / 60; });
        return { pace: t / m * 1000, hr: b / (t / 60), eff: m / b };
      }
      var early = part(k.slice(1, 10)), late = part(k.slice(-5));
      return { l: l, early: early, late: late, eff: (late.eff / early.eff - 1) * 100, k: k };
    }).filter(Boolean);
    if (!runs.length) { el.innerHTML = "<p class=\"muted\" style=\"padding:16px 18px;margin:0\">No long runs with heart rate yet.</p>"; return; }
    var MAX = 15;
    var rowsH = runs.map(function (o) {
      var e = o.eff, g = e > -3 ? ["ok", "Held"] : e > -8 ? ["meh", "Some fade"] : ["off", "Faded"];
      var dp = o.late.pace - o.early.pace, dh = o.late.hr - o.early.hr;
      var w = Math.min(Math.abs(e), MAX) / MAX * 50;
      return "<div class=\"drift-row fade-row\" title=\"" + esc(o.l.name) + "\"><span><b>" + niceDate(o.l.d) + " · " + (Math.round(o.l.m / 100) / 10) + " km</b><br><span class=\"muted\" style=\"font-size:12px\">last 5 km " + fmtPace(o.late.pace) + " (" + signed(dp) + " s), HR " + Math.round(o.late.hr) + " (" + signed(dh) + ")</span></span>" +
        "<div class=\"vol-track\"><div class=\"drift-bar fade " + g[0] + "\" style=\"" + (e < 0 ? "right:50%" : "left:50%") + ";width:" + w.toFixed(1) + "%\"></div><div class=\"vol-mark\" style=\"left:50%\"></div></div>" +
        "<span class=\"num\" style=\"text-align:right\"><b>" + (e < 0 ? "−" : "+") + Math.abs(e).toFixed(1) + "%</b><br><span class=\"pill " + g[0] + "\">" + g[1] + "</span></span></div>";
    }).join("");
    /* Distance per heartbeat for each km, latest run highlighted. */
    var all = []; runs.forEach(function (o) { o.k.forEach(function (s) { all.push(s[0] / (s[2] * s[1] / 60)); }); });
    var lo = Math.floor(Math.min.apply(null, all) * 20) / 20, hi = Math.ceil(Math.max.apply(null, all) * 20) / 20, yt = [];
    for (var v = lo; v <= hi + 1e-9; v += 0.1) yt.push(Math.round(v * 100) / 100);
    var maxKm = Math.max.apply(null, runs.map(function (o) { return o.k.length; })), last = runs[runs.length - 1];
    function line(o) { var km = 0; return o.k.map(function (s) { km += s[0] / 1000; return [km, s[0] / (s[2] * s[1] / 60)]; }); }
    var xt = []; for (var k = 5; k <= maxKm; k += 5) xt.push({ x: k, l: k + " km" });
    var chart = timeSVG({
      h: 220, x: [0, maxKm + 1], y: [lo, hi], yTicks: yt, fy: function (y) { return y.toFixed(1) + " m"; }, xTicks: xt, label: "Metres per heartbeat for each km of every long run",
      lines: runs.map(function (o) { return { cls: "ln " + (o === last ? "ln-fit" : "ln-faint"), pts: line(o) }; }),
      dots: line(last).map(function (p, i) { var s = last.k[i]; return { x: p[0], y: p[1], cls: "", tip: niceDate(last.l.d) + " · km " + (i + 1) + " · " + fmtPace(s[1] / s[0] * 1000) + "/km · HR " + s[2] + " · " + p[1].toFixed(2) + " m per beat" }; })
    });
    el.innerHTML = rowsH + "<div class=\"fade-chart\">" + chart + "<div class=\"vol-key\"><span><i class=\"sw-ln fit\"></i>Latest: " + esc(niceDate(last.l.d)) + "</span><span><i class=\"sw-ln faint\"></i>Earlier long runs</span></div></div>" +
      "<p class=\"vol-legend\">Last 5 km against km 2–10: pace and HR change in brackets, and the bar shows the change in distance per heartbeat. Holding it while you speed up, as in your fast-finish runs, is a good sign for km 35–42. Hills, heat and gels all move it around. Runs of 18 km or more since 2025, trail runs left out.</p>";
  }

  /* One floating tip for every chart dot. */
  (function () {
    var tip = document.getElementById("chart-tip");
    document.addEventListener("pointerover", function (e) {
      var t = e.target.closest && e.target.closest("[data-tip]");
      if (!t || !tip) return;
      tip.textContent = t.getAttribute("data-tip");
      tip.hidden = false;
      var r = t.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2)) + "px";
      tip.style.top = (r.top - tip.offsetHeight - 6) + "px";
    });
    document.addEventListener("pointerout", function (e) { if (e.target.closest && e.target.closest("[data-tip]") && tip) tip.hidden = true; });
    window.addEventListener("scroll", function () { if (tip) tip.hidden = true; }, { passive: true });
  })();

  /* ---------- plan ---------- */
  function renderWeekPick() {
    var cw = currentWeekIndex();
    document.getElementById("week-pick").innerHTML = P.WEEKS.map(function (w, i) {
      return "<button type=\"button\" class=\"wk-btn\" data-week=\"" + i + "\" aria-pressed=\"" + (i === ui.week) + "\"><b>Week " + w.n + "</b><span>" + esc(w.range) + "</span>" + (i === cw ? "<span class=\"now\">This week</span>" : "") + "</button>";
    }).join("");
    document.getElementById("wk-prev").disabled = ui.week === 0;
    document.getElementById("wk-next").disabled = ui.week === P.WEEKS.length - 1;
  }
  function renderWeek() {
    var w = P.WEEKS[ui.week], km = weekKm(w);
    var h = "";
    if (w.decBefore) h += decisionHTML(w.decBefore, true);
    h += "<div class=\"sec-head\"><h2>Week " + w.n + " <span class=\"eyebrow\" style=\"font-family:var(--body)\">" + esc(w.range) + "</span></h2><span class=\"focus\">" + esc(w.focus) + "</span><span class=\"week-km num\">" + (Math.round(km * 10) / 10) + " km <small>planned</small></span></div>";
    h += "<div class=\"card days\">" + weekDays(w).map(dayRowHTML).join("") + "</div>";
    if (w.decAfter) h += decisionHTML(w.decAfter, true);
    document.getElementById("week-view").innerHTML = h;
  }

  /* ---------- decisions + checkers ---------- */
  function field(id, label, key, type, extra) {
    return "<div class=\"field\"><label for=\"" + id + "\">" + esc(label) + "</label><input type=\"" + type + "\" id=\"" + id + "\" data-inp=\"" + key + "\" value=\"" + esc(inp[key]) + "\"" + (extra || "") + "></div>";
  }
  function selectField(id, label, key, options) {
    return "<div class=\"field\"><label for=\"" + id + "\">" + esc(label) + "</label><select id=\"" + id + "\" data-inp=\"" + key + "\">" +
      options.map(function (o) { return "<option value=\"" + o[0] + "\"" + (inp[key] === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div>";
  }
  function renderDecisions() {
    var h = decisionHTML("d0", false);
    h += decisionHTML("d1", false);
    if (st.d0 === "A") {
      h += "<div class=\"checker\"><h4>Test 1 checker · 33 km on Sat 10 Oct</h4><div class=\"fields\">" +
        field("c1-pace", "Avg pace, last 8 km (m:ss)", "c1pace", "text", " inputmode=\"numeric\" placeholder=\"4:15\"") +
        field("c1-hr", "Avg HR, last 8 km", "c1hr", "number", " min=\"100\" max=\"210\"") +
        selectField("c1-slow", "Final 2–3 km slower?", "c1slow", [["no", "No"], ["yes", "Yes, I slowed"]]) +
        "</div>" + stravaFillHTML("c1") + "<div id=\"c1-out\"></div></div>";
    }
    h += decisionHTML("d2", false);
    var a1 = l2() === "A1";
    h += "<div class=\"checker\"><h4>" + (a1 ? "Test 2 checker · half at 4:15" : "Pace test checker · half at 4:30") + " · Sun 18 Oct</h4><div class=\"fields\">" +
      field("c2-pace", a1 ? "Avg pace, first 16 km" : "Avg pace, first 14 km", "c2pace", "text", " inputmode=\"numeric\" placeholder=\"" + (a1 ? "4:15" : "4:30") + "\"") +
      field("c2-hr", a1 ? "Avg HR, first 16 km" : "Avg HR, first 14 km", "c2hr", "number", " min=\"100\" max=\"210\"") +
      selectField("c2-feel", "Could you have kept going at that pace?", "c2feel", [["easy", "Yes, comfortably"], ["just", "Just about"], ["no", "No, I was hanging on"]]) +
      "</div>" + stravaFillHTML("c2") + "<div id=\"c2-out\"></div></div>";
    document.getElementById("decision-list").innerHTML = h;
    updateCheckers();
  }
  /* Test numbers worked out from the Strava run on the test day.
     Test 1: last 8 km, and a slowdown if the last 2 km were more than 5 s/km slower than the 6 km before.
     Test 2: the first 16 km (or 14 km on the 4:30 test). How it felt stays yours to pick. */
  function testValues(key) {
    var run = testRun(key === "c1" ? "2026-10-10" : "2026-10-18");
    if (!run || !run.splits.length) return null;
    var total = splitsTotal(run);
    if (key === "c1") {
      if (total < 8000) return null;
      var last8 = segment(run, total - 8000, total), last2 = segment(run, total - 2000, total), mid = segment(run, total - 8000, total - 2000);
      if (!last8.hr) return null;
      var slow = last2.pace - mid.pace > 5;
      return { fill: { c1pace: fmtPace(last8.pace), c1hr: String(last8.hr), c1slow: slow ? "yes" : "no" },
        text: "last 8 km at " + fmtPace(last8.pace) + "/km, HR " + last8.hr + ", last 2 km at " + fmtPace(last2.pace) + "/km" };
    }
    var n = l2() === "A1" ? 16 : 14;
    if (total < n * 1000) return null;
    var first = segment(run, 0, n * 1000);
    if (!first.hr) return null;
    return { fill: { c2pace: fmtPace(first.pace), c2hr: String(first.hr) },
      text: "first " + n + " km at " + fmtPace(first.pace) + "/km, HR " + first.hr + ". Pick how it felt yourself" };
  }
  function stravaFillHTML(key) {
    var tv = testValues(key);
    if (!tv) return "";
    return "<div class=\"strava-fill\"><span class=\"muted\">From Strava: " + esc(tv.text) + ".</span><button type=\"button\" class=\"link-btn\" data-strava=\"" + key + "\">Fill in from Strava</button></div>";
  }
  function verdictHTML(cls, title, reasons, dec, val) {
    var already = st[dec] === val;
    return "<div class=\"verdict " + cls + "\"><b>" + esc(title) + "</b><ul>" + reasons.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>" +
      "<button type=\"button\" class=\"use-btn\" data-dec=\"" + dec + "\" data-val=\"" + val + "\"" + (already ? " disabled" : "") + ">" + (already ? "Already planning for this" : "Use this result") + "</button></div>";
  }
  function updateCheckers() {
    var o1 = document.getElementById("c1-out");
    if (o1) {
      var p = parsePace(inp.c1pace), hr = parseInt(inp.c1hr, 10);
      if (isNaN(p) || isNaN(hr)) o1.innerHTML = "<p class=\"muted\">Enter your pace as m:ss (for example 4:16) and your average HR.</p>";
      else {
        var r = [], okP = p <= 257, okH = hr <= 170, okS = inp.c1slow === "no";
        r.push(okP ? "Pace " + fmtPace(p) + "/km is on sub-3 pace." : "Pace " + fmtPace(p) + "/km is slower than 4:17/km.");
        r.push(okH ? "HR " + hr + " is at or below 170." : "HR " + hr + " is above 170, so this pace is costing a lot.");
        r.push(okS ? "No slowdown at the end." : "You slowed at the end, which is the key warning sign.");
        o1.innerHTML = okP && okH && okS ? verdictHTML("good", "Held it. Run the half at 4:15.", r, "d1", "pass")
          : verdictHTML(okP && okS ? "warn" : "bad", "Not yet. Run the half as the 4:30 test.", r, "d1", "fail");
      }
    }
    var o2 = document.getElementById("c2-out");
    if (o2) {
      var p2 = parsePace(inp.c2pace), hr2 = parseInt(inp.c2hr, 10), feel = inp.c2feel;
      if (isNaN(p2) || isNaN(hr2)) { o2.innerHTML = "<p class=\"muted\">Enter your pace as m:ss and your average HR.</p>"; return; }
      var r2 = [], pick, cls;
      var feelText = { easy: "You could have kept going comfortably.", just: "You could just about have kept going.", no: "You were hanging on by the end." }[feel] || "";
      if (l2() === "A1") {
        r2.push("First 16 km at " + fmtPace(p2) + "/km with HR " + hr2 + ".");
        r2.push(feelText);
        if (p2 <= 257 && hr2 <= 172 && feel === "easy") { pick = "259"; cls = "good"; }
        else if (p2 <= 262 && feel !== "no") { pick = "305"; cls = "warn"; }
        else { pick = "310"; cls = "bad"; }
      } else {
        r2.push("First 14 km at " + fmtPace(p2) + "/km with HR " + hr2 + ".");
        r2.push(feelText);
        if (p2 <= 272 && hr2 <= 165 && feel === "easy") { pick = "305"; cls = "good"; }
        else if (p2 <= 275 && hr2 <= 170 && feel !== "no") { pick = "310"; cls = "good"; }
        else { pick = "315"; cls = "warn"; }
      }
      var label = { "259": "Sub-3 at 4:15/km", "305": "3:05 at 4:23/km", "310": "3:10 at 4:30/km", "315": "3:15 at 4:37/km" }[pick];
      o2.innerHTML = verdictHTML(cls, "Suggested target: " + label + ".", r2, "d2", pick);
    }
  }

  /* ---------- fuel ---------- */
  function gelPlan() {
    var mp = mpSec(), dur = targetSec();
    var gel = clampNum(inp.gel, 10, 50, 26), gph = clampNum(inp.gph, 50, 90, 70);
    var interval = gel / gph * 3600, list = [], seen = {};
    for (var t = interval; t <= dur - 900; t += interval) {
      var km = Math.round(t / mp * 2) / 2;
      if (seen[km]) continue;
      seen[km] = true;
      list.push({ km: km, clock: km * mp });
    }
    return { gel: gel, gph: gph, interval: interval, list: list };
  }
  function renderFuel() {
    var g = gelPlan(), mp = mpSec();
    document.getElementById("f-gph-out").textContent = g.gph;
    var total = g.list.length + 1;
    var stats = [
      [total + 1, "gels to carry, including a spare"],
      ["every " + Math.round(g.interval / 60) + " min", "about every " + (Math.round(g.interval / mp * 2) / 2) + " km"],
      [total * g.gel + " g", "carbs from gels over the race"],
      [Math.round(kg() * 8) + "–" + Math.round(kg() * 10) + " g", "carb load per day, Fri and Sat"]
    ];
    document.getElementById("fuel-stats").innerHTML = stats.map(function (s) { return "<div class=\"stat\"><b class=\"num\">" + esc(s[0]) + "</b><span>" + esc(s[1]) + "</span></div>"; }).join("");

    var rows = "<tr><td>Gel 1</td><td>10–15 min before the start</td><td class=\"r\">before</td></tr>";
    g.list.forEach(function (x, i) {
      rows += "<tr><td>Gel " + (i + 2) + (x.km >= 18 ? " <span class=\"caf\">caffeine</span>" : "") + "</td><td>km " + x.km + "</td><td class=\"r\">" + fmtClock(plannedClock(x.km)) + "</td></tr>";
    });
    rows += "<tr><td>Spare</td><td>Only if you feel flat late on</td><td class=\"r\">–</td></tr>";
    document.getElementById("gel-table").innerHTML = rows;

    document.getElementById("carb-load").innerHTML = "<b style=\"color:var(--fg)\">About " + Math.round(kg() * 8) + "–" + Math.round(kg() * 10) + " g of carbs each day</b> (8–10 g per kg at " + kg() + " kg).";
    document.getElementById("breakfast").innerHTML = "<b style=\"color:var(--fg)\">About " + Math.round(kg() * 2) + " g of carbs, 3 hours before the start</b> (about 2 g per kg).";
    document.getElementById("recipes").innerHTML = Object.keys(P.MEALS).map(function (k) {
      var m = P.MEALS[k];
      return "<section class=\"card pad recipe\"><h3>" + esc(m.name) + "</h3><p class=\"muted\">" + esc(m.carbs) + " of carbs" + (m.time ? " · " + esc(m.time) : "") + "</p>" +
        "<ul>" + m.items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
        "<ol>" + m.steps.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol></section>";
    }).join("");
    document.getElementById("train-fuel").innerHTML = P.TRAIN_FUEL.map(function (r) { return "<tr><td><b>" + esc(r[0]) + "</b></td><td class=\"muted\">" + esc(r[1]) + "</td></tr>"; }).join("");
  }

  /* ---------- race ---------- */
  function renderRace() {
    var mp = mpSec();
    var pts = [[5, "5 km"], [10, "10 km"], [15, "15 km"], [20, "20 km"], [21.0975, "Halfway · check 1"], [25, "25 km"], [30, "30 km · check 2"], [35, "35 km"], [40, "40 km"], [42.195, "Finish"]];
    document.getElementById("splits").innerHTML = pts.map(function (p, i) {
      var hl = p[1].indexOf("check") >= 0 || p[1] === "Finish";
      var prevKm = i === 0 ? 0 : pts[i - 1][0];
      var seg = (plannedClock(p[0]) - plannedClock(prevKm)) / (p[0] - prevKm);
      return "<tr" + (hl ? " class=\"hl\"" : "") + "><td>" + p[1] + "</td><td>" + fmtPace(seg) + "/km</td><td class=\"r\">" + fmtClock(plannedClock(p[0])) + "</td></tr>";
    }).join("");
    var cards = [
      ["Check 1 · Halfway", "<b>Planned clock: {half}.</b> That's about 25 s behind even pace, because the North Shore hills and the bridge are in the first half. If you're within 30 s of it, HR is under 172 and your breathing feels controlled, hold {mp}/km. If HR is over 175 or the pace feels forced, ease back to {mp+10}/km now. That still finishes around {bail}, and slowing a little here is far better than a big slowdown after 32 km."],
      ["Check 2 · 30 km", "<b>Planned clock: {c30}.</b> If you feel strong, run 5–10 s/km faster. That finishes around {fast}. If you're hanging on, hold your pace or ease off slightly, and run by effort, not the watch."],
      ["Harbour Bridge", "Let the climb cost you 10–20 s/km and keep your effort level. Don't try to win the time back on the way down. Gain it back over the next few flat kilometres instead."],
      ["First 5 km", "It will feel too easy. Stay on {mp}/km anyway. Every 10 seconds you bank early costs you more than that after 30 km."]
    ];
    document.getElementById("race-notes").innerHTML = cards.map(function (c) { return "<section class=\"card\"><h3>" + esc(c[0]) + "</h3><p>" + fill(c[1]) + "</p></section>"; }).join("");
    renderCheckpoint();
    renderTimeline();
  }
  function renderCheckpoint() {
    var out = document.getElementById("cp-out"), mp = mpSec(), T = targetSec();
    var km = parseFloat(inp.cpkm), t = parseClock(inp.cpt);
    if (isNaN(km) || isNaN(t) || t <= 0) { out.innerHTML = "<p class=\"muted\">Enter your clock as h:mm:ss, for example 1:30:10.</p>"; return; }
    var planned = plannedClock(km), diff = t - planned, avg = t / km, projected = avg * MARATHON_KM;
    var left = MARATHON_KM - km, needed = (T - t) / left;
    var stats = "<div class=\"stats\">" +
      "<div class=\"stat\"><b class=\"num\">" + fmtClock(planned) + "</b><span>planned clock here</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + fmtClock(Math.abs(diff)) + "</b><span>" + (diff <= 0 ? "ahead of plan" : "behind plan") + "</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + fmtClock(projected) + "</b><span>finish at your average so far (" + fmtPace(avg) + "/km)</span></div>" +
      "<div class=\"stat\"><b class=\"num\">" + (needed > 0 ? fmtPace(needed) + "/km" : "–") + "</b><span>needed from here for " + fmtTarget() + "</span></div></div>";
    var cls, msg;
    if (diff < -60) { cls = "warn"; msg = "You're more than a minute ahead. Ease back to " + fmtPace(mp) + "/km. Time banked early usually costs more later."; }
    else if (diff <= 30) { cls = "good"; msg = "On plan. Hold " + fmtPace(mp) + "/km and follow your gel schedule."; }
    else if (needed >= mp - 5) { cls = "warn"; msg = "Slightly behind. Don't chase it all at once. Lift by a few seconds per km over the next 5 km."; }
    else {
      var steady = t + left * (mp + 8);
      cls = "bad"; msg = "The target is slipping. You'd need " + fmtPace(needed) + "/km, which is " + Math.round(mp - needed) + " s/km faster than plan. Let it go, run " + fmtPace(mp + 5) + "–" + fmtPace(mp + 10) + "/km and finish strong. That brings you home around " + fmtClock(steady) + ".";
    }
    out.innerHTML = stats + "<div class=\"verdict " + cls + "\" style=\"margin-top:10px\"><b>" + esc(msg) + "</b></div>";
  }
  function renderTimeline() {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(inp.start));
    var startMin = m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 360;
    var items = [
      [-195, "Wake up", "Toilet, then straight to breakfast."],
      [-180, "Breakfast", "About " + Math.round(kg() * 2) + " g of carbs you've tested, plus about 500 ml of water or electrolyte drink."],
      [-120, "Travel to the start", "Allow plenty of time to get to Devonport. Check the official transport info."],
      [-60, "Arrive", "First toilet stop, then find bag drop."],
      [-40, "Bag drop", "Race kit on, gels in your pockets or belt, watch set up."],
      [-25, "Last toilet stop", "Stop drinking after this, apart from small sips."],
      [-20, "Warm up", "5–10 min very easy jog and 3 relaxed strides."],
      [-15, "Gel 1", "With a few mouthfuls of water."],
      [-10, "Into your start area", "Settle in near your pace group."],
      [0, "Start", "First 5 km at " + fmtPace(mpSec()) + "/km. No faster."]
    ];
    document.getElementById("timeline").innerHTML = timelineHTML(items, startMin);
  }
  /* Race-morning rows: [minutes before the start, title, note]. */
  function timelineHTML(items, startMin) {
    function hhmm(x) { x = ((x % 1440) + 1440) % 1440; var h = Math.floor(x / 60), mm = x % 60; return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); }
    return items.map(function (it) {
      var rel = it[0] === 0 ? "gun" : "−" + (Math.floor(-it[0] / 60) ? Math.floor(-it[0] / 60) + " h " : "") + ((-it[0]) % 60 ? ((-it[0]) % 60) + " min" : "");
      return "<div class=\"tl-row" + (it[0] === 0 ? " go" : "") + "\"><b class=\"num\">" + hhmm(startMin + it[0]) + "</b><span class=\"rel\">" + rel.trim() + "</span><span><strong>" + esc(it[1]) + "</strong><br><span class=\"muted\" style=\"font-size:13px\">" + esc(it[2]) + "</span></span></div>";
    }).join("");
  }

  /* ---------- course tab ---------- */
  var CH = { W: 900, H: 300, X0: 56, X1: 846, Y0: 26, Y1: 262, EMAX: 60, small: false };
  var narrowMQ = window.matchMedia ? window.matchMedia("(max-width: 760px)") : null;
  function setChartSize() {
    var small = !!(narrowMQ && narrowMQ.matches);
    /* A narrower viewBox on phones keeps the chart at full width with readable labels. */
    if (small) { CH.W = 560; CH.H = 360; CH.X0 = 44; CH.X1 = 486; CH.Y0 = 34; CH.Y1 = 312; }
    else { CH.W = 900; CH.H = 300; CH.X0 = 56; CH.X1 = 846; CH.Y0 = 26; CH.Y1 = 262; }
    CH.small = small;
    document.getElementById("profile").setAttribute("viewBox", "0 0 " + CH.W + " " + CH.H);
  }
  function cx(km) { return CH.X0 + km / MARATHON_KM * (CH.X1 - CH.X0); }
  function ceY(e) { return CH.Y1 - Math.max(0, e) / CH.EMAX * (CH.Y1 - CH.Y0); }
  var paceRange = { min: 240, max: 270 };
  function cpY(p) { return CH.Y1 - (p - paceRange.min) / (paceRange.max - paceRange.min) * (CH.Y1 - CH.Y0); }

  function renderProfile() {
    setChartSize();
    var plan = kmPlan(), rows = plan.rows, pts = COURSE.pts, mp = mpSec();
    var paces = rows.map(function (r) { return r.pace; });
    paceRange.min = Math.floor((Math.min.apply(null, paces) - 2) / 5) * 5;
    paceRange.max = Math.ceil((Math.max.apply(null, paces) + 2) / 5) * 5;
    var s = "";
    /* bridge band */
    s += "<rect class=\"p-bridge\" x=\"" + cx(COURSE.bridge[0]).toFixed(1) + "\" y=\"" + CH.Y0 + "\" width=\"" + (cx(COURSE.bridge[1]) - cx(COURSE.bridge[0])).toFixed(1) + "\" height=\"" + (CH.Y1 - CH.Y0) + "\"></rect>";
    /* pace gridlines + right axis */
    for (var p = paceRange.min; p <= paceRange.max; p += 5) {
      var y = cpY(p).toFixed(1);
      s += "<line class=\"p-grid\" x1=\"" + CH.X0 + "\" x2=\"" + CH.X1 + "\" y1=\"" + y + "\" y2=\"" + y + "\"></line>";
      s += "<text class=\"p-axis-r\" x=\"" + (CH.X1 + 6) + "\" y=\"" + (+y + 4) + "\">" + fmtPace(p) + "</text>";
    }
    /* left axis */
    [0, 20, 40, 60].forEach(function (e) {
      s += "<text class=\"p-axis\" x=\"" + (CH.X0 - 8) + "\" y=\"" + (ceY(e) + 4).toFixed(1) + "\" text-anchor=\"end\">" + e + "</text>";
    });
    s += "<text class=\"p-axis-t\" x=\"" + (CH.X0 - 8) + "\" y=\"" + (CH.small ? 20 : 14) + "\" text-anchor=\"end\">m</text>";
    s += "<text class=\"p-axis-t\" x=\"" + (CH.X1 + 6) + "\" y=\"" + (CH.small ? 20 : 14) + "\">" + (CH.small ? "pace" : "min/km") + "</text>";
    /* x axis */
    for (var k = 0; k <= 40; k += (CH.small ? 10 : 5)) {
      s += "<line class=\"p-grid\" x1=\"" + cx(k).toFixed(1) + "\" x2=\"" + cx(k).toFixed(1) + "\" y1=\"" + CH.Y1 + "\" y2=\"" + (CH.Y1 + 5) + "\"></line>";
      s += "<text class=\"p-axis\" x=\"" + cx(k).toFixed(1) + "\" y=\"" + (CH.Y1 + (CH.small ? 26 : 18)) + "\" text-anchor=\"middle\">" + k + (k === 0 ? " km" : "") + "</text>";
    }
    s += "<line class=\"p-grid\" x1=\"" + CH.X0 + "\" x2=\"" + CH.X1 + "\" y1=\"" + CH.Y1 + "\" y2=\"" + CH.Y1 + "\"></line>";
    /* elevation area */
    var area = "M" + cx(0).toFixed(1) + " " + CH.Y1, line = "";
    pts.forEach(function (pt, i) {
      var X = cx(pt.k).toFixed(1), Y = ceY(pt.e).toFixed(1);
      area += " L" + X + " " + Y;
      line += (i ? " L" : "M") + X + " " + Y;
    });
    area += " L" + cx(MARATHON_KM).toFixed(1) + " " + CH.Y1 + " Z";
    s += "<path class=\"p-area\" d=\"" + area + "\"></path><path class=\"p-line\" d=\"" + line + "\"></path>";
    /* markers */
    var marks = CH.small ? [[HALF_KM, "Half"], [30, "30k"], [COURSE.turn, "Turn"]] : [[HALF_KM, "Halfway"], [30, "Check 2"], [COURSE.turn, "Turnaround"]];
    var labelStep = CH.small ? 20 : 14;
    marks.forEach(function (m, i) {
      var X = cx(m[0]).toFixed(1);
      s += "<line class=\"p-mark\" x1=\"" + X + "\" x2=\"" + X + "\" y1=\"" + CH.Y0 + "\" y2=\"" + CH.Y1 + "\"></line>";
      s += "<text class=\"p-mark-l\" x=\"" + (+X + 4) + "\" y=\"" + (CH.Y0 + (CH.small ? 16 : 12) + (i === 2 ? labelStep : 0)) + "\">" + m[1] + "</text>";
    });
    s += "<text class=\"p-bridge-l\" x=\"" + (cx(COURSE.bridge[0]) + 3).toFixed(1) + "\" y=\"" + (CH.Y1 - 8) + "\">Bridge</text>";
    s += "<circle class=\"p-edot\" cx=\"" + cx(COURSE.hi.k).toFixed(1) + "\" cy=\"" + ceY(COURSE.hi.e).toFixed(1) + "\" r=\"4\"></circle>";
    s += "<text class=\"p-mark-l\" x=\"" + (cx(COURSE.hi.k) + 7).toFixed(1) + "\" y=\"" + (ceY(COURSE.hi.e) - 6).toFixed(1) + "\">" + (CH.small ? "" : "High point ") + Math.round(COURSE.hi.e) + " m</text>";
    /* average line */
    var ay = cpY(mp).toFixed(1);
    s += "<line class=\"p-avg\" x1=\"" + CH.X0 + "\" x2=\"" + CH.X1 + "\" y1=\"" + ay + "\" y2=\"" + ay + "\"></line>";
    /* pace step line */
    var d = "";
    rows.forEach(function (r, i) {
      var y1 = cpY(r.pace).toFixed(1);
      d += (i ? " V" + y1 : "M" + cx(r.km).toFixed(1) + " " + y1) + " H" + cx(r.km + r.len).toFixed(1);
    });
    s += "<path class=\"p-pace\" d=\"" + d + "\"></path>";
    /* hover layer */
    s += "<g id=\"p-hover\" style=\"display:none\"><line class=\"p-hover-line\" id=\"ph-line\" y1=\"" + CH.Y0 + "\" y2=\"" + CH.Y1 + "\"></line><circle class=\"p-edot\" id=\"ph-e\" r=\"4.5\"></circle><circle class=\"p-pdot\" id=\"ph-p\" r=\"4.5\"></circle></g>";
    document.getElementById("profile").innerHTML = s;
  }

  var MAP = null;
  /* Esri's grey canvas map tiles (no API key needed): dark grey in dark mode, light grey in light. The route is drawn
     in the same Web Mercator projection, so it sits on the streets. Offline, the route still draws on a plain card. */
  var TILE_ZOOM = 13;
  function darkTheme() {
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function worldXY(p) {
    var n = 256 * Math.pow(2, TILE_ZOOM), s = Math.sin(p.lat * Math.PI / 180);
    return [(p.lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  }
  /* Background and map tiles for a W × H map whose top-left is world pixel (ox, oy), drawn at scale sc. */
  function tileLayer(ox, oy, sc, W, H) {
    var style = darkTheme() ? "Dark_Gray_Base" : "Light_Gray_Base", tiles = "";
    for (var tx = Math.floor(ox / 256); tx * 256 < ox + W / sc; tx++) {
      for (var ty = Math.floor(oy / 256); ty * 256 < oy + H / sc; ty++) {
        tiles += "<image href=\"https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_" + style + "/MapServer/tile/" + TILE_ZOOM + "/" + ty + "/" + tx + "\" x=\"" + ((tx * 256 - ox) * sc).toFixed(1) + "\" y=\"" + ((ty * 256 - oy) * sc).toFixed(1) + "\" width=\"" + (256 * sc + 0.5).toFixed(1) + "\" height=\"" + (256 * sc + 0.5).toFixed(1) + "\"></image>";
      }
    }
    return "<rect class=\"m-bg\" width=\"" + W + "\" height=\"" + H + "\"></rect><g class=\"m-tiles\">" + tiles + "</g>";
  }
  function renderMap() {
    var pts = COURSE.pts, W = 400, H = 400, pad = 26;
    var w = pts.map(worldXY), xs = w.map(function (p) { return p[0]; }), ys = w.map(function (p) { return p[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var sc = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
    /* World pixel at the top-left of the viewBox. */
    var ox = (minX + maxX) / 2 - W / 2 / sc, oy = (minY + maxY) / 2 - H / 2 / sc;
    MAP = function (p) { var q = worldXY(p); return [(q[0] - ox) * sc, (q[1] - oy) * sc]; };
    var base = tileLayer(ox, oy, sc, W, H);
    var route = "", bridge = "";
    pts.forEach(function (p, i) {
      var xy = MAP(p);
      route += (i ? " L" : "M") + xy[0].toFixed(1) + " " + xy[1].toFixed(1);
      if (p.k >= COURSE.bridge[0] && p.k <= COURSE.bridge[1]) bridge += (bridge ? " L" : "M") + xy[0].toFixed(1) + " " + xy[1].toFixed(1);
    });
    var s = base + "<path class=\"m-halo\" d=\"" + route + "\"></path><path class=\"m-route\" d=\"" + route + "\"></path><path class=\"m-bridge\" d=\"" + bridge + "\"></path>";
    for (var k = 5; k <= 40; k += 5) {
      var near = pts.reduce(function (a, b) { return Math.abs(b.k - k) < Math.abs(a.k - k) ? b : a; });
      var xy = MAP(near);
      s += "<circle class=\"m-km\" cx=\"" + xy[0].toFixed(1) + "\" cy=\"" + xy[1].toFixed(1) + "\" r=\"8\"></circle><text class=\"m-km-l\" x=\"" + xy[0].toFixed(1) + "\" y=\"" + (xy[1] + 3.5).toFixed(1) + "\" text-anchor=\"middle\">" + k + "</text>";
    }
    [[pts[0], "Start"], [pts[pts.length - 1], "Finish"]].forEach(function (f) {
      var xy = MAP(f[0]);
      s += "<rect class=\"m-flag\" x=\"" + (xy[0] - 4).toFixed(1) + "\" y=\"" + (xy[1] - 4).toFixed(1) + "\" width=\"8\" height=\"8\"></rect><text class=\"m-flag-l\" x=\"" + (xy[0] + 8).toFixed(1) + "\" y=\"" + (xy[1] - 6).toFixed(1) + "\">" + f[1] + "</text>";
    });
    s += "<circle class=\"m-dot\" id=\"m-dot\" r=\"6\" style=\"display:none\"></circle>";
    document.getElementById("map").innerHTML = s;
  }

  function showKm(km) {
    km = Math.max(0, Math.min(MARATHON_KM - 0.001, km));
    var pts = COURSE.pts, i = Math.round(km / MARATHON_KM * (pts.length - 1));
    i = Math.max(0, Math.min(pts.length - 1, i));
    var pt = pts[i], rows = kmPlan().rows, r = rows[Math.min(rows.length - 1, Math.floor(km))];
    var X = cx(km).toFixed(1);
    document.getElementById("p-hover").style.display = "";
    var ln = document.getElementById("ph-line"); ln.setAttribute("x1", X); ln.setAttribute("x2", X);
    var e = document.getElementById("ph-e"); e.setAttribute("cx", X); e.setAttribute("cy", ceY(pt.e).toFixed(1));
    var p = document.getElementById("ph-p"); p.setAttribute("cx", X); p.setAttribute("cy", cpY(r.pace).toFixed(1));
    var xy = MAP(pt), md = document.getElementById("m-dot");
    md.style.display = ""; md.setAttribute("cx", xy[0].toFixed(1)); md.setAttribute("cy", xy[1].toFixed(1));
    var inBridge = km >= COURSE.bridge[0] && km <= COURSE.bridge[1];
    document.getElementById("prof-read").innerHTML = "<b>km " + km.toFixed(1) + "</b> · elevation " + (inBridge ? "file shows 0 m, the real bridge road climbs" : Math.round(pt.e) + " m") +
      " · km " + (r.km + 1) + " pace <b>" + fmtPace(r.pace) + "/km</b> · planned clock <b>" + fmtClock(plannedClock(km)) + "</b>";
  }
  function bindProfile() {
    var svg = document.getElementById("profile");
    function handler(ev) {
      var rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      var x = (ev.clientX - rect.left) / rect.width * CH.W;
      showKm((x - CH.X0) / (CH.X1 - CH.X0) * MARATHON_KM);
    }
    svg.addEventListener("pointermove", handler);
    svg.addEventListener("pointerdown", handler);
    if (narrowMQ) {
      var redraw = function () { renderProfile(); renderKKProfile(); };
      if (narrowMQ.addEventListener) narrowMQ.addEventListener("change", redraw);
      else if (narrowMQ.addListener) narrowMQ.addListener(redraw);
    }
  }

  function renderKmGrid() {
    var rows = kmPlan().rows, mp = mpSec(), plan = kmPlan();
    document.getElementById("kmgrid").innerHTML = rows.map(function (r, i) {
      var cls = r.pace > mp + 1.5 ? "slow" : (r.pace < mp - 1.5 ? "fast" : "");
      var label = r.len < 1 ? "Finish" : "km " + (r.km + 1);
      var hl = (r.km + 1 === 21 || r.km + 1 === 30 || r.len < 1) ? " hl" : "";
      return "<div class=\"kmc " + cls + hl + "\"><span>" + label + (r.bridge ? " · bridge" : "") + "</span><b>" + fmtPace(r.pace) + "</b><span>" + fmtClock(plan.cum[i + 1]) + "</span></div>";
    }).join("");
  }

  function renderCourseStats() {
    var stats = [
      [COURSE.fileTotal.toFixed(2) + " km", "plotted route length (official 42.2 km)"],
      [Math.round(COURSE.hi.e) + " m", "high point, near km " + COURSE.hi.k.toFixed(1)],
      ["km " + COURSE.bridge[0].toFixed(1) + "–" + COURSE.bridge[1].toFixed(1), "Harbour Bridge"],
      ["km " + COURSE.turn.toFixed(1), "Tamaki Drive turnaround"]
    ];
    document.getElementById("course-stats").innerHTML = stats.map(function (s) { return "<div class=\"stat\"><b class=\"num\">" + esc(s[0]) + "</b><span>" + esc(s[1]) + "</span></div>"; }).join("");

    var secs = [
      ["0–10", "North Shore", "Devonport, Lake Road and Takapuna. The hilliest part in the file, with the course high point near km " + COURSE.hi.k.toFixed(1) + ". On the climbs let pace drift to about {mp+6}/km, and don't go faster than {mp-7}/km on the way down.", true],
      ["10–15", "Down to the bridge", "Mostly gentle downhill towards the harbour. It's easy to run too fast here, so stay close to {mp}/km.", false],
      ["15–17", "Harbour Bridge", "A real climb and descent that the file misses. Let it cost 10–20 s and keep your effort level.", true],
      ["17–22", "City waterfront", "Wynyard Quarter and Quay Street. Flat. Settle back onto your planned pace and take your gel on schedule.", false],
      ["22–" + Math.round(COURSE.turn), "Out along Tamaki Drive", "Low and mostly flat along the water. If there's a headwind, tuck in behind other runners.", false],
      [Math.round(COURSE.turn) + "–42.2", "Back to the finish", "The same road back to the city, finishing near the Viaduct. Run this stretch by effort if the pace gets hard to hold.", false]
    ];
    document.getElementById("sections").innerHTML = secs.map(function (x) {
      return "<div class=\"sect" + (x[3] ? " hot" : "") + "\"><b class=\"km num\">km " + x[0] + "</b><div><strong>" + esc(x[1]) + "</strong><p>" + esc(fill(x[2])) + "</p></div></div>";
    }).join("");
  }

  function renderWatch() {
    var wd = clampNum(inp.watch, 42.2, 43.4, 42.8);
    document.getElementById("f-watch-out").textContent = wd.toFixed(1);
    var names = { "259": "Sub-3 (2:59:20)", "305": "3:05", "310": "3:10", "315": "3:15" };
    document.getElementById("watch-table").innerHTML = ["259", "305", "310", "315"].map(function (k) {
      var T = TARGETS[k].sec, official = T / MARATHON_KM, watch = T / wd, slow = official * wd;
      return "<tr" + (k === st.d2 ? " class=\"cur\"" : "") + "><td><b>" + names[k] + "</b></td><td>" + fmtPace(official) + "/km</td><td><b>" + fmtPace(watch) + "/km</b></td><td class=\"r\">" + fmtClock(slow) + "</td></tr>";
    }).join("");
  }

  function renderCourse() {
    renderProfile(); renderMap(); renderKmGrid(); renderCourseStats(); renderWatch();
  }

  /* ---------- Kerikeri Half ---------- */
  /* The course is your 2025 Strava GPS (js/kerikeri.js), scaled to the official 21.1 km. */
  var KK_KM = 21.0975, KK_LAST_ID = "16527046320";
  var KK_TARGETS = [
    ["4920", "1:22", "Fully recovered: the 12 Nov check was easy and goal pace felt easy on the 17th."],
    ["5100", "1:25", "Recovered and feeling normal. The plan's default."],
    ["5280", "1:28", "Recovered but a bit flat, or Auckland was a hard day."],
    ["5640", "1:34 · steady", "Not quite recovered. Run it steady and enjoy the downhill."]
  ];
  var KK = (function () {
    var C = window.KERIKERI, scale = KK_KM / C.total;
    var pts = C.pts.map(function (p) { return { k: p[0] * scale, e: p[1], lat: p[2], lon: p[3] }; });
    var hiI = 0, i;
    for (i = 1; i < pts.length; i++) if (pts[i].e > pts[hiI].e) hiI = i;
    /* The steep drop runs from the top to the first point where the road turns up again (about km 9.6). */
    var lowI = hiI;
    while (lowI < pts.length - 1 && pts[lowI + 1].e <= pts[lowI].e) lowI++;
    var perKm = [];
    for (var km = 0; km < KK_KM; km++) {
      var len = Math.min(1, KK_KM - km), g = 0, l = 0;
      for (var q = 1; q < pts.length; q++) {
        var mid = (pts[q].k + pts[q - 1].k) / 2;
        if (mid < km || mid >= km + len) continue;
        var d = pts[q].e - pts[q - 1].e;
        if (d > 0) g += d; else l -= d;
      }
      perKm.push({ km: km, len: len, gain: g, loss: l });
    }
    return { pts: pts, hi: pts[hiI], low: pts[lowI], climb: pts[hiI].e - pts[0].e, drop: pts[0].e - pts[pts.length - 1].e, perKm: perKm };
  })();
  function kkTarget() {
    var t = String(inp.kkt);
    return KK_TARGETS.some(function (x) { return x[0] === t; }) ? +t : 5100;
  }
  function kkTargetLabel() { return fmtClock(kkTarget()).replace(/:00$/, ""); }
  /* The Auckland effort rule: about 0.9 s per metre climbed and 0.5 s back per metre descended, capped at
     ±15 s/km on this steeper course, then shifted so the total hits the target. */
  function kkPlan() {
    var T = kkTarget(), base = T / KK_KM, w = 0, s = 0;
    var rows = KK.perKm.map(function (r) {
      var off = (0.9 * r.gain - 0.5 * r.loss) / r.len;
      return { km: r.km, len: r.len, gain: r.gain, loss: r.loss, off: Math.max(-15, Math.min(15, off)) };
    });
    rows.forEach(function (r) { w += r.len; s += r.off * r.len; });
    rows.forEach(function (r) { r.pace = base + r.off - s / w; });
    var cum = [0];
    rows.forEach(function (r, i) { cum[i + 1] = cum[i] + r.pace * r.len; });
    return { rows: rows, cum: cum, T: T };
  }
  function kkClock(plan, km) {
    var j = Math.max(0, Math.min(plan.rows.length - 1, Math.floor(km)));
    return plan.cum[j] + (km - j) * plan.rows[j].pace;
  }
  /* Last year's race, from the Strava history. Its km splits line up with the course km closely enough. */
  function kkLast() {
    var R = window.RESULTS || {}, list = (R.longs || []).concat(R.fives || [], R.runs || []);
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === KK_LAST_ID && list[i].splits) return list[i];
    return null;
  }

  function renderKKStats() {
    var last = kkLast(), n = daysBetween(today, KK_DATE);
    var stats = [
      [n > 1 ? n + " days" : n === 1 ? "Tomorrow" : n === 0 ? "Today" : "Done", n >= 0 ? "to go · " + daysBetween(RACE_DATE, KK_DATE) + " days after Auckland" : "Sat 21 Nov"],
      ["+" + Math.round(KK.climb) + " m", "net climb to the high point at km " + KK.hi.k.toFixed(1)],
      ["−" + Math.round(KK.drop) + " m", "net drop, start to finish"],
      [last ? fmtClock(last.sec) : "1:37:54", "your time last year" + (last && last.hr ? ", avg HR " + last.hr : "")]
    ];
    document.getElementById("kk-stats").innerHTML = stats.map(function (s) { return "<div class=\"stat\"><b class=\"num\">" + esc(s[0]) + "</b><span>" + esc(s[1]) + "</span></div>"; }).join("");
  }
  function renderKKGoals() {
    var cur = String(kkTarget());
    document.getElementById("kk-goals").innerHTML = KK_TARGETS.map(function (t) {
      var on = t[0] === cur;
      return "<button type=\"button\" class=\"opt-card\" data-kk=\"" + t[0] + "\" aria-pressed=\"" + on + "\"><b>" + esc(t[1]) + "</b><span class=\"num\">" + fmtPace(+t[0] / KK_KM) + "/km average</span><span>" + esc(t[2]) + "</span>" + (on ? "<em class=\"picked\">Planning for this</em>" : "") + "</button>";
    }).join("");
  }
  function renderKKProfile() {
    var small = !!(narrowMQ && narrowMQ.matches);
    var W = small ? 560 : 900, H = small ? 360 : 300, X0 = small ? 44 : 56, X1 = small ? 486 : 846, Y0 = small ? 34 : 26, Y1 = small ? 312 : 262, EMAX = 400;
    var plan = kkPlan(), last = kkLast();
    var lastP = last ? last.splits.map(function (s) { return s[1] / s[0] * 1000; }) : [];
    var all = plan.rows.map(function (r) { return r.pace; }).concat(lastP);
    var pmin = Math.floor((Math.min.apply(null, all) - 3) / 10) * 10, pmax = Math.ceil((Math.max.apply(null, all) + 3) / 10) * 10;
    var step = pmax - pmin > 80 ? 20 : 10;
    function x(km) { return X0 + km / KK_KM * (X1 - X0); }
    function ey(e) { return Y1 - Math.max(0, e) / EMAX * (Y1 - Y0); }
    function py(p) { return Y1 - (p - pmin) / (pmax - pmin) * (Y1 - Y0); }
    var s = "<rect class=\"p-bridge\" x=\"" + x(KK.hi.k).toFixed(1) + "\" y=\"" + Y0 + "\" width=\"" + (x(KK.low.k) - x(KK.hi.k)).toFixed(1) + "\" height=\"" + (Y1 - Y0) + "\"></rect>";
    for (var p = pmin; p <= pmax; p += step) {
      s += "<line class=\"p-grid\" x1=\"" + X0 + "\" x2=\"" + X1 + "\" y1=\"" + py(p).toFixed(1) + "\" y2=\"" + py(p).toFixed(1) + "\"></line>";
      s += "<text class=\"p-axis-r\" x=\"" + (X1 + 6) + "\" y=\"" + (py(p) + 4).toFixed(1) + "\">" + fmtPace(p) + "</text>";
    }
    [0, 100, 200, 300, 400].forEach(function (e) { s += "<text class=\"p-axis\" x=\"" + (X0 - 8) + "\" y=\"" + (ey(e) + 4).toFixed(1) + "\" text-anchor=\"end\">" + e + "</text>"; });
    s += "<text class=\"p-axis-t\" x=\"" + (X0 - 8) + "\" y=\"" + (small ? 20 : 14) + "\" text-anchor=\"end\">m</text>";
    s += "<text class=\"p-axis-t\" x=\"" + (X1 + 6) + "\" y=\"" + (small ? 20 : 14) + "\">" + (small ? "pace" : "min/km") + "</text>";
    for (var k = 0; k <= 20; k += small ? 5 : 2) {
      s += "<text class=\"p-axis\" x=\"" + x(k).toFixed(1) + "\" y=\"" + (Y1 + (small ? 26 : 18)) + "\" text-anchor=\"middle\">" + k + (k === 0 ? " km" : "") + "</text>";
    }
    s += "<line class=\"p-grid\" x1=\"" + X0 + "\" x2=\"" + X1 + "\" y1=\"" + Y1 + "\" y2=\"" + Y1 + "\"></line>";
    var area = "M" + x(0).toFixed(1) + " " + Y1, line = "";
    KK.pts.forEach(function (pt, i) {
      var X = x(pt.k).toFixed(1), Y = ey(pt.e).toFixed(1);
      area += " L" + X + " " + Y;
      line += (i ? " L" : "M") + X + " " + Y;
    });
    s += "<path class=\"p-area\" d=\"" + area + " L" + x(KK_KM).toFixed(1) + " " + Y1 + " Z\"></path><path class=\"p-line\" d=\"" + line + "\"></path>";
    s += "<text class=\"p-bridge-l\" x=\"" + (x(KK.hi.k) + 3).toFixed(1) + "\" y=\"" + (Y1 - 8) + "\">" + (small ? "Drop" : "Steep drop") + "</text>";
    s += "<circle class=\"p-edot\" cx=\"" + x(KK.hi.k).toFixed(1) + "\" cy=\"" + ey(KK.hi.e).toFixed(1) + "\" r=\"4\"></circle>";
    s += "<text class=\"p-mark-l\" x=\"" + (x(KK.hi.k) + 7).toFixed(1) + "\" y=\"" + (ey(KK.hi.e) - 6).toFixed(1) + "\">" + (small ? "" : "Top ") + Math.round(KK.hi.e) + " m</text>";
    s += "<line class=\"p-avg\" x1=\"" + X0 + "\" x2=\"" + X1 + "\" y1=\"" + py(plan.T / KK_KM).toFixed(1) + "\" y2=\"" + py(plan.T / KK_KM).toFixed(1) + "\"></line>";
    function steps(paces, lens) {
      var d = "", at = 0;
      paces.forEach(function (pc, i) { var y = py(pc).toFixed(1); d += (i ? " V" + y : "M" + x(0).toFixed(1) + " " + y) + " H" + x(Math.min(KK_KM, at + lens[i])).toFixed(1); at += lens[i]; });
      return d;
    }
    if (last) s += "<path class=\"p-last\" d=\"" + steps(lastP, last.splits.map(function (sp) { return sp[0] / 1000 * KK_KM / (splitsTotal(last) / 1000); })) + "\"></path>";
    s += "<path class=\"p-pace\" d=\"" + steps(plan.rows.map(function (r) { return r.pace; }), plan.rows.map(function (r) { return r.len; })) + "\"></path>";
    var svg = document.getElementById("kk-profile");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = s;
  }
  function renderKKSplits() {
    var plan = kkPlan(), last = kkLast();
    document.getElementById("kk-splits").innerHTML = plan.rows.map(function (r, i) {
      var sp = last && last.splits[i];
      var lp = sp ? fmtPace(sp[1] / sp[0] * 1000) + (sp[2] ? " <span class=\"muted\" style=\"font-size:12px\">" + sp[2] + "</span>" : "") : "–";
      var top = KK.hi.k >= r.km && KK.hi.k < r.km + r.len;
      var label = r.len < 1 ? "Finish" : (r.km + 1) + (top ? " · top" : "");
      return "<tr" + (r.len < 1 || top ? " class=\"hl\"" : "") + "><td>" + label + "</td><td class=\"r\">+" + Math.round(r.gain) + " / −" + Math.round(r.loss) + "</td><td class=\"r\">" + lp + "</td><td class=\"r\">" + fmtPace(r.pace) + "</td><td class=\"r\">" + fmtClock(plan.cum[i + 1]) + "</td></tr>";
    }).join("");
  }
  function renderKKMap() {
    var pts = KK.pts, W = 400, H = 400, pad = 26;
    var w = pts.map(worldXY), xs = w.map(function (p) { return p[0]; }), ys = w.map(function (p) { return p[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var sc = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
    var ox = (minX + maxX) / 2 - W / 2 / sc, oy = (minY + maxY) / 2 - H / 2 / sc;
    function at(p) { var q = worldXY(p); return [(q[0] - ox) * sc, (q[1] - oy) * sc]; }
    var route = "", drop = "";
    pts.forEach(function (p, i) {
      var xy = at(p);
      route += (i ? " L" : "M") + xy[0].toFixed(1) + " " + xy[1].toFixed(1);
      if (p.k >= KK.hi.k && p.k <= KK.low.k) drop += (drop ? " L" : "M") + xy[0].toFixed(1) + " " + xy[1].toFixed(1);
    });
    var s = tileLayer(ox, oy, sc, W, H) + "<path class=\"m-halo\" d=\"" + route + "\"></path><path class=\"m-route\" d=\"" + route + "\"></path><path class=\"m-bridge\" d=\"" + drop + "\"></path>";
    for (var k = 5; k <= 20; k += 5) {
      var near = pts.reduce(function (a, b) { return Math.abs(b.k - k) < Math.abs(a.k - k) ? b : a; }), xy = at(near);
      s += "<circle class=\"m-km\" cx=\"" + xy[0].toFixed(1) + "\" cy=\"" + xy[1].toFixed(1) + "\" r=\"8\"></circle><text class=\"m-km-l\" x=\"" + xy[0].toFixed(1) + "\" y=\"" + (xy[1] + 3.5).toFixed(1) + "\" text-anchor=\"middle\">" + k + "</text>";
    }
    [[pts[0], "Okaihau", 8], [pts[pts.length - 1], "Kerikeri", -60]].forEach(function (f) {
      var xy = at(f[0]);
      s += "<rect class=\"m-flag\" x=\"" + (xy[0] - 4).toFixed(1) + "\" y=\"" + (xy[1] - 4).toFixed(1) + "\" width=\"8\" height=\"8\"></rect><text class=\"m-flag-l\" x=\"" + (xy[0] + f[2]).toFixed(1) + "\" y=\"" + (xy[1] - 8).toFixed(1) + "\">" + f[1] + "</text>";
    });
    document.getElementById("kk-map").innerHTML = s;
  }
  function renderKKSections() {
    var plan = kkPlan(), last = kkLast();
    var b = [0, KK.hi.k, KK.low.k, 15.3, 17.5, KK_KM];
    function elev(km) { return KK.pts.reduce(function (a, p) { return Math.abs(p.k - km) < Math.abs(a.k - km) ? p : a; }).e; }
    function pace(i) { return fmtPace((kkClock(plan, b[i + 1]) - kkClock(plan, b[i])) / (b[i + 1] - b[i])); }
    function change(i) { var d = Math.round(elev(b[i + 1]) - elev(b[i])); return (d >= 0 ? "up " : "down ") + Math.abs(d) + " m"; }
    var lastClimb = last ? last.splits.slice(0, 7).map(function (sp) { return sp[1] / sp[0] * 1000; }) : null;
    var secs = [
      ["Climb out of Okaihau", "Net " + change(0) + " in three steps, steepest around km 4.5–5 and 6–7. Run by effort at about " + pace(0) + "/km and keep your breathing under control." + (lastClimb ? " Last year you ran it at " + fmtPace(Math.min.apply(null, lastClimb)) + "–" + fmtPace(Math.max.apply(null, lastClimb)) + "/km." : ""), true],
      ["The steep drop", "Net " + change(1) + ", the steepest part of the course. About " + pace(1) + "/km with quick, light steps. Braking here costs your quads for the rest of the race.", true],
      ["Rolling down", "Net " + change(2) + " with a couple of short rises. Settle on about " + pace(2) + "/km and take your gel early in this stretch.", false],
      ["The flatter stretch", "Net " + change(3) + ". It's flatter here and starts to hurt. Hold about " + pace(3) + "/km. Last year km 16 was your slowest of the second half.", true],
      ["Down into Kerikeri", "Net " + change(4) + " to the Domain. About " + pace(4) + "/km, and empty the tank over the last 3 km.", false]
    ];
    document.getElementById("kk-sections").innerHTML = secs.map(function (x, i) {
      return "<div class=\"sect" + (x[2] ? " hot" : "") + "\"><b class=\"km num\">km " + b[i].toFixed(1).replace(/\.0$/, "") + "–" + (i === secs.length - 1 ? "21.1" : b[i + 1].toFixed(1).replace(/\.0$/, "")) + "</b><div><strong>" + esc(x[0]) + "</strong><p>" + esc(x[1]) + "</p></div></div>";
    }).join("");
  }
  function renderKKTimeline() {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(inp.kkstart));
    var startMin = m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 420, plan = kkPlan();
    var items = [
      [-180, "Breakfast", "Your race breakfast, about " + Math.round(kg() * 1.5) + " g of carbs, a bit less than before Auckland. Then sip water until 30 min before."],
      [-120, "Travel to Okaihau", "It's point to point. Sort out the day before how you're getting to the start and home from the Kerikeri Domain."],
      [-60, "Arrive", "First toilet stop. Check whether there's a bag transfer to the finish."],
      [-30, "Last toilet stop", "Stop drinking after this, apart from small sips."],
      [-25, "Warm up", "10 min easy jog and 3–4 strides. The race starts on a climb, so warm up properly."],
      [-12, "Gel 1", "With a few mouthfuls of water. Gel 2 at about km 9."],
      [-5, "Into the start", "Line up for your target. Don't get dragged up the first hill."],
      [0, "Start", "First km at about " + fmtPace(plan.rows[0].pace) + "/km. Run the climb by effort."]
    ];
    document.getElementById("kk-timeline").innerHTML = timelineHTML(items, startMin);
  }
  function renderKerikeri() {
    renderKKStats(); renderKKGoals(); renderKKProfile(); renderKKSplits(); renderKKMap(); renderKKSections(); renderKKTimeline();
  }
  function renderMaps() { renderMap(); renderKKMap(); }

  /* ---------- tabs + theme ---------- */
  function selectTab(tab, focus) {
    if (TABS.indexOf(tab) < 0) tab = "overview";
    ui.tab = tab;
    store.set("akl-tab", tab);
    TABS.forEach(function (t) {
      var b = document.getElementById("tab-" + t), p = document.getElementById("p-" + t);
      var on = t === tab;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      p.hidden = !on;
    });
    try { history.replaceState(null, "", "#" + tab); } catch (e) {}
    var btn = document.getElementById("tab-" + tab), bar = btn.parentNode;
    /* Keep the active tab visible when the tab bar scrolls sideways. */
    if (bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2);
    /* Phones: tabs in the More sheet light up the More button and lend it their name. */
    var extra = btn.classList.contains("more-item"), more = document.getElementById("more-btn");
    more.classList.toggle("on", extra);
    document.getElementById("more-label").textContent = extra ? btn.textContent : "More";
    setMore(false);
    if (focus) btn.focus();
  }
  function setMore(open) {
    document.getElementById("tabs").classList.toggle("open", open);
    document.getElementById("more-btn").setAttribute("aria-expanded", String(open));
  }
  var THEMES = ["auto", "light", "dark"];
  function applyTheme(t) {
    if (THEMES.indexOf(t) < 0) t = "auto";
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    document.getElementById("theme-btn").textContent = "Theme: " + t;
    store.set("akl-theme", t);
  }

  /* ---------- render ---------- */
  function renderAll() {
    renderHeader(); renderTree(); renderToday(); renderVolume(); renderDrift(); renderFade(); renderDates(); renderCalRoute();
    renderWeekPick(); renderWeek(); renderDecisions(); renderStats(); renderFiveK(); renderCourse(); renderFuel(); renderRace(); renderKerikeri();
  }

  function syncStaticInputs() {
    document.querySelectorAll("#p-fuel [data-inp], #p-race [data-inp], #p-course [data-inp], #p-kerikeri [data-inp]").forEach(function (el) { el.value = inp[el.getAttribute("data-inp")]; });
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var tab = t.closest("[data-tab]");
    if (tab) { selectTab(tab.getAttribute("data-tab")); return; }
    /* Stats contents: scroll rather than link, since the hash picks the tab. */
    var jump = t.closest("[data-jump]");
    if (jump) { var target = document.getElementById(jump.getAttribute("data-jump")); if (target) target.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    var dec = t.closest("[data-dec]");
    if (dec && !dec.disabled) {
      st[dec.getAttribute("data-dec")] = dec.getAttribute("data-val");
      normalize(); saveRoute(); renderAll();
      return;
    }
    var thBtn = t.closest("[data-thw]");
    if (thBtn) { inp.thw = thBtn.getAttribute("data-thw"); saveInputs(); renderThreshold(); return; }
    var kkBtn = t.closest("[data-kk]");
    if (kkBtn) { inp.kkt = kkBtn.getAttribute("data-kk"); saveInputs(); renderKerikeri(); renderDates(); return; }
    var node = t.closest("[data-node]");
    if (node && node.getAttribute("data-node") !== "root") { pickNode(node.getAttribute("data-node")); return; }
    var go = t.closest("[data-goto]");
    if (go) {
      if (go.hasAttribute("data-week")) { ui.week = parseInt(go.getAttribute("data-week"), 10); renderWeekPick(); renderWeek(); }
      selectTab(go.getAttribute("data-goto"));
      window.scrollTo(0, 0);
      return;
    }
    if (t.closest("#more-btn")) { setMore(!document.getElementById("tabs").classList.contains("open")); return; }
    if (!t.closest("#tabs")) setMore(false);
    var guideBtn = t.closest("[data-guide]");
    if (guideBtn) { openGuide(guideBtn.getAttribute("data-guide")); return; }
    if (t.id === "guide-close" || t.id === "guide") { document.getElementById("guide").close(); return; }
    var fillBtn = t.closest("[data-strava]");
    if (fillBtn) {
      var tv = testValues(fillBtn.getAttribute("data-strava"));
      if (tv) { Object.keys(tv.fill).forEach(function (k) { inp[k] = tv.fill[k]; }); saveInputs(); renderDecisions(); }
      return;
    }
    var wk = t.closest(".wk-btn");
    if (wk) { ui.week = parseInt(wk.getAttribute("data-week"), 10); renderWeekPick(); renderWeek(); return; }
    if (t.id === "wk-prev" && ui.week > 0) { ui.week--; renderWeekPick(); renderWeek(); return; }
    if (t.id === "wk-next" && ui.week < P.WEEKS.length - 1) { ui.week++; renderWeekPick(); renderWeek(); return; }
    if (t.id === "theme-btn") {
      var cur = store.get("akl-theme") || "auto";
      applyTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]);
      renderMaps();
    }
  });
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (e.key === "Escape") setMore(false);
    if (t.getAttribute && t.getAttribute("role") === "tab" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      var i = TABS.indexOf(t.getAttribute("data-tab"));
      selectTab(TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length], true);
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && t.closest && t.closest("[data-node]")) {
      var id = t.closest("[data-node]").getAttribute("data-node");
      if (id === "root") return;
      e.preventDefault();
      pickNode(id);
      var again = document.querySelector("[data-node=\"" + id + "\"]");
      if (again) again.focus();
    }
  });
  function onInput(e) {
    var el = e.target, key = el.getAttribute && el.getAttribute("data-inp");
    if (key) {
      inp[key] = el.value;
      saveInputs();
      if (key.charAt(0) === "c" && key !== "cpkm" && key !== "cpt") updateCheckers();
      else if (key === "cpkm" || key === "cpt") renderCheckpoint();
      else if (key === "start") renderTimeline();
      else if (key === "kkstart") renderKKTimeline();
      else if (key === "watch") renderWatch();
      else { renderFuel(); renderTimeline(); renderDates(); }
      if (key === "kg" && e.type === "change") renderWeek();
      return;
    }
    if (el.matches && el.matches("input[data-day]") && e.type === "change") {
      store.set("akl-done-" + el.getAttribute("data-day"), el.checked ? "1" : "0");
      el.closest(".day").classList.toggle("done", el.checked);
    }
  }
  document.addEventListener("input", onInput);
  document.addEventListener("change", onInput);
  window.addEventListener("hashchange", function () { selectTab(location.hash.slice(1)); });

  /* ---------- boot ---------- */
  ui.week = currentWeekIndex();
  applyTheme(store.get("akl-theme") || "auto");
  syncStaticInputs();
  renderAll();
  loadFeedRoute();
  bindProfile();
  /* On the auto theme, swap the map tiles when the system switches between light and dark. */
  (function () {
    var mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (mq && mq.addEventListener) mq.addEventListener("change", renderMaps);
    else if (mq && mq.addListener) mq.addListener(renderMaps);
  })();
  var fromHash = location.hash.slice(1);
  selectTab(TABS.indexOf(fromHash) >= 0 ? fromHash : (store.get("akl-tab") || "overview"));
})();
