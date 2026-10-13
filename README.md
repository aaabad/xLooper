# xLooper

Voice golf caddy PWA: GPS yardages, club suggestions, voice scoring, scorecard, live tournaments, and course sharing.

- Live: https://aaabad.github.io/xLooper/
- Static app lives in `public/` and is deployed to GitHub Pages by `.github/workflows/pages.yml`.
- Tournaments (leaderboard, chat, announcements) use [ntfy.sh](https://ntfy.sh): topic `xlooper-<code>`, JSON events (`info`, `join`, `score`, `msg`). ntfy.sh keeps messages about 12 hours. Join links: `?t=CODE`.
- Course sharing: **Share course** posts the current course (name, pars, per-hole green coordinates, marked green outlines) to ntfy topic `xlooper-course-<code>` and copies `?course=CODE#cache=…`. The hash is a deflate + base64 copy of the course, so the link still works after ntfy drops messages (~12 hours). **Get course from a friend** previews that course, then merge or replace. Within about 2 km of a saved course's greens, xLooper offers to switch when that course is closer than the one you're on.
- `server.js` is an optional self-hosted Node server (old `/api/t` backend + static hosting). You don't need it for the Pages build.
