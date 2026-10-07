#!/usr/bin/env node
/* Writes plan.ics, a calendar feed of every run on the chosen route. GitHub Pages serves it, so Google Calendar
   (or any calendar app) can subscribe to it by URL and pick up changes after each push.
   Usage: node scripts/build-ics.mjs [--build A|S] [--d1 pass|fail] [--target 259|305|310|315]
   Events keep the same UID per date, so a re-run updates them. Days that become rest drop out of the feed. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { P, RACE_DATE, st, routeLabel, sessions } from "./plan.mjs";

const SITE = "https://joshuamorley.github.io/running-plan/";
const OUT = fileURLToPath(new URL("../plan.ics", import.meta.url));

/* RFC 5545 text escaping, and folding of lines longer than 75 bytes. */
function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function fold(line) {
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > 75) { out.push(cur); cur = " "; bytes = 1; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}
const ymd = (iso) => iso.replace(/-/g, "");
function nextDay(iso) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const { sessions: list } = sessions(P.WEEKS[0].days[0].d, RACE_DATE);

const lines = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//joshuamorley//Auckland Marathon plan//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "X-WR-CALNAME:Auckland Marathon plan",
  "X-WR-CALDESC:" + esc("Runs on the " + routeLabel + ". " + SITE),
  "X-WR-TIMEZONE:Pacific/Auckland",
  "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  "X-PUBLISHED-TTL:PT6H",
  /* Read by the site to show which route the feed follows. */
  "X-AKL-ROUTE:" + [st.d0, st.d1, st.d2].join("-")
];
list.forEach((s) => {
  const d = s.day;
  const summary = (d.done ? "✓ " : "") + s.title + (d.km && !/\bkm\b/.test(s.title) ? " · " + d.km + " km" : "");
  const notes = (d.result ? [d.result, ""] : []).concat(s.notes, ["", SITE + "#plan"]);
  lines.push(
    "BEGIN:VEVENT",
    "UID:akl-" + d.d + "@joshuamorley.github.io",
    "DTSTAMP:" + stamp,
    "DTSTART;VALUE=DATE:" + ymd(d.d),
    "DTEND;VALUE=DATE:" + ymd(nextDay(d.d)),
    "SUMMARY:" + esc(summary),
    "DESCRIPTION:" + esc(notes.join("\n")),
    "URL:" + SITE + "#plan",
    "TRANSP:TRANSPARENT",
    "END:VEVENT"
  );
});
lines.push("END:VCALENDAR");

writeFileSync(OUT, lines.map(fold).join("\r\n") + "\r\n");
console.log("Route: " + routeLabel);
console.log("Wrote " + list.length + " runs to plan.ics. Commit and push it to update the calendar feed.");
