# Auckland Marathon Build

A five-week branching training plan for the Auckland Marathon on Sunday 1 November 2026.

- **Overview:** today's session, the decision map, weekly volume and key dates
- **Plan:** each week day by day, with why each run matters and what to fuel with
- **Decisions:** three branch points, with checkers for the 33 km and half marathon tests
- **Course:** elevation and pace chart from the course GPX, course map, per-km pace plan and watch-pace adjustment
- **Fuel:** gel calculator, carb load and race breakfast amounts
- **Race day:** splits, checkpoint calculator and a race-morning timeline
- **Stay healthy:** rules for training without getting hurt

Plain HTML, CSS and JavaScript with no build step. Your choices and ticks are saved in your browser's local storage.

## Send to Garmin (via intervals.icu)

`scripts/push-intervals.mjs` turns every run into a structured workout with pace targets and sends it to [intervals.icu](https://intervals.icu). intervals.icu then syncs it to Garmin Connect and your watch. The steps for each day are in `STEPS` at the bottom of `js/data.js`.

One-time setup:

1. In intervals.icu, go to **Settings → Developer Settings** and copy your athlete ID (like `i123456`) and API key.
2. In intervals.icu **Settings**, connect Garmin Connect and turn on **Upload planned workouts**.
3. Create a `.env` file in this folder (it's git-ignored, so never commit the key):
   ```
   INTERVALS_ATHLETE_ID=i123456
   INTERVALS_API_KEY=your-key
   ```

Run it (Node 20.6 or newer). Use the same choices you made on the site:

```
node scripts/push-intervals.mjs --dry-run                      # preview the route.json route
node --env-file=.env scripts/push-intervals.mjs                # send today → race day
node --env-file=.env scripts/push-intervals.mjs --build S      # 3:10 build
node --env-file=.env scripts/push-intervals.mjs --d1 fail --target 305 --from 2026-10-19
```

Re-run after each decision. Workouts are matched by date, so they're updated, not duplicated. The script never deletes anything. intervals.icu only sends about the next week of workouts to Garmin, so later weeks show up on your watch as they get closer.

## Automatic sync (GitHub Actions)

`.github/workflows/sync.yml` runs every 30 minutes, when `route.json` or `js/data.js` changes, and on demand from the **Actions** tab. Each run:

1. Pulls your runs from Strava into `js/results.js` (`scripts/sync-strava.mjs`). The site uses them for the planned vs actual pills, run volume, heart rate drift and the test checkers.
2. Rebuilds `plan.ics` for the calendar, with Strava results and the meal reminders.
3. Sends workouts to intervals.icu, but only when the plan or route changed or you ran it by hand.
4. Commits anything that changed, so GitHub Pages republishes the site.

`route.json` is the route the calendar and Garmin follow. After a decision, edit it on GitHub (the Overview tab links to it when it's out of step with the site) and the sync does the rest. The decisions themselves stay yours.

One-time setup:

1. Create a Strava API app at [strava.com/settings/api](https://www.strava.com/settings/api). Set **Authorization Callback Domain** to `localhost`.
2. Add its client ID and secret to `.env`:
   ```
   STRAVA_CLIENT_ID=12345
   STRAVA_CLIENT_SECRET=your-secret
   ```
3. Run `node --env-file=.env scripts/strava-auth.mjs`, open the link, and press **Authorize**. It saves `STRAVA_REFRESH_TOKEN` to `.env`.
4. Check it works: `node --env-file=.env scripts/sync-strava.mjs`.
5. On GitHub, go to **Settings → Secrets and variables → Actions** and add `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` and `STRAVA_REFRESH_TOKEN`. Optionally add `INTERVALS_ATHLETE_ID` and `INTERVALS_API_KEY` for Garmin.
6. Run the **Sync** workflow once from the **Actions** tab to check it.

Steps without their secrets are skipped. If Strava ever rejects the token, the run fails and GitHub emails you. Repeat steps 3 and 5.

## Calendar feed (Google Calendar, Apple, Outlook)

`scripts/build-ics.mjs` writes `plan.ics`, which has every run on the `route.json` route as an all-day event, plus timed meal reminders with recipes (from `MEALS` and `REMINDERS` in `js/data.js`). GitHub Pages serves it at `https://joshuamorley.github.io/running-plan/plan.ics`. The Overview tab has buttons to subscribe to it. In Google Calendar you can also add it by hand: **Other calendars → + → From URL**.

The automatic sync rebuilds it. To build it by hand, flags override `route.json`:

```
node scripts/build-ics.mjs                                     # the route.json route
node scripts/build-ics.mjs --build S --target 315              # 3:10 build
```

Events keep the same ID for each date, so subscribers see them updated instead of duplicated. Days that turn into rest days drop out. Google Calendar only re-reads subscribed calendars every several hours, so changes take a while to show up. The Overview tab says which route the feed follows and warns if it's different from the route picked on the site.

`scripts/plan.mjs` holds the route and session logic that this script and `push-intervals.mjs` share.

## Publish on GitHub Pages

1. Create an empty repository on GitHub.
2. Push this folder to it:
   ```
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**, set **Source** to **Deploy from a branch**, then choose `main` and `/ (root)`.
4. After a minute or two the site is live at `https://<your-username>.github.io/<repo-name>/`.

Paces are estimates, not coaching or medical advice.
