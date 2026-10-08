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


A small Chrome extension for `uob.smartway2book.com`: pick several days and desks (or rooms)
and book them all in one go. Vanilla JavaScript, no libraries, no build step.

**What it can do**
- Book **desks and rooms** for many days at once (one desk per day, or several desks, or a room with a title).
- Month **calendar** with multi-select, weekday shortcuts, and **green days** where you already have a desk (hover to see which).
- **Check free** before booking, and automatic skipping of desks that are already taken.
- **Favourites with nicknames** ("Window seat"), remembered **working hours**, and a cached desk list for a fast start.
- **Undo** for the bookings you just made (works after a reload), and automatic **check-in**.
- Gentle with the site: parallel reads, one booking at a time, automatic slow-down when the site says "too many requests".

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
- Rooms list empty? The site only tells the extension about your rooms through its own "Book a Room" search. Open that once, then reload. Open the browser console (F12) and look for the line `[Desk Batch Booker] your profile lists … room codes`: if it says 0 room codes, that is why.
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
1. Pick **Desks** or **Rooms** with the switch at the top.
2. **Days**: click days in the calendar. Click a weekday header (Mo, Tu, …) to toggle that weekday for the whole month. In Desks mode, green days are days where you already have a desk. In Rooms mode, a small dot marks days where you already have a room; hover to see the times and room names.
3. **Time**: start and end (the place's local wall-clock time, e.g. 09:00 to 17:00; rooms can use any quarter hour). Your times are remembered for next time.
4. **Desks / rooms**: the filter, the **★ only** chip and **Pick all favourites** sit on top of the list. Click a row to pick it (no Cmd/Ctrl needed). Hover a row for **★** (favourite) and **✎** (nickname, e.g. "Window seat": Enter saves, Esc cancels). The greyed **Codes** field is folded away (you rarely need it).
   **Scan all desks and rooms (one time):** the lists normally come from the filters the site keeps in your profile, so they can be incomplete. This button walks through every code once and keeps all desks and rooms it finds, saved in your browser for good. It takes a minute or two and only needs to run once per browser; afterwards the button turns into a "✓ scanned" note.
   **Shipped list:** `places.js` holds the desks and rooms known to the author (codes and names only, no personal data), so everybody starts with a full list even before a scan. Whoever has scanned everything can refresh it: open **Codes & list export**, press **Download the list as places.js**, replace the file in the extension folder and commit it. Rooms and desks are recognised by the site's own resource categories ("desk" and "meeting-room"), so Study Spaces, Training Rooms and the like are included.
5. **Rooms only:** give the booking a **title**. Rooms are an addition built from one captured booking and are less tested than desks: try a single booking first.
6. The line above the buttons says how many bookings this makes. The buttons stay greyed out until you have picked days and something to book.
7. **Check free** shows which combinations are already taken. Nothing is booked.
8. **Before anything is booked or checked**, the extension asks the site for the current name of every picked code and compares it with the stored one. If a code now means a different place (renamed or reused), nothing is booked: the list is updated and you pick again.
9. **Book all** skips taken ones, then books one after the other ("Booking 2 of 5…"). There is no confirm dialog, so glance at the "N bookings" line first. **Stop** ends the run before the next booking.
9. **Undo bookings** cancels everything this tool booked in this browser tab (it also works after a reload).
10. **Check-in is automatic**: every minute, while the booking page is open, everything open for check-in is checked in. **Check in now** does it immediately.

## Safety (on purpose)
- There is no fixed cap on the number of bookings or on how far ahead you can book: the site decides what it accepts, and its refusal shows up in the log. Dates in the past are not allowed.
- One request at a time with a short pause. If the site says "too many requests" the tool waits longer and retries; one failed booking is logged and the run goes on, but **two failures in a row end the run**.
- Booking has no confirm dialog: use **Check free** first, **Stop** to interrupt, and **Undo bookings** to cancel (it keeps working after a page reload, in the same tab). Undoing does ask first.
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
| Your bookings (green days) | `POST /webapi/reservations/loadreservationoccurrences` (one request per day) |
| Desk names | `POST /webapi/reporting/getdata/` (view `ts_rep_officeclosure_hierarchy`) |
| Desk list, room list, your user id | read from the site's own `SaveUserProfile` request on page load (so it works for any account) |

Things that were learned the hard way:
- `/webapi/...` calls also need the token as an `auth_token` header; `/Services/...` calls only need it in the body.
- Times are sent as wall-clock time written as UTC (`09:00` → `09:00Z`); the site converts using the `timezone` field. Do **not** use the browser's timezone.
- The site's weekday numbering is Monday = 1 … Sunday = 7.
- A room booking is the same `Save6` request as a desk booking, with the room's code, your own title, `showTimeAsFree: false` and a few empty form fields.
- How far ahead you may book is set by the site per user group (each place carries "Days in advance" rules), so there is no limit in the tool itself.

## Before installing (please read)
- **Unofficial.** This tool uses the booking site's undocumented API. It may break at any time, may go against the site's terms, and could get an account flagged. You use it at your own risk; no warranty. Follow your organisation's desk-booking rules.
- **Only install from a source you trust.** An extension that runs on the booking site can act as you. Read `content.js` first (one file, no network calls except to the booking site itself).
- **Get it from git, not from a random zip:** `git clone`, and ideally check out a tagged release. If someone sends you a zip, compare it with the repository.
- **Uninstall:** `chrome://extensions` → Remove.

## Security notes (what is true, and what is not)
- The session token is kept in memory only. It is never stored, never logged, and only ever sent back to the booking site (all requests use relative addresses on the site's own origin). Server error text shown in the panel is shortened and long token-like strings are hidden.
- **The extension runs in the page's own context** (it has to, to see the site's requests). Scripts of the booking site itself can therefore in principle see what the extension sees. The site's normal login already exposes the token to those scripts, so this adds little, but it is not a sandbox.
- The panel sits in a closed shadow root, but that only keeps the page's styles and scripts from interfering by accident: it is **not** a security boundary. Buttons therefore only react to real clicks, not to clicks made by scripts.
- Only these are stored, in the site's `localStorage` (readable by scripts of that site, harmless): favourites with their nicknames, your chosen start/end time, and a cache of desk and room names. Reservation ids for Undo live in `sessionStorage` (this tab only).
- Safeguards: every value is validated before it is sent; the desk list, names and timezones from the server are checked for shape; the reservation id used by Undo is read from the answer's `id` field and must look like an id; if the availability check fails, nothing is booked.
- The panel is built without `innerHTML`.
- Never commit HAR files: they contain a live session token (`*.har` is in `.gitignore`).

## License
MIT, see [LICENSE](LICENSE). Provided as is, at your own risk.
