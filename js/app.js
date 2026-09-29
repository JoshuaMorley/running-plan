(function () {
  var P = window.PLAN;
  var MARATHON_KM = 42.195;
  var RACE_DATE = "2026-11-01";
  var TARGETS = {
    "259": { sec: 255 * 42.195 },
    "305": { sec: 11100 },
    "310": { sec: 11400 },
    "315": { sec: 11700 }
  };
  var ALLOWED = { A1: ["259", "305", "310"], A2: ["305", "310", "315"], S1: ["305", "310", "315"] };
  var TABS = ["overview", "plan", "decisions", "course", "fuel", "race", "rules"];
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

  var INP_DEFAULTS = { gel: 22, gph: 70, kg: 70, cpkm: "21.0975", cpt: "1:30:10", start: "06:00",
    c1pace: "4:15", c1hr: "168", c1slow: "no", c2pace: "4:15", c2hr: "170", c2fin: "1:29:45", c2last: "held", watch: "42.8" };
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
  function kg() { return clampNum(inp.kg, 40, 130, 70); }
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
    return !!day.done;
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
    return h;
  }
  function dayRowHTML(d) {
    var dt = dateObj(d.d), done = d.t !== "rest" && isDone(d);
    var h = "<div class=\"day" + (d.t === "rest" ? " rest" : "") + (d.d === today ? " today" : "") + (done ? " done" : "") + "\">";
    h += "<div class=\"d-date\"><b>" + DOW[dt.getDay()] + "</b><span class=\"num\">" + dt.getDate() + " " + MON[dt.getMonth()] + (d.d === today ? " · today" : "") + "</span></div>";
    h += "<span class=\"chip t-" + d.t + "\">" + TYPE_LABEL[d.t] + "</span>";
    h += "<div class=\"d-body\"><span class=\"d-title\">" + esc(fill(d.title)) + "</span>" + detailHTML(d) + "</div>";
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

    var n = daysBetween(today, RACE_DATE);
    var el = document.getElementById("countdown"), lab = document.getElementById("countdown-label");
    if (n > 1) { el.textContent = n; lab.textContent = "days to go"; }
    else if (n === 1) { el.textContent = "1"; lab.textContent = "day to go"; }
    else if (n === 0) { el.textContent = "Today"; lab.textContent = "race day"; }
    else { el.textContent = "Done"; lab.textContent = "race complete"; }
  }

  var COLX = [0, 230, 460, 690], NW = 172, NH = 50;
  var COLH = ["Today", "11 Oct · 33 km", "18 Oct · Half", "1 Nov · Race"];
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
    } else if (today > RACE_DATE) {
      html += "<div class=\"card today-card\"><span class=\"eyebrow\">Finished</span><h3>Race complete</h3><p class=\"muted\">Rest up. Easy running only for the next 1–2 weeks.</p></div>";
    } else if (cur) {
      html += "<div class=\"card today-card\"><span class=\"eyebrow\">Today · " + niceDate(cur.d) + "</span><span class=\"chip t-" + cur.t + "\">" + TYPE_LABEL[cur.t] + "</span><h3>" + esc(fill(cur.title)) + (cur.km ? " · " + cur.km + " km" : "") + "</h3>" + detailHTML(cur) + "<button type=\"button\" class=\"link-btn\" data-goto=\"plan\" data-week=\"" + cur._w + "\">Open this week</button></div>";
    }
    if (next) {
      html += "<div class=\"card today-card next\"><span class=\"eyebrow\">Next session · " + niceDate(next.d) + " · " + relDays(next.d) + "</span><span class=\"chip t-" + next.t + "\">" + TYPE_LABEL[next.t] + "</span><h3>" + esc(fill(next.title)) + (next.km ? " · " + next.km + " km" : "") + "</h3>" + detailHTML(next) + "</div>";
    }
    document.getElementById("today-cards").innerHTML = html;
  }
  function renderVolume() {
    var PREV_PEAK = 51, cw = currentWeekIndex();
    var totals = P.WEEKS.map(weekKm);
    var max = Math.max.apply(null, totals.concat([PREV_PEAK])) * 1.05;
    var h = totals.map(function (km, i) {
      var w = P.WEEKS[i];
      return "<div class=\"vol-row" + (i === cw ? " cur" : "") + "\"><span><b>Week " + w.n + "</b><br><span class=\"muted\" style=\"font-size:12px\">" + esc(w.range) + "</span></span>" +
        "<div class=\"vol-track\"><div class=\"vol-bar\" style=\"width:" + (km / max * 100).toFixed(1) + "%\"></div><div class=\"vol-mark\" style=\"left:" + (PREV_PEAK / max * 100).toFixed(1) + "%\"></div></div>" +
        "<span class=\"num\" style=\"text-align:right;font-weight:600\">" + (Math.round(km * 10) / 10) + " km</span></div>";
    }).join("");
    h += "<p class=\"vol-legend\">Dashed line: your previous biggest week, 51 km. Week 5 includes the race. The current week is in orange.</p>";
    document.getElementById("volume").innerHTML = h;
  }
  function renderDates() {
    var subA = st.d0 === "A";
    var list = [
      ["2026-10-04", "29 km long run", subA ? "Easy, last 5 km at 4:20 if recovered" : "All easy"],
      ["2026-10-11", subA ? "33 km · Test 1" : "33 km long run", subA ? "Last 8 km at 4:15" : "Longest run ever"],
      ["2026-10-18", l2() === "A1" ? "Half · Test 2" : "Half · pace test", l2() === "A1" ? "16 km at 4:15" : "14 km at 4:30"],
      ["2026-10-19", "Taper starts", "Less volume, same sharpness"],
      ["2026-10-25", "13 km race practice", "10 km at " + fmtPace(mpSec()) + "/km"],
      ["2026-10-30", "Carb load starts", loadText() + " a day"],
      [RACE_DATE, "Auckland Marathon", fmtTarget() + " at " + fmtPace(mpSec()) + "/km"]
    ];
    document.getElementById("dates").innerHTML = list.map(function (x) {
      return "<div class=\"date-row\"><b>" + niceDate(x[0]) + "</b><span><strong>" + esc(x[1]) + "</strong><br><span class=\"muted\" style=\"font-size:13px\">" + esc(x[2]) + "</span></span><span class=\"muted num\" style=\"font-size:13px\">" + relDays(x[0]) + "</span></div>";
    }).join("");
  }

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
      h += "<div class=\"checker\"><h4>Test 1 checker · 33 km on Sun 11 Oct</h4><div class=\"fields\">" +
        field("c1-pace", "Avg pace, last 8 km (m:ss)", "c1pace", "text", " inputmode=\"numeric\" placeholder=\"4:15\"") +
        field("c1-hr", "Avg HR, last 8 km", "c1hr", "number", " min=\"100\" max=\"210\"") +
        selectField("c1-slow", "Final 2–3 km slower?", "c1slow", [["no", "No"], ["yes", "Yes, I slowed"]]) +
        "</div><div id=\"c1-out\"></div></div>";
    }
    h += decisionHTML("d2", false);
    var a1 = l2() === "A1";
    h += "<div class=\"checker\"><h4>" + (a1 ? "Test 2 checker · half at 4:15" : "Pace test checker · half at 4:30") + " · Sun 18 Oct</h4><div class=\"fields\">" +
      field("c2-pace", a1 ? "Avg pace, first 16 km" : "Avg pace, first 14 km", "c2pace", "text", " inputmode=\"numeric\" placeholder=\"" + (a1 ? "4:15" : "4:30") + "\"") +
      field("c2-hr", a1 ? "Avg HR, first 16 km" : "Avg HR, first 14 km", "c2hr", "number", " min=\"100\" max=\"210\"") +
      (a1 ? field("c2-fin", "Finish time (h:mm:ss)", "c2fin", "text", " inputmode=\"numeric\" placeholder=\"1:29:45\"") : "") +
      selectField("c2-last", a1 ? "Last 5 km" : "Last 7 km", "c2last", [["faster", "Got faster"], ["held", "Held pace"], ["slowed", "Slowed down"]]) +
      "</div><div id=\"c2-out\"></div></div>";
    document.getElementById("decision-list").innerHTML = h;
    updateCheckers();
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
      var p2 = parsePace(inp.c2pace), hr2 = parseInt(inp.c2hr, 10), last = inp.c2last;
      if (isNaN(p2) || isNaN(hr2)) { o2.innerHTML = "<p class=\"muted\">Enter your pace as m:ss and your average HR.</p>"; return; }
      var r2 = [], pick, cls;
      if (l2() === "A1") {
        var fin = parseClock(inp.c2fin);
        if (isNaN(fin)) { o2.innerHTML = "<p class=\"muted\">Enter your finish time as h:mm:ss, for example 1:29:45.</p>"; return; }
        r2.push("First 16 km at " + fmtPace(p2) + "/km with HR " + hr2 + ".");
        r2.push("Finished in " + fmtClock(fin) + (fin <= 5430 ? ", inside 1:30:30." : ", outside 1:30:30."));
        r2.push(last === "slowed" ? "You slowed over the last 5 km." : "You " + (last === "faster" ? "got faster" : "held pace") + " over the last 5 km.");
        if (p2 <= 257 && hr2 <= 172 && fin <= 5430 && last !== "slowed") { pick = "259"; cls = "good"; }
        else if (p2 <= 262 && fin <= 5520) { pick = "305"; cls = "warn"; }
        else { pick = "310"; cls = "bad"; }
      } else {
        r2.push("First 14 km at " + fmtPace(p2) + "/km with HR " + hr2 + ".");
        r2.push(last === "slowed" ? "You slowed over the last 7 km." : "You " + (last === "faster" ? "got faster" : "held pace") + " over the last 7 km.");
        if (p2 <= 272 && hr2 <= 165 && last === "faster") { pick = "305"; cls = "good"; }
        else if (p2 <= 275 && hr2 <= 170 && last !== "slowed") { pick = "310"; cls = "good"; }
        else { pick = "315"; cls = "warn"; }
      }
      var label = { "259": "Sub-3 at 4:15/km", "305": "3:05 at 4:23/km", "310": "3:10 at 4:30/km", "315": "3:15 at 4:37/km" }[pick];
      o2.innerHTML = verdictHTML(cls, "Suggested target: " + label + ".", r2, "d2", pick);
    }
  }

  /* ---------- fuel ---------- */
  function gelPlan() {
    var mp = mpSec(), dur = targetSec();
    var gel = clampNum(inp.gel, 10, 50, 22), gph = clampNum(inp.gph, 50, 90, 70);
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

    var cafA = null, cafB = null;
    g.list.forEach(function (x, i) { if (cafA === null && x.km >= 20) cafA = i; if (cafB === null && x.km >= 30) cafB = i; });
    var rows = "<tr><td>Gel 1</td><td>10–15 min before the start</td><td class=\"r\">before</td></tr>";
    g.list.forEach(function (x, i) {
      rows += "<tr><td>Gel " + (i + 2) + ((i === cafA || i === cafB) ? " <span class=\"caf\">caffeine optional</span>" : "") + "</td><td>km " + x.km + "</td><td class=\"r\">" + fmtClock(plannedClock(x.km)) + "</td></tr>";
    });
    rows += "<tr><td>Spare</td><td>Only if you feel flat late on</td><td class=\"r\">–</td></tr>";
    document.getElementById("gel-table").innerHTML = rows;

    document.getElementById("carb-load").innerHTML = "<b style=\"color:var(--fg)\">About " + Math.round(kg() * 8) + "–" + Math.round(kg() * 10) + " g of carbs each day</b> (8–10 g per kg at " + kg() + " kg).";
    document.getElementById("breakfast").innerHTML = "<b style=\"color:var(--fg)\">About " + Math.round(kg() * 2) + " g of carbs, 3 hours before the start</b> (about 2 g per kg).";
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
    function hhmm(x) { x = ((x % 1440) + 1440) % 1440; var h = Math.floor(x / 60), mm = x % 60; return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); }
    document.getElementById("timeline").innerHTML = items.map(function (it) {
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
  function renderMap() {
    var pts = COURSE.pts, W = 400, H = 400, pad = 26;
    var lats = pts.map(function (p) { return p.lat; }), lons = pts.map(function (p) { return p.lon; });
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats), minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons);
    var kx = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    var sx = (W - 2 * pad) / ((maxLon - minLon) * kx), sy = (H - 2 * pad) / (maxLat - minLat), sc = Math.min(sx, sy);
    var offX = (W - (maxLon - minLon) * kx * sc) / 2, offY = (H - (maxLat - minLat) * sc) / 2;
    MAP = function (p) { return [offX + (p.lon - minLon) * kx * sc, offY + (maxLat - p.lat) * sc]; };
    var route = "", bridge = "";
    pts.forEach(function (p, i) {
      var xy = MAP(p);
      route += (i ? " L" : "M") + xy[0].toFixed(1) + " " + xy[1].toFixed(1);
      if (p.k >= COURSE.bridge[0] && p.k <= COURSE.bridge[1]) bridge += (bridge ? " L" : "M") + xy[0].toFixed(1) + " " + xy[1].toFixed(1);
    });
    var s = "<path class=\"m-route\" d=\"" + route + "\"></path><path class=\"m-bridge\" d=\"" + bridge + "\"></path>";
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
      var redraw = function () { renderProfile(); };
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
    /* Keep the active tab visible when the tab bar scrolls sideways on phones. */
    if (bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2);
    if (focus) btn.focus();
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
    renderHeader(); renderTree(); renderToday(); renderVolume(); renderDates();
    renderWeekPick(); renderWeek(); renderDecisions(); renderCourse(); renderFuel(); renderRace();
  }

  function syncStaticInputs() {
    document.querySelectorAll("#p-fuel [data-inp], #p-race [data-inp], #p-course [data-inp]").forEach(function (el) { el.value = inp[el.getAttribute("data-inp")]; });
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var tab = t.closest("[data-tab]");
    if (tab) { selectTab(tab.getAttribute("data-tab")); return; }
    var dec = t.closest("[data-dec]");
    if (dec && !dec.disabled) {
      st[dec.getAttribute("data-dec")] = dec.getAttribute("data-val");
      normalize(); saveRoute(); renderAll();
      return;
    }
    var node = t.closest("[data-node]");
    if (node && node.getAttribute("data-node") !== "root") { pickNode(node.getAttribute("data-node")); return; }
    var go = t.closest("[data-goto]");
    if (go) {
      if (go.hasAttribute("data-week")) { ui.week = parseInt(go.getAttribute("data-week"), 10); renderWeekPick(); renderWeek(); }
      selectTab(go.getAttribute("data-goto"));
      window.scrollTo(0, 0);
      return;
    }
    var wk = t.closest(".wk-btn");
    if (wk) { ui.week = parseInt(wk.getAttribute("data-week"), 10); renderWeekPick(); renderWeek(); return; }
    if (t.id === "wk-prev" && ui.week > 0) { ui.week--; renderWeekPick(); renderWeek(); return; }
    if (t.id === "wk-next" && ui.week < P.WEEKS.length - 1) { ui.week++; renderWeekPick(); renderWeek(); return; }
    if (t.id === "theme-btn") {
      var cur = store.get("akl-theme") || "auto";
      applyTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]);
    }
  });
  document.addEventListener("keydown", function (e) {
    var t = e.target;
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
  bindProfile();
  var fromHash = location.hash.slice(1);
  selectTab(TABS.indexOf(fromHash) >= 0 ? fromHash : (store.get("akl-tab") || "overview"));
})();
