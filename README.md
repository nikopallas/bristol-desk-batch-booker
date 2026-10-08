# 🪑 Desk Batch Booker

Book **many days, desks and rooms in one go** on `uob.smartway2book.com`. A small Chrome extension, vanilla JavaScript, no libraries.

> 🎧 **Vibe coded, unofficial, use at your own risk.** Built with an AI in one long session. It works on my desk, on my Tuesday. No warranty (MIT). If it books the wrong thing, that's on you, friend. 🫡
> **Be kind:** don't hoard desks you won't use. 🌤️

## Install (about a minute)
```sh
git clone https://github.com/nikopallas/bristol-desk-batch-booker.git
```
1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick the `bristol-desk-batch-booker` folder (keep the folder, Chrome reads it from there).
3. Open the booking site, log in, and click around once. A panel appears bottom-right.

## Use
1. Pick **Desks** or **Rooms** (switch at the top).
2. Click the **days** (click *Mo, Tu, …* to pick that weekday for the whole month).
3. Set the **time** (it is remembered).
4. Pick your **desks or rooms** from the list. Rooms also need a **title**.
5. **Check free** shows what is taken. **Book all** books everything that is free, one after the other.

⚠️ **Book all** has no confirm dialog: read the "N bookings" line above the buttons first. **Undo bookings** cancels what you just booked.

---

*Want to know more? Open what interests you:*

<details>
<summary><b>✨ All the features</b></summary>

- 🟢 **Green days:** you already have a desk that day. In Rooms mode a **dot** marks days with a room; hover for times and names.
- ★ **Favourites and ✎ nicknames:** hover a row in the list. Nicknames like "Window seat" show next to the official name. **Pick all favourites** and **★ only** are above the list.
- ⏱ **Remembered times:** your start and end time are kept.
- ↩ **Undo bookings:** cancels what this tool booked in this tab, even after a reload.
- ⛔ **Stop:** ends a run before the next booking.
- ✅ **Auto check-in:** while a booking-site tab is open, everything open for check-in is checked in every minute. **Check in now** does it at once.
- 📋 **Full list included:** all desks and rooms ship with the extension. **Scan all desks and rooms** (one time, under the list) refreshes your own copy.
- 🛡 **Code check:** before anything is booked or checked, the picked codes are compared with the site's current names. If a code now means another place, nothing is booked and you pick again.
- 🐢 **Gentle:** one booking at a time, slows down by itself if the site says "too many requests", stops after two failures in a row.
- ➖ **Minimise** the panel with the **–** button; progress stays visible.
</details>

<details>
<summary><b>🆘 Something wrong?</b></summary>

| Problem | Try |
|---|---|
| No panel | Reload the page. Check the extension is on in `chrome://extensions`. |
| "Connecting…" or "Loading your desks…" forever | Reload the page and click something on it once. |
| Room list empty | Press **Scan all desks and rooms**, or open the site's own "Book a Room" search once and reload. |
| A booking fails | Read the red line in the log, it quotes the site's reason. Two failures in a row stop the run. |
| Panel looks old after an update | Reload the extension (circular arrow in `chrome://extensions`), then the page. |

**Update:** `git pull`, reload the extension, reload the booking site.
**Uninstall:** `chrome://extensions` → Remove.
</details>

<details>
<summary><b>🛡 Is it safe?</b></summary>

- Talks only to the booking site, with your own login. Nothing is sent anywhere else.
- Your login token stays in memory: never saved, never logged.
- Only favourites, nicknames, your times and the place list are stored, in your browser (harmless).
- It is an unofficial tool on an undocumented API: it can break when the site changes, and bulk booking may go against the university's rules. Read `content.js` (one file) before you trust it, and install only from this repo.

**The honest details**
- The extension runs in the page's own context (it has to, to see the site's requests). Scripts of the booking site can therefore in principle see what it sees. The site's normal login already exposes the token to them, so this adds little, but it is not a sandbox.
- The panel sits in a closed shadow root. That only stops accidental interference, it is **not** a security boundary. Buttons react to real clicks only.
- Server text shown in the panel is shortened and long token-like strings are hidden. The panel is built without `innerHTML`.
- Everything coming from the server (names, codes, timezones, ids) is checked for shape. The reservation id used by Undo must look like an id. If the availability check fails, nothing is booked.
- `sessionStorage` holds the ids for Undo (this tab only). `localStorage` holds favourites, nicknames, times and the place list.
- Never commit HAR files: they contain a live session token (`*.har` is in `.gitignore`).
</details>

<details>
<summary><b>🔧 How it works</b></summary>

`content.js` wraps `fetch` / `XMLHttpRequest` to see the session token, your user id and your desk lists in the site's own requests, then replays the same requests the site makes:

| Purpose | Request |
|---|---|
| Book (desk or room) | `POST /Services/ReservationsWS.svc/Save6` |
| Cancel | `POST /Services/ReservationsWS.svc/Delete` |
| Who is busy | `POST /Services/ReservationsWS.svc/GetReservationTimesByLocationIds` |
| Names | `POST /webapi/reporting/getdata/` (view `ts_rep_officeclosure_hierarchy`) |
| Your bookings | `POST /webapi/reservations/loadreservationoccurrences` (one request per day) |
| Scan | `GetResourceTypes` and `GetLocations` (desk vs room by resource category) |

Learned the hard way:
- `/webapi/...` calls also need the token as an `auth_token` header, `/Services/...` calls only in the body.
- Times are sent as wall-clock time written as UTC (`09:00` → `09:00Z`). The site converts using the `timezone` field. Don't use the browser's timezone.
- The site numbers weekdays Monday = 1 … Sunday = 7.
- A room booking is the same `Save6` as a desk, with the room code, your title, `showTimeAsFree: false` and a few empty form fields.
- How far ahead you can book is set by the site per user group, so the tool has no limit of its own.
</details>

<details>
<summary><b>📦 The shipped desk and room list (for maintainers)</b></summary>

`places.js` holds codes, names, timezones and kinds (no personal data) so everybody starts with a full list. To refresh it:

1. Press **Scan all desks and rooms** in the panel (one time per browser).
2. Open **Codes & list export** → **Download the list as places.js**.
3. Replace `places.js` in the repo with the downloaded file and commit it.

Desk or room is decided by the site's own resource categories (`desk` and `meeting-room`), so Study Spaces, Training Rooms and the like are included. If the scan logic changes, raise `SCAN_VERSION` in `content.js` so everybody's browser offers the scan again.
</details>

<details>
<summary><b>🌍 Another Smartway2 site?</b></summary>

Change the address under `"matches"` in `manifest.json` (e.g. `"https://yourorg.smartway2book.com/*"`) and reload the extension. It is untested outside the author's site: try **Check free** first.
</details>

## License
MIT, see [LICENSE](LICENSE). Provided as is, at your own risk.
