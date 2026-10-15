# xLooper

Voice golf caddy PWA: GPS yardages, club suggestions, voice scoring, scorecard, live tournaments, course search, and course sharing. Language is English or Taglish (header). Taglish speaks with a fil-PH voice when the phone has one. A club with several courses (Red, White, Green) asks which one to load; a 9-hole course can be played twice.

- Live: https://aaabad.github.io/xLooper/
- Static app lives in `public/` and is deployed to GitHub Pages by `.github/workflows/pages.yml`.
- Tournaments (leaderboard, chat, announcements) use [ntfy.sh](https://ntfy.sh): topic `xlooper-<code>`, JSON events (`info`, `join`, `score`, `msg`). ntfy.sh keeps messages about 12 hours. Join links: `?t=CODE`.
- Course setup: **Search course** (name, town, or ZIP) geocodes with Nominatim and loads the golf course from OpenStreetMap (holes, greens, tees, bunkers, water). It works from home and is saved on the phone. The satellite map is the preview; tap any hole that is still missing a green. **Find my course** is the GPS backup (within about 3 km, and it selects the course you are standing on). Front, center, and back yardages come from the green shape. `golfCourseApiKey` in `public/config.js` is optional and fills pars and yardages when you add a free GolfCourseAPI key.
- Course sharing: **Share course** posts the current course (name, pars, per-hole green coordinates, marked green outlines) to ntfy topic `xlooper-course-<code>` and copies `?course=CODE#cache=…`. The hash is a deflate + base64 copy of the course, so the link still works after ntfy drops messages (~12 hours). **Get course from a friend** previews that course, then merge or replace. Within about 2 km of a saved course's greens, xLooper offers to switch when that course is closer than the one you're on.
- Opt-in **Join xircle** (Clubs, or a prompt after the first saved round or the third visit; dismissed prompts are asked once more after two further saved rounds): name, email, optional phone, ZIP, and home course, plus an unchecked consent checkbox and a plain-language privacy note. The shared directory stores the name and SHA-256 hashes only (lowercase trimmed email, E.164 phone), the xLooper membership, and who invited them. ZIP and home course stay on the phone. Withdraw from Clubs.
- Group chat **Invite** asks first whether xLooper may read contacts (Contact Picker API, `navigator.contacts.select`, on Android Chrome). Desktop Chrome has no Contact Picker: say yes and it tells you so, or type an email or phone, or pick someone already in the xLooper xircle. A match is invited in the app. Anyone else gets a join link handed to `mailto:`, `sms:`, or the share sheet. Nothing is sent until you tap send.
- `node --test test/xircle.test.mjs` checks hashes, the invite tree, the Firestore payload, and the ntfy fallback.
- `server.js` is an optional self-hosted Node server (old `/api/t` backend + static hosting). You don't need it for the Pages build.

## Xircle directory

`public/xircle-db.js` is the data layer. A global xircle holds people. The xLooper sub-xircle hangs off it, and membership branches like a family tree (`parentId` is who invited this member).

- `xirclePeople` — name, chat id, email hash, phone hash, consent time, withdrawn
- `xircleContacts/{sha256}` — lookup key. The hash is the document id
- `xircleMembers` — xLooper membership and parent/child invite tree
- `xircleInvites` — in-app chat invites when ntfy has already dropped the live message

Emails and phones are normalized first (lowercase trimmed email, E.164 phone), then SHA-256. The raw address is not written to Firestore or ntfy. Ten-digit numbers are treated as US (`+1`). Numbers starting with `09` are treated as Philippine mobiles (`+63`). A leading `+` is kept as typed.

### Firebase keys (lasting directory)

Leave `firebase.apiKey` and `firebase.projectId` blank in `public/config.js` to use this phone plus ntfy (the `signupTopic`, about 12 hours). Clubs explains which mode is active.

To turn on Firestore:

1. Create a Firebase project on the free Spark plan and a Firestore database.
2. Authentication → Sign-in method → enable **Anonymous**.
3. Firestore → Rules → paste `firestore.rules` from this repo → Publish.
4. Project settings → Your apps → Web app → copy the public config into `public/config.js`:
   - `firebase.apiKey`
   - `firebase.projectId`

Those are public client keys. Do not commit a service-account JSON or private key. The API key can be restricted to HTTP referrers `https://aaabad.github.io/*` and `http://localhost:*`, and to the Identity Toolkit API plus Cloud Firestore API.

If Anonymous sign-in is off, or the rules are not published, xLooper stays on the phone + ntfy directory and the Clubs tab says what is missing. A `signupTopic` that is a full `https://` URL receives the same hash JSON (name and hashes, never the raw email or phone).
