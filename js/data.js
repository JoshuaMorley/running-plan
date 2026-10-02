/* Plan content. Days with an `alt` block change on the sub-3 build; `altBy: "half"` means the change depends on Test 1 instead. */
window.PLAN = (function () {
  var FUEL_NONE = "None needed. Eat a normal carb-based meal afterwards.";
  var FUEL_HARD = "None during. Have carbs and protein within an hour afterwards.";

  var WEEKS = [
    { n: 1, range: "28 Sep – 4 Oct", focus: "Endurance. Recover from Tuesday's race, then an easy 29 km on hills.", decBefore: "d0", days: [
      { d: "2026-09-28", t: "rest", title: "Rest" },
      { d: "2026-09-29", t: "race", title: "Tuesday 5k race", km: 5, detail: "Good George 5k.", result: "Done: 17:44, 3rd place, avg HR 184", done: true },
      { d: "2026-09-30", t: "rest", title: "Rest or optional easy 30 min", optKm: 5,
        alt: { t: "easy", title: "Easy run", km: 6, optKm: 0, detail: ["5:20–5:45/km, HR under 150", "You should be able to talk in full sentences the whole way"], why: "Adds the extra easy volume a sub-3 attempt needs without adding stress.", fuel: FUEL_NONE } },
      { d: "2026-10-01", t: "int", title: "Morning intervals · threshold", km: 9.5,
        detail: ["2 km easy warm-up", "5 × 1 km at 3:45–3:50/km, 90 s jog between", "2 km easy cool-down", "Reps should feel hard but even. If the last rep is more than 5 s slower than the first, stop there"],
        why: "Raises your threshold so marathon pace feels easier. Kept below 5k pace because you raced two days ago.", fuel: FUEL_HARD },
      { d: "2026-10-02", t: "rest", title: "Rest" },
      { d: "2026-10-03", t: "easy", title: "Easy run", km: 6, detail: ["5:20–5:45/km, conversational", "A parkrun jogged easy counts"], why: "Loosens the legs before Sunday.", fuel: FUEL_NONE },
      { d: "2026-10-04", t: "long", title: "Long run · 29 km rolling hills", km: 29,
        detail: ["5:30–5:45/km the whole way, HR under 150", "Run the hills by effort, not pace. Walk a steep pinch if HR goes past 155"],
        why: "Builds time on your feet and starts training your gut to take race fuel.",
        fuel: "Gut training starts here. Eat your planned race breakfast 2.5–3 h before. Take a gel every 25 min from 25 min in (about 6), each with water. That's about 60 g of carbs per hour.",
        alt: { detail: ["5:30–5:45/km for the first 24 km, HR under 150", "Last 5 km at 4:20/km only if your legs have recovered from Tuesday. Otherwise stay easy", "Run the hills by effort, not pace"] } }
    ]},
    { n: 2, range: "5 – 11 Oct", focus: "Peak week. Your longest run ever.", decAfter: "d1", days: [
      { d: "2026-10-05", t: "rest", title: "Rest", fuel: "Recovery day. Eat well and top up carbs after Sunday." },
      { d: "2026-10-06", t: "race", title: "Tuesday 5k", km: 5, detail: "Race it or run it steady. If you race it, keep Thursday controlled.", why: "Keeps your speed ticking over.", fuel: FUEL_HARD,
        alt: { t: "easy", title: "Tuesday 5k · steady", detail: "Around 4:00/km, controlled. Don't race it this week.", why: "Save your legs for Sunday's test." } },
      { d: "2026-10-07", t: "rest", title: "Rest or optional easy 30 min", optKm: 5,
        alt: { t: "easy", title: "Easy run", km: 5, optKm: 0, detail: "5:20–5:45/km, HR under 150.", why: "Easy volume. Keep it genuinely easy.", fuel: FUEL_NONE } },
      { d: "2026-10-08", t: "int", title: "Morning intervals · threshold", km: 10,
        detail: ["2 km easy warm-up", "3 × 2 km at 3:55/km, 2 min jog between", "2 km easy cool-down"],
        why: "Longer threshold reps build the ability to hold a hard effort.", fuel: FUEL_HARD,
        alt: { title: "Morning intervals · faster than race pace", km: 13, detail: ["1.5 km easy warm-up", "3 × 3 km at 4:05/km, 2 min jog between", "1.5 km easy cool-down", "If you can't hold 4:05 on rep 3, stop. That means you need recovery, not more work"], why: "Faster than sub-3 pace, so 4:15 feels comfortable by comparison." } },
      { d: "2026-10-09", t: "rest", title: "Rest", fuel: "Normal meals with a carb-heavy dinner." },
      { d: "2026-10-10", t: "easy", title: "Easy run", km: 6, detail: "5:30–5:45/km. Fresh legs for tomorrow matter more than pace.", why: "Shakes out the legs before your biggest run.", fuel: "Carb-heavy dinner tonight, such as pasta or rice.",
        alt: { km: 5 } },
      { d: "2026-10-11", t: "long", title: "Long run · 33 km rolling hills", km: 33,
        detail: ["First 27 km easy at 5:30–5:45/km", "Last 5–6 km at 4:35/km if you feel good, otherwise stay easy"],
        why: "Your longest run ever. It proves you can go past 30 km.",
        fuel: "Full race rehearsal. Race breakfast 3 h before, a gel 10–15 min before you start, then gels on your race schedule (see the Fuel tab), each with water. Include one caffeine gel if you plan to use them on race day.",
        alt: { t: "test", title: "Long run · 33 km · Test 1", detail: ["First 25 km easy at 5:30–5:45/km", "Last 8 km at 4:15/km, your sub-3 race pace", "Note your average pace and HR over the last 8 km, and whether the final 2–3 km slowed", "If you slow by more than 10 s/km, ease back to easy and jog it home. That's your answer for Decision 2"], why: "Sub-3 pace on tired legs is the closest you can get to the last 10 km of the race." } }
    ]},
    { n: 3, range: "12 – 18 Oct", focus: "Test week. The half marathon sets your race target.", decAfter: "d2", days: [
      { d: "2026-10-12", t: "rest", title: "Rest", fuel: "Recovery day. Eat well and top up carbs after Sunday." },
      { d: "2026-10-13", t: "easy", title: "Tuesday 5k · steady", km: 5, detail: "Around 4:00–4:10/km. Controlled, not a race.", why: "Keeps your legs sharp without taking anything out of them for Sunday.", fuel: FUEL_NONE },
      { d: "2026-10-14", t: "rest", title: "Rest or optional easy 30 min", optKm: 5,
        alt: { t: "easy", title: "Easy run", km: 5, optKm: 0, detail: "5:20–5:45/km. Keep it short before Sunday.", why: "Easy volume, nothing more.", fuel: FUEL_NONE } },
      { d: "2026-10-15", t: "int", title: "Morning intervals · light", km: 8, detail: ["2 km easy warm-up", "4 × 1 km at 3:50/km, 2 min jog between", "2 km easy cool-down"], why: "Sharpens you up without tiring you before the test.", fuel: FUEL_HARD },
      { d: "2026-10-16", t: "rest", title: "Rest", fuel: "Normal meals." },
      { d: "2026-10-17", t: "easy", title: "Easy run + strides", km: 5, detail: "5:30/km easy, then 4 × 20 s relaxed strides.", why: "Strides wake your legs up for tomorrow.", fuel: "Carb-heavy dinner tonight." },
      { d: "2026-10-18", t: "test", title: "Half marathon · pace test", km: 21.1, altBy: "half",
        detail: ["First 14 km at 4:30/km, your marathon target pace", "Last 7 km faster if you have it, otherwise hold", "Holding 4:30 the whole way finishes in 1:35:00", "Note your average pace and HR over the first 14 km"],
        why: "The best guide to your race pace you'll get before race day.",
        fuel: "Race-day routine: breakfast 3 h before, a gel 10–15 min before the start, then gels at about km 6, 11 and 17, each with water.",
        alt: { title: "Half marathon · Test 2", detail: ["First 16 km at 4:15/km", "Last 5 km by feel: faster if you have it, otherwise hold", "About 1:29–1:30 at the finish", "Note your average pace and HR over the first 16 km"] } }
    ]},
    { n: 4, range: "19 – 25 Oct", focus: "Taper starts. Less volume, same sharpness, full dress rehearsal.", days: [
      { d: "2026-10-19", t: "rest", title: "Rest", fuel: "Recovery day. Eat well after Sunday's test." },
      { d: "2026-10-20", t: "race", title: "Tuesday 5k · last sharp one", km: 5, detail: "Race it if you want. Twelve days out is fine. Otherwise run it at threshold.", why: "One last effort to stay sharp, with 12 days left to recover.", fuel: FUEL_HARD },
      { d: "2026-10-21", t: "rest", title: "Rest" },
      { d: "2026-10-22", t: "int", title: "Morning intervals · pace + speed", km: 8.5, detail: ["2 km easy warm-up", "3 km at {mp}/km", "4 × 400 m at 3:35/km, 200 m jog between", "1.5 km easy cool-down"], why: "Locks in race pace and keeps some pop in your legs.", fuel: FUEL_HARD },
      { d: "2026-10-23", t: "rest", title: "Rest" },
      { d: "2026-10-24", t: "easy", title: "Easy run", km: 6, detail: "5:20–5:45/km.", why: "Easy running to keep the routine going.", fuel: "Tonight, eat the dinner you plan to have the night before the race." },
      { d: "2026-10-25", t: "long", title: "Race practice · 13 km", km: 13, detail: ["1.5 km easy", "10 km at {mp}/km", "1.5 km easy", "Race shoes, race kit, race breakfast, same start time as race day"], why: "A full dress rehearsal, so nothing on race day is new.", fuel: "Race breakfast 3 h before, a gel 10–15 min before, then gels at the first two points on your race schedule. Practise taking gels at pace without slowing." }
    ]},
    { n: 5, range: "26 Oct – 1 Nov", focus: "Race week. Stay loose, sleep well, fuel up.", days: [
      { d: "2026-10-26", t: "rest", title: "Rest · Labour Day" },
      { d: "2026-10-27", t: "easy", title: "Tuesday 5k · easy", km: 5, detail: "5:00–5:15/km. Don't race it this week.", why: "Keeps the legs moving. Your fitness is already built.", fuel: FUEL_NONE },
      { d: "2026-10-28", t: "rest", title: "Rest" },
      { d: "2026-10-29", t: "int", title: "Morning pace check", km: 6, detail: ["2 km easy", "3 × 1 km at {mp}/km, 1 min jog between", "1 km easy"], why: "Reminds your legs what race pace feels like.", fuel: FUEL_NONE },
      { d: "2026-10-30", t: "rest", title: "Rest · carb load starts", fuel: "Carb load: {load} today. Low fibre, low fat. See the Fuel tab." },
      { d: "2026-10-31", t: "easy", title: "Shakeout", km: 5, detail: "Very easy, 5:45/km or slower, plus 3 strides. Lay out your kit, pin your bib, count your gels, and plan the trip to Devonport.", why: "Settles the nerves and loosens the legs.", fuel: "Keep carb loading: {load}. Have an early dinner you've eaten before." },
      { d: "2026-11-01", t: "race", title: "Auckland Marathon", km: 42.2, detail: "Target {full} at {mp}/km. See the Race day tab for splits and checks.", fuel: "Breakfast 3 h before, gel 1 10–15 min before the start, then your race gel schedule." }
    ]}
  ];

  var DEC = {
    d0: { n: 1, when: "Today · Wed 30 Sep", q: "Go after sub-3?" },
    d1: { n: 2, when: "After the 33 km · Sun 11 Oct", q: "Did the last 8 km at 4:15 hold?" },
    d2: { n: 3, when: "After the half · Sun 18 Oct", q: "Pick your race target" }
  };
  var OPTS = {
    d0: [
      { v: "A", b: "Sub-3 build", s: "Key sessions at 4:15/km, an extra easy run each week, 60–90 g of carbs per hour. You can drop back at either test." },
      { v: "S", b: "3:10 build", s: "Key sessions at 4:30/km, the same weekly rhythm as now, less risk." }
    ],
    d1: [
      { v: "pass", b: "Held it", s: "4:15/km for all 8 km, HR at or below about 170, no slowdown in the last 2–3 km. Run the half at 4:15." },
      { v: "fail", b: "Not yet", s: "You slowed, HR went past 170, or you were hanging on. Run the half as the 4:30 test instead." }
    ],
    d2A: [
      { v: "259", b: "Sub-3 · 4:15/km", s: "16 km at 4:15 felt controlled, and you finished in 1:29–1:30 with something left." },
      { v: "305", b: "3:05 · 4:23/km", s: "You held 4:15, but the last 5 km were hard work." },
      { v: "310", b: "3:10 · 4:30/km", s: "4:15 felt forced from early on." }
    ],
    d2S: [
      { v: "305", b: "3:05 · 4:23/km", s: "4:30/km felt controlled, HR stayed around 165 or lower, and you sped up in the last 7 km." },
      { v: "310", b: "3:10 · 4:30/km", s: "4:30/km felt steady, but you were ready to stop by the end." },
      { v: "315", b: "3:15 · 4:37/km", s: "4:30/km felt like work early, or HR drifted past 170. Still a big debut." }
    ]
  };

  var NODES = {
    root: { c: 0, y: 170, t: "Today", s: "Pick a build", cls: "root" },
    A: { c: 1, y: 105, t: "Sub-3 build", s: "Sessions at 4:15/km" },
    S: { c: 1, y: 255, t: "3:10 build", s: "Sessions at 4:30/km" },
    A1: { c: 2, y: 70, t: "33 km held 4:15", s: "Half at 4:15" },
    A2: { c: 2, y: 170, t: "33 km faded", s: "Half at 4:30" },
    S1: { c: 2, y: 265, t: "33 km, easy finish", s: "Half at 4:30" },
    T259: { c: 3, y: 50, t: "2:59:20", s: "4:15/km", cls: "target" },
    T305: { c: 3, y: 130, t: "3:05", s: "4:23/km", cls: "target" },
    T310: { c: 3, y: 210, t: "3:10", s: "4:30/km", cls: "target" },
    T315: { c: 3, y: 290, t: "3:15", s: "4:37/km", cls: "target" }
  };
  var EDGES = [["root", "A"], ["root", "S"], ["A", "A1"], ["A", "A2"], ["S", "S1"],
    ["A1", "T259"], ["A1", "T305"], ["A1", "T310"], ["A2", "T305"], ["A2", "T310"], ["A2", "T315"],
    ["S1", "T305"], ["S1", "T310"], ["S1", "T315"]];

  var TRAIN_FUEL = [
    ["Easy runs and intervals", "Nothing during. Carbs and protein within an hour after hard sessions."],
    ["29 km · Sun 4 Oct", "Race breakfast 2.5–3 h before. A gel every 25 min from 25 min in, about 60 g of carbs per hour."],
    ["33 km · Sun 11 Oct", "Full race rehearsal: breakfast 3 h before, gel 10–15 min before, then your race schedule. Try a caffeine gel."],
    ["Half · Sun 18 Oct", "Breakfast 3 h before, gel 10–15 min before, then gels at about km 6, 11 and 17."],
    ["13 km race practice · Sun 25 Oct", "Race breakfast, a gel 10–15 min before, then gels at the first two points on your race schedule."],
    ["Fri 30 and Sat 31 Oct", "Carb load, low fibre, low fat. Early dinner on Saturday."]
  ];

  /* Structured workouts for intervals.icu / Garmin (scripts/push-intervals.mjs), in intervals.icu workout-builder syntax.
     `s` is the base session, `alt` replaces it on the same branch as the day's `alt` block. "m" means minutes, "mtr" metres. */
  var EASY = "5:20-5:45/km Pace";
  function ez(km, pace) { return ["- " + km + "km " + (pace || EASY)]; }
  function wu(km) { return ["Warmup", "- " + km + "km " + EASY, ""]; }
  function cd(km) { return ["", "Cooldown", "- " + km + "km " + EASY]; }
  function reps(n, lines) { return [n + "x"].concat(lines); }
  var STEPS = {
    "2026-09-29": { s: ["- 5km"] },
    "2026-09-30": { alt: ez(6) },
    "2026-10-01": { s: wu(2).concat(reps(5, ["- 1km 3:45-3:50/km Pace", "- 90s"]), cd(2)) },
    "2026-10-03": { s: ez(6) },
    "2026-10-04": { s: ez(29, "5:30-5:45/km Pace"), alt: ez(24, "5:30-5:45/km Pace").concat(["- 5km 4:17-4:23/km Pace"]) },
    "2026-10-06": { s: ["- 5km"], alt: ez(5, "3:57-4:03/km Pace") },
    "2026-10-07": { alt: ez(5) },
    "2026-10-08": { s: wu(2).concat(reps(3, ["- 2km 3:53-3:57/km Pace", "- 2m"]), cd(2)),
      alt: wu(1.5).concat(reps(3, ["- 3km 4:03-4:07/km Pace", "- 2m"]), cd(1.5)) },
    "2026-10-10": { s: ez(6, "5:30-5:45/km Pace"), alt: ez(5, "5:30-5:45/km Pace") },
    "2026-10-11": { s: ez(27, "5:30-5:45/km Pace").concat(["- 6km 4:32-4:38/km Pace"]),
      alt: ez(25, "5:30-5:45/km Pace").concat(["- 8km 4:13-4:17/km Pace"]) },
    "2026-10-13": { s: ez(5, "4:00-4:10/km Pace") },
    "2026-10-14": { alt: ez(5) },
    "2026-10-15": { s: wu(2).concat(reps(4, ["- 1km 3:48-3:52/km Pace", "- 2m"]), cd(2)) },
    "2026-10-17": { s: ez(4.5, "5:25-5:35/km Pace").concat(["", "Strides"], reps(4, ["- 20s", "- 60s"])) },
    "2026-10-18": { s: ["- 14km 4:28-4:32/km Pace", "- 7.1km 4:10-4:30/km Pace"],
      alt: ["- 16km 4:13-4:17/km Pace", "- 5.1km 4:00-4:15/km Pace"] },
    "2026-10-20": { s: ["- 5km"] },
    "2026-10-22": { s: wu(2).concat(["- 3km {mp-2}-{mp+2}/km Pace", ""], reps(4, ["- 400mtr 3:32-3:38/km Pace", "- 200mtr"]), cd(1.5)) },
    "2026-10-24": { s: ez(6) },
    "2026-10-25": { s: wu(1.5).concat(["- 10km {mp-2}-{mp+2}/km Pace"], cd(1.5)) },
    "2026-10-27": { s: ez(5, "5:00-5:15/km Pace") },
    "2026-10-29": { s: wu(2).concat(reps(3, ["- 1km {mp-2}-{mp+2}/km Pace", "- 1m"]), cd(1)) },
    "2026-10-31": { s: ez(4.5, "5:45-6:30/km Pace").concat(["", "Strides"], reps(3, ["- 20s", "- 60s"])) },
    "2026-11-01": { s: ["- 42.2km {mp-3}-{mp+3}/km Pace"] }
  };
  WEEKS.forEach(function (w) {
    w.days.forEach(function (day) {
      var x = STEPS[day.d];
      if (!x) return;
      if (x.s) day.steps = x.s;
      if (x.alt && day.alt) day.alt.steps = x.alt;
    });
  });

  return { WEEKS: WEEKS, DEC: DEC, OPTS: OPTS, NODES: NODES, EDGES: EDGES, TRAIN_FUEL: TRAIN_FUEL };
})();
