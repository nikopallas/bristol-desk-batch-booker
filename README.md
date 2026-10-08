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

**Update:** `git pull`, press the reload arrow on the extension card, reload the booking site.

## Use
1. Pick **Desks** or **Rooms** (switch at the top).
2. Click the **days** (click *Mo, Tu, …* to pick that weekday for the whole month).
3. Set the **time** (it is remembered).
4. Pick your **desks or rooms** from the list. Hover a row for **★** (favourite) and **✎** (nickname). Rooms also need a **title**.
5. **Check free** shows what is taken. **Book all** books everything that is free, one after the other.

**Good to know**
- 🟢 A green day = you already have a desk. In Rooms mode a dot marks days with a room (hover for times).
- **Book all** has no confirm dialog. Read the "N bookings" line above the buttons first. **Stop** ends a run, **Undo bookings** cancels what you just booked (also after a reload).
- If a code now means a different place than before, nothing is booked and you pick again.
- **Check-in is automatic** while a booking-site tab is open (**Check in now** does it at once).
- The full desk and room list ships with the extension. **Scan all desks and rooms** (one time) refreshes your own copy.

## Something wrong?
| Problem | Try |
|---|---|
| No panel | Reload the page. Check the extension is on in `chrome://extensions`. |
| "Connecting…" or "Loading your desks…" forever | Reload the page and click something on it once. |
| Room list empty | Press **Scan all desks and rooms**, or open the site's own "Book a Room" search once and reload. |
| A booking fails | Read the red line in the log, it quotes the site's reason. Two failures in a row stop the run. |
| Panel stuck on an old version | Reload the extension, then the page. |

## Safety, in short
- Reads and books only on the booking site, with your own login. Nothing is sent anywhere else.
- Your login token stays in memory: never saved, never logged.
- One booking at a time, with automatic slow-down if the site pushes back.
- Only favourites, nicknames, your times and the place list are stored (in your browser, harmless).
- Unofficial tool on an undocumented API: it can break when the site changes, and bulk booking may go against the university's rules. Read `content.js` (one file) before you trust it, and install only from this repo.

<details>
<summary>Security notes (what is true and what is not)</summary>

- The extension runs in the page's own context (it has to, to see the site's requests). Scripts of the booking site can therefore in principle see what it sees. The site's normal login already exposes the token to them, so this adds little, but it is not a sandbox.
- The panel sits in a closed shadow root. That only stops accidental interference, it is **not** a security boundary. Buttons react to real clicks only.
- Server text shown in the panel is shortened and long token-like strings are hidden. The panel is built without `innerHTML`.
- Everything coming from the server (names, codes, timezones, ids) is checked for shape. The reservation id used by Undo must look like an id. If the availability check fails, nothing is booked.
- `sessionStorage` holds the ids for Undo (this tab only). `localStorage` holds favourites, nicknames, times and the place list.
- Never commit HAR files: they contain a live session token (`*.har` is in `.gitignore`).
</details>

<details>
<summary>How it works (for the curious)</summary>

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
- `places.js` is the shipped list (codes, names, timezones, kinds). Refresh it after a scan with *Codes & list export → Download the list as places.js* and commit it.
</details>

## Another Smartway2 site?
Change the address under `"matches"` in `manifest.json` (e.g. `"https://yourorg.smartway2book.com/*"`) and reload the extension. Untested outside the author's site: try **Check free** first.

## License
MIT, see [LICENSE](LICENSE). Provided as is, at your own risk.
