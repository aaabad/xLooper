# xLooper

Voice golf caddy PWA: GPS yardages, club suggestions, voice scoring, scorecard, live tournaments, course search, and course sharing. Language is English or Taglish (header). Taglish speaks with a fil-PH voice when the phone has one. A club with several courses (Red, White, Green) asks which one to load; a 9-hole course can be played twice.

- Live: https://aaabad.github.io/xLooper/
- Static app lives in `public/` and is deployed to GitHub Pages by `.github/workflows/pages.yml`.
- Tournaments (leaderboard, chat, announcements) use [ntfy.sh](https://ntfy.sh): topic `xlooper-<code>`, JSON events (`info`, `join`, `score`, `msg`). ntfy.sh keeps messages about 12 hours. Join links: `?t=CODE`.
- Course setup: **Search course** (name, town, or ZIP) geocodes with Nominatim and loads the golf course from OpenStreetMap (holes, greens, tees, bunkers, water). It works from home and is saved on the phone. The satellite map is the preview; tap any hole that is still missing a green. **Find my course** is the GPS backup (within about 3 km, and it selects the course you are standing on). Front, center, and back yardages come from the green shape. `golfCourseApiKey` in `public/config.js` is optional and fills pars and yardages when you add a free GolfCourseAPI key.
- Course sharing: **Share course** posts the current course (name, pars, per-hole green coordinates, marked green outlines) to ntfy topic `xlooper-course-<code>` and copies `?course=CODE#cache=…`. The hash is a deflate + base64 copy of the course, so the link still works after ntfy drops messages (~12 hours). **Get course from a friend** previews that course, then merge or replace. Within about 2 km of a saved course's greens, xLooper offers to switch when that course is closer than the one you're on.
- Opt-in **Join xircle** (Clubs, or a prompt after the first saved round or the third visit; dismissed prompts are asked once more after two further saved rounds): name, email, optional phone, ZIP, and home course, plus an unchecked consent checkbox and a plain-language privacy note. The shared directory stores the name and SHA-256 hashes only (lowercase trimmed email, E.164 phone) plus this app's membership and who invited them. ZIP and home course stay on the phone. Withdraw from Clubs leaves the xLooper sub-xircle; the one-way codes stay so other xircle apps can recognize the same person.
- Group chat **Invite** asks first whether xLooper may read contacts (Contact Picker API, `navigator.contacts.select`, on Android Chrome). Desktop Chrome has no Contact Picker: say yes and it tells you so, or type an email or phone, or pick someone already in the xLooper xircle. A match is invited in the app. Anyone else gets a join link handed to `mailto:`, `sms:`, or the share sheet. Nothing is sent until you tap send.
- `node --test test/xircle.test.mjs` checks hashes, the invite tree, separate sub-xircles, the Firestore payload, and the ntfy fallback.
- `server.js` is an optional self-hosted Node server (old `/api/t` backend + static hosting). You don't need it for the Pages build.

## Xircle directory

`public/xircle-db.js` is the data layer. One Firebase project, `xircle-a43cf` (Firestore `(default)` in `nam5`), is the global xircle database for every xircle app. People and contact hashes are shared. Each app is a sub-xircle keyed by its Firebase web app id, and the family tree lives inside that sub-xircle only.

xLooper's app id is `1:380596925925:web:49c554c85142de53656b0c` (`firebase.appId` in `public/config.js`).

KOR-World is a different repository. It uses the same Firebase project with app id `1:380596925925:web:a2c784c5ba701c4e656b0c`. This repo does not read or write that sub-xircle.

- `xirclePeople` — global person: name, chat id from the app that created them, email hash, phone hash, consent time, withdrawn
- `xircleContacts/{sha256}` — global lookup key. The hash is the document id
- `xircleMembers/{appId}__{memberId}` — membership in one app. `parentId` is who invited them in that app. `chatId` is that app's device id. Withdrawing marks this membership withdrawn and does not remove the global person or the hash
- `xircleInvites` — in-app chat invites for one `appId`, used when ntfy has already dropped the live message

Emails and phones are normalized first (lowercase trimmed email, E.164 phone), then SHA-256. The raw address is not written to Firestore or ntfy. Ten-digit numbers are treated as US (`+1`). Numbers starting with `09` are treated as Philippine mobiles (`+63`). A leading `+` is kept as typed.

Someone already in another xircle app is not "in the xLooper xircle" until they join this one. Joining reuses their global member id and starts a new tree here. It does not change the other app's parent.

### Firebase (this project is already on)

`public/config.js` holds the public web config for `xircle-a43cf`: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`. Those are client keys. Do not commit a service-account JSON or private key.

The database was created in production mode, so Firestore denies every read and write until rules are published. Anonymous sign-in is already enabled.

1. Firebase console → Firestore → Rules.
2. Paste `firestore.rules` from this repo.
3. Publish.

Reload xLooper after publishing. Clubs then says `Directory: Firebase Firestore for xircle.us.` Until the rules are published, a visit falls back to this phone plus ntfy (about 12 hours) and Clubs says to publish `firestore.rules`. A `signupTopic` that is a full `https://` URL receives the same hash JSON (name and hashes, never the raw email or phone).

The API key can be restricted to HTTP referrers `https://aaabad.github.io/*` and `http://localhost:*`, and to the Identity Toolkit API plus Cloud Firestore API.
