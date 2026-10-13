# xLooper

Voice golf caddy PWA: GPS yardages, club suggestions, voice scoring, scorecard, and live tournaments.

- Live: https://aaabad.github.io/xlooper/
- Static app lives in `public/` and is deployed to GitHub Pages by `.github/workflows/pages.yml`.
- Tournaments (leaderboard, chat, announcements) use [ntfy.sh](https://ntfy.sh): topic `xlooper-<code>`, JSON events (`info`, `join`, `score`, `msg`). ntfy.sh keeps messages about 12 hours. Join links: `?t=CODE`.
- `server.js` is an optional self-hosted Node server (old `/api/t` backend + static hosting). You don't need it for the Pages build.
