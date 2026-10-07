# Desk Batch Booker

> ## 🎧 Vibe coded. Use at your own risk.
> This whole thing was **vibe coded** together with an AI, in one long, happy, caffeinated session.
> It works on my machine, on my desk, on my Tuesday. 🪑✨
> It has **not** been audited by a professional, only poked at by a few AI "security experts"
> (which is fun, but not the same thing).
>
> - If it books the wrong desk, the wrong day, or all of the desks: that's on you, friend. 🫡
> - If the site changes and everything breaks: that's on the site. (Or the vibes.)
> - Read the code before you trust it. It's one file. It's friendly. It doesn't bite (much).
> - Licensed MIT, "as is", no warranty, no refunds, no desk guarantees.
>
> **Be kind:** don't hoard desks you won't use. Your colleagues would also like a window seat. 🌤️


A small Chrome extension for `uob.smartway2book.com`: pick several days and desks
and book them all in one go. Vanilla JavaScript, no libraries, no build step.

## Install
You need Google Chrome (or another Chromium browser such as Edge or Brave), plus `git` to download it.

**1. Download it** (copy into a terminal; put it wherever you like, Chrome reads the folder from there, so don't delete it afterwards):
```sh
git clone https://github.com/nikopallas/bristol-desk-batch-booker.git
cd bristol-desk-batch-booker
pwd   # shows the folder path you will pick in step 2
```
No git? Use the green **Code → Download ZIP** button on GitHub and unpack it. (See "Before installing" below for why git is preferred.)

**2. Load it into Chrome**
1. Open `chrome://extensions` (paste it in the address bar).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `bristol-desk-batch-booker` folder.

**3. Use it**
1. Open `https://uob.smartway2book.com`, log in, and click around once (open a menu, say) so the extension can see your session.
2. A panel appears bottom-right. If it doesn't, reload the page.

**Tips**
- **Updating:** `git pull` in the folder, press the reload (circular arrow) button on the extension's card in `chrome://extensions`, then reload the booking site.
- **Auto check-in** only works while a booking-site tab is open and logged in (it can be a background tab). Keep one pinned.
- Chrome may show a "disable developer mode extensions" reminder at start-up: that is normal for unpacked extensions.
- Panel missing or desks list stuck on "Loading your desks...": reload the page and click something on it once.
- Uninstall: `chrome://extensions` → **Remove**.

## Sharing with others
Nothing in the code is personal: your user id, your desk list, the site's version header and each
desk's timezone are all read from the site while you use it. Colleagues can:
1. Get this folder (`git clone` it or download it as a zip and unpack it).
2. Follow **Install** above with their own login.

Chrome may show a "disable developer mode extensions" reminder at start-up: that is normal for unpacked extensions.
Everyone's favourites are stored in their own browser only.

Using another Smartway2 site (another organisation)? Change the address in `manifest.json` under
`"matches"` to that site (e.g. `"https://yourorg.smartway2book.com/*"`), then reload the extension.
The requests are the same platform's, but it is untested outside the author's site: try **Check free** first.

## Use
The **–** button in the panel's corner minimises it (progress stays visible); **+** restores it.
1. **Days**: click days in the calendar. Click a weekday header (Mo, Tu, …) to toggle that weekday for the whole month.
2. **Time**: start and end (the desk's local wall-clock time, e.g. 09:00 to 17:00).
3. **Desks**: filter and pick desks in the list (Cmd/Ctrl-click for several). Use ★ to save favourites. The picked desks are listed by name below the list.
4. The line above the buttons says how many bookings this makes. The buttons stay greyed out until you have picked days and desks (and while the count is over the limit).
5. **Check free** shows which desk/day combinations are already taken. Nothing is booked.
6. **Book all** skips taken desks, then books one after the other (no confirm dialog: check the "N bookings" line above the buttons first) ("Booking 2 of 5…"). **Stop** ends the run before the next booking.
7. **Undo bookings** cancels everything this tool booked since the page was loaded.
8. **Check-in is automatic**: every minute, while the booking page is open, everything open for check-in is checked in. **Check in now** does it immediately.

## Safety limits (on purpose)
- At most 20 bookings per run, dates at most 120 days ahead, none in the past.
- One request at a time with a short pause; the run stops at the first failed booking.
- Booking has no confirm dialog: use **Check free** first, **Stop** to interrupt, and **Undo bookings** to cancel. Undoing does ask first.
- Please check the university's terms before booking many desks; don't hold desks you won't use.

## How it works (`content.js`)
It runs inside the page (`"world": "MAIN"`) and wraps `fetch` / `XMLHttpRequest` so it can see
the session `token` the site sends with its own requests. It then replays the same requests the
site makes (found in a HAR export):

| Purpose | Request |
|---|---|
| Book | `POST /Services/ReservationsWS.svc/Save6` |
| Cancel | `POST /Services/ReservationsWS.svc/Delete` |
| Who is busy | `POST /Services/ReservationsWS.svc/GetReservationTimesByLocationIds` |
| Desk names | `POST /webapi/reporting/getdata/` (view `ts_rep_officeclosure_hierarchy`) |
| Desk list, your user id | read from the site's own `SaveUserProfile` request on page load (so it works for any account) |

Things that were learned the hard way:
- `/webapi/...` calls also need the token as an `auth_token` header; `/Services/...` calls only need it in the body.
- Times are sent as wall-clock time written as UTC (`09:00` → `09:00Z`); the site converts using the `timezone` field. Do **not** use the browser's timezone.
- The site's weekday numbering is Monday = 1 … Sunday = 7.

## Before installing (please read)
- **Unofficial.** This tool uses the booking site's undocumented API. It may break at any time, may go against the site's terms, and could get an account flagged. You use it at your own risk; no warranty. Follow your organisation's desk-booking rules.
- **Only install from a source you trust.** An extension that runs on the booking site can act as you. Read `content.js` first (one file, no network calls except to the booking site itself).
- **Get it from git, not from a random zip:** `git clone`, and ideally check out a tagged release. If someone sends you a zip, compare it with the repository.
- **Uninstall:** `chrome://extensions` → Remove.

## Security notes (what is true, and what is not)
- The session token is kept in memory only. It is never stored, never logged, and only ever sent back to the booking site (all requests use relative addresses on the site's own origin). Server error text shown in the panel is shortened and long token-like strings are hidden.
- **The extension runs in the page's own context** (it has to, to see the site's requests). Scripts of the booking site itself can therefore in principle see what the extension sees. The site's normal login already exposes the token to those scripts, so this adds little, but it is not a sandbox.
- The panel sits in a closed shadow root, but that only keeps the page's styles and scripts from interfering by accident: it is **not** a security boundary. Buttons therefore only react to real clicks, not to clicks made by scripts.
- Only favourites (desk codes) are stored, in the site's `localStorage` (readable by scripts of that site, harmless for desk codes).
- Safeguards: every value is validated before it is sent; the desk list, names and timezones from the server are checked for shape; the reservation id used by Undo is read from the answer's `id` field and must look like an id; if the availability check fails, nothing is booked.
- The panel is built without `innerHTML`.
- Never commit HAR files: they contain a live session token (`*.har` is in `.gitignore`).

## License
MIT, see [LICENSE](LICENSE). Provided as is, at your own risk.
