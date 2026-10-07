// Desk Batch Booker
// Everything lives inside one function, so nothing leaks onto `window`.
(function () {
  // Keep the browser's own versions of a few functions, taken at document_start before page scripts run,
  // so a page script that replaces them later cannot change what our panel does.
  const nativeConfirm = window.confirm.bind(window);
  const nativeAttachShadow = Element.prototype.attachShadow;

  // ---------- Section 1: learn the session token ----------
  // The site sends a "token" in the JSON body of its own requests.
  // We watch those requests and remember the latest token.
  // The token stays in this variable only: never stored, never logged in full.
  let token = null;

  // Also learned from the site, so the tool works for any account, not just the author's:
  let userId = null; // your user id, read from the profile the site saves on page load
  let siteVersion = "2.41.103"; // the "smartway2-version" header; copied from the site's own requests when seen
  const DEFAULT_TIMEZONE = "GMT Standard Time"; // used only if a desk doesn't tell us its own

  const TOKEN_PATTERN = /"token"\s*:\s*"([A-Za-z0-9+\/=_-]{20,512})"/;

  // Only the site's own API calls may teach us anything (not analytics, not some other script's request).
  function isSiteApiUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin === location.origin && /^\/(Services|webapi|Listener)\//.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  // Runs task(item) for every item, a few at a time instead of one after the other. Results keep the order.
  // Only used for requests that just READ (names, availability, your bookings), never for booking.
  async function mapParallel(items, limit, task) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  // Server text may end up in the log or console. Cut it short and hide anything that looks like a token.
  const redact = (text, maxLength = 200) => String(text).slice(0, maxLength).replace(/[A-Za-z0-9+\/=_-]{40,}/g, "***");

  // Every request that needs the login goes through this first.
  function requireSession() {
    if (!token || !userId) throw new Error("Not connected to the site (session unknown). Reload the page and try again.");
  }

  function rememberVersion(url, value) {
    if (typeof value === "string" && /^[\d.]+$/.test(value) && isSiteApiUrl(url)) siteVersion = value;
  }

  // Desk names by code, e.g. { 660: "3.210-028, Main Building, Third Floor" }.
  // Filled once we know which desks your account can see (see rememberDesks below).
  const deskNames = Object.create(null); // no prototype: a hostile key like "__proto__" is just a key
  const deskTimezones = Object.create(null); // timezone of each desk, e.g. { 660: "GMT Standard Time" }
  const timezoneOf = (tableId) => deskTimezones[tableId] || DEFAULT_TIMEZONE;
  let deskCountSeen = 0;

  // Desk names hardly ever change, so the last answer is kept (in this site's localStorage): the desk list
  // then shows up at once on the next visit, and is refreshed in the background.
  const DESK_CACHE_KEY = "deskBatchBooker.desks";
  function loadDeskCache() {
    try {
      const saved = JSON.parse(localStorage.getItem(DESK_CACHE_KEY));
      for (const [code, name] of Object.entries(saved.names).slice(0, 3000)) {
        if (/^\d{1,6}$/.test(code) && typeof name === "string" && name.length <= 200) deskNames[code] = name;
      }
      for (const [code, zone] of Object.entries(saved.timezones).slice(0, 3000)) {
        if (/^\d{1,6}$/.test(code) && typeof zone === "string" && /^[\w .+-]{1,64}$/.test(zone)) deskTimezones[code] = zone;
      }
    } catch {} // nothing saved yet, or unreadable: we simply ask the site
  }
  function saveDeskCache() {
    try {
      localStorage.setItem(DESK_CACHE_KEY, JSON.stringify({ names: deskNames, timezones: deskTimezones }));
    } catch {}
  }
  loadDeskCache();
  let refreshDeskList = () => {}; // the panel replaces this once it exists
  let refreshBookedDays = () => {}; // same: re-checks which days already have a desk of yours
  let deskLoadFailed = false; // true if loading your desks failed (so the panel can say so)

  function inspectRequest(url, body) {
    if (typeof body !== "string" || !isSiteApiUrl(url)) return;
    const match = body.match(TOKEN_PATTERN);
    if (match && match[1] !== token) {
      token = match[1];
    }
    if (token && url.includes("SaveUserProfile")) rememberDesks(body);
  }

  // The site saves your profile on every page load. It contains your user id and the list of
  // desk codes your account may book (the "desk search" filter, form 1). We reuse both.
  function rememberDesks(body) {
    let profile;
    try {
      profile = JSON.parse(JSON.parse(body).profile_value);
    } catch {
      return; // not the shape we expect: ignore
    }
    if (Number.isInteger(profile.uid)) userId = profile.uid;
    const ids = profile.cfk1 && profile.cfk1.locationfilter;
    if (!Array.isArray(ids) || ids.length === deskCountSeen) return; // nothing new
    deskCountSeen = ids.length;
    lookupNames(ids.filter(Number.isInteger))
      .then((names) => {
        for (const code of Object.keys(deskNames)) delete deskNames[code]; // forget desks you can no longer see
        Object.assign(deskNames, names);
        saveDeskCache();
        refreshDeskList();
        refreshBookedDays(); // the session is known now, so we can ask for your bookings
      })
      .catch((error) => {
        deskLoadFailed = true;
        console.log("[Desk Batch Booker] could not load desk names:", redact(error));
      });
  }

  // A rejected login means the token is dead: forget it.
  function forgetTokenIfRejected(status) {
    if (status === 401 || status === 403) token = null;
  }

  // Wrap fetch. We only look at the request, then pass everything on unchanged.
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input.url || String(input);
      inspectRequest(url, init && init.body);
      const headers = init && init.headers;
      const version = headers && (headers["smartway2-version"] || (headers.get && headers.get("smartway2-version")));
      rememberVersion(url, version);
    } catch {} // never let our code break the site
    const promise = originalFetch.apply(this, arguments);
    promise.then((response) => forgetTokenIfRejected(response.status)).catch(() => {});
    return promise;
  };

  // Wrap XMLHttpRequest: remember the URL on open(), look at the body on send().
  const xhrUrls = new WeakMap(); // which URL each XMLHttpRequest was opened with
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    xhrUrls.set(this, url);
    return originalOpen.apply(this, arguments);
  };

  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      if (name.toLowerCase() === "smartway2-version") rememberVersion(xhrUrls.get(this), value);
    } catch {}
    return originalSetHeader.apply(this, arguments);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    try {
      inspectRequest(xhrUrls.get(this), body);
      this.addEventListener("loadend", () => forgetTokenIfRejected(this.status));
    } catch {}
    return originalSend.apply(this, arguments);
  };

  // ---------- Section 2: book one desk on one day ----------

  // The server wants dates as "/Date(<milliseconds since 1970>)/"
  const toServerDate = (ms) => `/Date(${ms})/`;

  const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  // Asks the site for the names of tables (same request the site makes, see the HAR).
  // Returns { 660: "3.210-028, Main Building, Third Floor", ... }.
  // The answer has three rows per code (building, floor, the desk itself);
  // we keep only the desk row. Floors and buildings therefore get no name.
  async function lookupNames(ids) {
    requireSession();
    const names = Object.create(null);
    const chunks = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100)); // 100 codes per request

    await mapParallel(chunks, 3, async (chunk) => {
      // "/webapi/..." requests also want the token as an "auth_token" header (the /Services/ ones don't).
      const response = await originalFetch("/webapi/reporting/getdata/", {
        method: "POST",
        headers: { "content-type": "application/json", "smartway2-version": siteVersion, auth_token: token },
        body: JSON.stringify({
          viewname: "ts_rep_officeclosure_hierarchy",
          filter: [{ field: "locationid", operator: "anyof", values: chunk, includenull: false }],
          token: token,
        }),
      });
      forgetTokenIfRejected(response.status);
      const text = await response.text();
      if (!response.ok || !text) throw new Error(`name lookup failed: HTTP ${response.status}, answer: "${redact(text, 100)}"`);
      for (const row of JSON.parse(text).view || []) {
        // Only accept rows of the expected shape (text name, whole-number code).
        if (row.offset === 0 && row.location_type === "Location" && Number.isInteger(row.locationid) && typeof row.name === "string") {
          names[row.locationid] = row.name;
          if (typeof row.timezone === "string" && /^[\w .+-]{1,64}$/.test(row.timezone)) deskTimezones[row.locationid] = row.timezone;
        }
      }
    });
    return names;
  }

  // Name of one table, or null if it doesn't exist. Uses the list we already have if possible.
  async function lookupTableName(tableId) {
    if (!deskNames[tableId]) Object.assign(deskNames, await lookupNames([tableId]));
    return deskNames[tableId] || null;
  }

  // "2026-10-06" + "09:00" -> milliseconds of 09:00Z (see the note in buildBooking)
  const wallClockMs = (date, time) => Date.parse(`${date}T${time}:00Z`);

  // date = "2026-10-06", start / end = "09:00", tableId = 660, tableName = "3.210-028, ..."
  function buildBooking(date, start, end, tableId, tableName) {
    // The site wants the WALL-CLOCK time written as if it were UTC ("09:00" -> 09:00Z) and then
    // converts it itself using the "timezone" field below (in summer it stores 08:00Z = 09:00 BST).
    // So we must NOT use the browser's own timezone here. (Checked against the HAR.)
    const startMs = wallClockMs(date, start);
    const endMs = wallClockMs(date, end);

    const dayStart = new Date(`${date}T00:00:00Z`);
    const jsDay = dayStart.getUTCDay(); // JS: 0 = Sunday ... 6 = Saturday

    // The site's own request has one "repeaton<day>" flag, true only for the booking day.
    const repeatFlags = {};
    WEEKDAY_NAMES.forEach((name, i) => (repeatFlags["repeaton" + name] = i === jsDay));

    return {
      fields: "{}",
      locations: [tableId],
      services: [],
      categories: [],
      notes: "",
      occurrenceDate: toServerDate(0),
      startDate: toServerDate(startMs),
      endDate: toServerDate(endMs),
      preparationTime: 0,
      cleanupTime: 0,
      customcleanuptime: 0,
      custompreparationtime: 0,
      orders: [],
      subject: `Desk Booking: ${tableName}`, // same title the site uses
      exceptions: [],
      showTimeAsFree: true,
      reservationType: 0,
      privacy: 4,
      hosts: [userId],
      requiredAttendees: [],
      optionalAttendees: [],
      acceptedAttendees: [],
      attendeeLocations: [
        { userid: userId, locationid: 0, physicallocation: 1, attendeetype: 1, collabgroups: [], directassign: true },
      ],
      // Recurrence settings copied from the site: they describe a one-day booking.
      endby: toServerDate(dayStart.getTime()),
      firstdayofweek: 1,
      week: 1,
      weekday: jsDay || 7, // the site counts Monday = 1 ... Sunday = 7
      month: dayStart.getUTCMonth() + 1,
      frequency: 1,
      day: dayStart.getUTCDate(),
      pattern: 1,
      recurrencetype: 0,
      range: 1,
      endafter: 2,
      ...repeatFlags,
      timezone: timezoneOf(tableId),
      generateHtmlOutput: false,
      token: token,
    };
  }

  // Sends the booking. Uses the ORIGINAL fetch so our own request isn't inspected by our wrapper.
  async function sendBooking(date, start, end, tableId, tableName) {
    requireSession();
    const response = await originalFetch("/Services/ReservationsWS.svc/Save6", {
      method: "POST",
      headers: { "content-type": "application/json", "smartway2-version": siteVersion },
      body: JSON.stringify(buildBooking(date, start, end, tableId, tableName)),
    });
    forgetTokenIfRejected(response.status);
    return { status: response.status, text: await response.text() };
  }

  // Which of these tables are already reserved in that time window? Returns a Set of table codes (as text).
  // Same request the site makes when it shows availability (see the HAR): an empty answer means all free.
  async function findTakenTables(date, start, end, tableIds) {
    requireSession();
    const response = await originalFetch("/Services/ReservationsWS.svc/GetReservationTimesByLocationIds", {
      method: "POST",
      headers: { "content-type": "application/json", "smartway2-version": siteVersion },
      body: JSON.stringify({
        token: token,
        locationIds: tableIds,
        startDate: toServerDate(wallClockMs(date, start)),
        endDate: toServerDate(wallClockMs(date, end)),
        timezone: timezoneOf(tableIds[0]), // one timezone per request: fine while all picked desks share one
      }),
    });
    forgetTokenIfRejected(response.status);
    const text = await response.text();
    if (!response.ok) throw new Error(`availability check failed: HTTP ${response.status}, answer: "${redact(text, 100)}"`);
    return new Set(JSON.parse(text).map((row) => String(row.locationid)));
  }

  // Which desk (name) do you have on one day, or null? Same request the site's own agenda makes
  // ("my reservations", range 1 = one day). dayStart is local midnight of that day as an ISO time.
  async function loadMyDeskOfDay(dayStart) {
    requireSession();
    const response = await originalFetch("/webapi/reservations/loadreservationoccurrences", {
      method: "POST",
      headers: { "content-type": "application/json", "smartway2-version": siteVersion, auth_token: token },
      body: JSON.stringify({
        locationids: [], range: 1, maxperday: 0, limitoverlaps: false,
        showonlymyreservations: true, date: dayStart, timezone: "UTC",
      }),
    });
    forgetTokenIfRejected(response.status);
    const text = await response.text();
    if (!response.ok) throw new Error(`could not load your bookings: HTTP ${response.status}`);
    for (const reservation of JSON.parse(text)) {
      if (reservation.deleted || !Array.isArray(reservation.locations)) continue;
      // Only desks count (not meeting rooms etc.): the location must be one of our known desks.
      const deskCode = reservation.locations.find((code) => deskNames[code]);
      if (deskCode !== undefined) return deskNames[deskCode];
    }
    return null;
  }

  // The id of the new reservation is the top-level "id" of the Save6 answer (e.g. "E8ZYS").
  // Anything that doesn't look like an id is refused, so Undo can never be pointed at something else.
  function readReservationId(text) {
    try {
      const id = JSON.parse(text).id;
      return typeof id === "string" && /^[A-Za-z0-9-]{1,32}$/.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  // Cancels a booking. Same request the site sends when you press "cancel" (see the HAR).
  async function deleteBooking(reservationId) {
    requireSession();
    const response = await originalFetch("/Services/ReservationsWS.svc/Delete", {
      method: "POST",
      headers: { "content-type": "application/json", "smartway2-version": siteVersion },
      body: JSON.stringify({ reservationId: reservationId, occurrenceDate: toServerDate(0), token: token }),
    });
    forgetTokenIfRejected(response.status);
    return { status: response.status, text: await response.text() };
  }

  // Today's reservations that can be checked in right now. Same request the site's own "my reservations" view makes.
  async function findCheckInnable() {
    requireSession();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const response = await originalFetch("/webapi/reservations/loadreservationoccurrences", {
      method: "POST",
      headers: { "content-type": "application/json", "smartway2-version": siteVersion, auth_token: token },
      body: JSON.stringify({ locationids: [], range: 1, maxperday: 0, limitoverlaps: false, showonlymyreservations: true, date: midnight.toISOString(), timezone: "UTC", token: token }),
    });
    forgetTokenIfRejected(response.status);
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${redact(text, 100)}`);
    const now = Date.now();
    return JSON.parse(text).filter((r) =>
      typeof r.id === "string" && /^[A-Z0-9]{3,12}$/.test(r.id) &&
      r.checkinenabled && !r.checkedinby && !r.terminated && !r.deleted &&
      now >= Date.parse(r.earliestcheckin) && now < Date.parse(r.enddate)); // earliestcheckin 0001-... = no limit
  }

  async function checkIn(reservationId) {
    requireSession();
    const response = await originalFetch("/Services/ReservationsWS.svc/CheckIn2", {
      method: "POST",
      headers: { "content-type": "application/json", "smartway2-version": siteVersion },
      body: JSON.stringify({ reservationId, occurrenceDate: toServerDate(0), latitude: 0, longitude: 0, moveStart: false, token }),
    });
    forgetTokenIfRejected(response.status);
    return { status: response.status, text: await response.text() };
  }

  // ---------- Section 3: validation ----------
  // No cap on how many bookings or how far ahead: the site decides what it accepts, and a run stops
  // by itself when bookings keep failing (see the booking loop).
  const PAUSE_BETWEEN_REQUESTS_MS = 300; // normal pause between requests; grows when the site pushes back
  const MAX_PAUSE_MS = 10000;
  const MAX_RETRIES_WHEN_THROTTLED = 3;

  const splitList = (text) => [...new Set(text.split(/[\s,]+/).filter(Boolean))]; // also removes duplicates

  // "2026-10-06" must be a real calendar date, today or later.
  function checkDate(text) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return `"${text}" is not a date like 2026-10-06`;
    const [y, m, d] = text.split("-").map(Number);
    const real = new Date(y, m - 1, d);
    if (real.getFullYear() !== y || real.getMonth() !== m - 1 || real.getDate() !== d) {
      return `"${text}" is not a real calendar date`;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysAhead = Math.round((real - today) / 86400000);
    if (daysAhead < 0) return `${text} is in the past`;
    return null; // null = fine
  }

  const checkTable = (text) => (/^\d{1,6}$/.test(text) ? null : `"${text}" is not a table code (digits only)`);

  function checkTimes(start, end) {
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return "Please fill in both times";
    if (!Number.isFinite(wallClockMs("2000-01-01", start)) || !Number.isFinite(wallClockMs("2000-01-01", end))) return "Those are not real times";
    return start < end ? null : "Start time must be before end time";
  }

  // ---------- Section 4: the panel ----------
  // Built with createElement + textContent only (never innerHTML), because the log shows server text.
  // Lives in a closed shadow root: this keeps the page's styles and scripts from interfering by accident.
  // It is NOT a security boundary (see README): buttons therefore only react to real clicks (isTrusted).

  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Look of the panel. One stylesheet inside the shadow root keeps the code below free of style strings.
  const PANEL_CSS = `
    .box {
      --text:#1d1d1f; --muted:#86868b; --line:#e5e5ea; --fill:#f5f5f7;
      --accent:#4f46e5; --accent-soft:#eceafd; --good:#188038; --warn:#b06000; --bad:#d93025;
      position:fixed; bottom:16px; right:16px; z-index:2147483647; width:340px; max-width:calc(100vw - 32px);
      max-height:calc(100vh - 32px); overflow:auto; box-sizing:border-box; padding:16px;
      background:#fff; color:var(--text); border-radius:16px;
      font:13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow:0 12px 40px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.05) }
    [hidden] { display:none !important }

    /* buttons: quiet grey by default, filled colour only for the main action */
    button { font:inherit; color:inherit; background:var(--fill); border:0; border-radius:8px; padding:6px 12px; cursor:pointer }
    button:hover:not(:disabled) { filter:brightness(.95) }
    button:disabled { opacity:.4; cursor:not-allowed }
    .primary { flex:1; background:var(--accent); color:#fff; font-weight:600 }
    .stop { background:var(--bad); color:#fff; font-weight:600 }
    .icon { width:28px; height:28px; padding:0; font-size:16px; line-height:1; background:none }
    .icon:hover:not(:disabled) { background:var(--fill); filter:none }
    .link { padding:2px 4px; background:none; color:var(--accent); font-size:12px }
    .link:hover:not(:disabled) { text-decoration:underline; filter:none }

    input, select { font:inherit; color:inherit; box-sizing:border-box; border:1px solid var(--line); border-radius:8px; padding:6px 8px; background:#fff }
    input:focus, select:focus { outline:2px solid var(--accent-soft); border-color:var(--accent) }
    select { padding:4px }
    option { padding:3px 6px; border-radius:6px }
    option:checked { background:var(--accent) linear-gradient(0deg, var(--accent), var(--accent)); color:#fff }
    .muted { background:var(--fill); color:var(--muted); border-color:transparent; font-size:12px }
    .wide { width:100% }

    .header { display:flex; justify-content:space-between; align-items:center }
    .header b { font-size:15px; font-weight:600 }
    .section { margin-top:16px }
    .label { display:block; margin-bottom:6px; font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--muted) }
    .hint { color:var(--muted); font-size:12px }
    .picked { max-height:4.5em; overflow:auto; margin-top:4px }
    .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:6px }
    .between { justify-content:space-between }
    .loading { display:flex; gap:8px; align-items:center; margin-top:10px; color:var(--muted); font-size:12px }
    .spinner { flex:none; width:12px; height:12px; border:2px solid var(--line); border-top-color:var(--accent); border-radius:50%; animation:spin .8s linear infinite }
    @keyframes spin { to { transform:rotate(360deg) } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation:none } }
    .status { margin-top:10px; padding:6px 10px; border-radius:8px; background:var(--accent-soft); color:var(--accent); font-weight:500 }

    /* calendar */
    .days { display:grid; grid-template-columns:repeat(7, 1fr); gap:2px; margin:4px 0; text-align:center }
    .weekday { padding:4px 0; background:none; color:var(--muted); font-size:11px; font-weight:600 }
    .weekday:hover:not(:disabled) { color:var(--accent); filter:none }
    .day { aspect-ratio:1; padding:0; border-radius:50%; background:none }
    .day:hover:not(:disabled) { background:var(--accent-soft); filter:none }
    .day.booked { background:#e6f4ea; color:var(--good); font-weight:600 }
    .day.booked:hover:not(:disabled) { background:#d2ebd9 }
    .day.on { background:var(--accent); color:#fff; font-weight:600 }
    .day.on.booked { box-shadow:inset 0 0 0 2px var(--good) } /* picked AND already booked: indigo with a green ring */
    .day:disabled { color:#c7c7cc; opacity:1 }

    /* log */
    .log { max-height:160px; overflow:auto; margin-top:14px; padding:8px 10px; background:var(--fill); border-radius:10px; font:12px/1.5 ui-monospace, Menlo, monospace }
    .log div { white-space:pre-wrap }
    .ok { color:var(--good) } .fail { color:var(--bad); font-weight:600 } .skip { color:var(--warn) }
  `;

  function buildPanel() {
    const box = el("div", { className: "box" });

    const startInput = el("input", { type: "time", value: "09:00" });
    const endInput = el("input", { type: "time", value: "17:00" });

    // Your usual working hours are remembered (in this site's localStorage), so a reload keeps them.
    const TIMES_KEY = "deskBatchBooker.times";
    try {
      const saved = JSON.parse(localStorage.getItem(TIMES_KEY));
      // Only accept real "HH:MM" values, in case the stored text was changed by something else.
      if (saved && /^\d{2}:\d{2}$/.test(saved.start) && /^\d{2}:\d{2}$/.test(saved.end)) {
        startInput.value = saved.start;
        endInput.value = saved.end;
      }
    } catch {} // storage blocked or broken: keep 09:00 to 17:00
    const saveTimes = () => {
      try {
        localStorage.setItem(TIMES_KEY, JSON.stringify({ start: startInput.value, end: endInput.value }));
      } catch {}
    };
    startInput.onchange = endInput.onchange = saveTimes;
    const calendar = el("div");
    // Greyed out (class "muted"): normally there is no need to touch it.
    const tablesInput = el("input", { className: "wide muted", placeholder: "filled in from your picks above" });
    const deskFilter = el("input", { className: "wide", placeholder: "Filter desks, e.g. 3.210-0" });
    const deskSelect = el("select", { className: "wide", multiple: true, size: 6 });
    const pickedSummary = el("div", { className: "hint picked" });
    const onlyFavouritesBox = el("input", { type: "checkbox" });
    const favouriteButton = el("button", { className: "link", textContent: "★ Favourite / unfavourite picked", title: "Adds the picked desks to your favourites, or removes them if they all are favourites already" });
    const pickFavouritesButton = el("button", { className: "link", textContent: "Pick all favourites" });
    const bookButton = el("button", { className: "primary", textContent: "Book all", title: "Books every picked desk on every picked day" });
    const checkButton = el("button", { textContent: "Check free", title: "Shows which desks are already taken. Books nothing." });
    const checkInButton = el("button", { textContent: "Check in now", title: "Checks in everything that is open for check-in" });
    const stopButton = el("button", { className: "stop", textContent: "Stop", hidden: true, title: "Stops before the next booking. Bookings already made stay (use Undo bookings)." });
    const undoButton = el("button", { textContent: "Undo bookings", hidden: true, title: "Cancels the bookings made by this tool in this browser tab (also after a reload)" });
    const planSummary = el("div", { className: "hint" });
    // Shown while the panel is still getting ready (connecting, loading desks, marking booked days).
    const loadingText = el("span");
    const spinner = el("span", { className: "spinner" });
    const loadingLine = el("div", { className: "loading", hidden: true }, spinner, loadingText);
    const statusLine = el("div", { className: "status", hidden: true }); // what is happening right now, also visible while minimised
    const logBox = el("div", { className: "log", hidden: true }); // only shown once there is something to say
    const minimiseButton = el("button", { className: "icon", textContent: "–", title: "Minimise / restore the panel" });

    // A labelled block, so every input has a visible name.
    const section = (label, ...children) =>
      el("div", { className: "section" }, el("span", { className: "label", textContent: label }), ...children);

    const body = el("div"); // everything except the header and status line, so minimising is one hidden flag
    body.append(
      section("Days", el("div", { className: "hint", textContent: "Click days. Click Mo, Tu, ... to pick that weekday all month. Green = you already have a desk." }), calendar),
      section("Time (desk's local time)", "From ", startInput, " to ", endInput),
      section("Desks", el("div", { className: "hint", textContent: "Cmd/Ctrl-click to pick several." }), deskFilter, deskSelect,
        el("div", { className: "row" }, el("label", {}, onlyFavouritesBox, " favourites only"), pickFavouritesButton, favouriteButton),
        pickedSummary),
      section("Desk codes", tablesInput),
      el("div", { className: "section" }, planSummary,
        el("div", { className: "row" }, checkButton, bookButton, stopButton, undoButton),
        el("div", { className: "row" }, checkInButton), el("div", { className: "hint", textContent: "Anything open for check-in is checked in automatically every minute while this page is open." })),
      logBox
    );
    box.append(
      el("div", { className: "header" }, el("b", { textContent: "Batch desk booking" }), minimiseButton),
      loadingLine, statusLine, body
    );
    minimiseButton.onclick = () => {
      body.hidden = !body.hidden;
      minimiseButton.textContent = body.hidden ? "+" : "–";
    };

    const log = (line, kind = "") => {
      logBox.hidden = false;
      logBox.append(el("div", { className: kind, textContent: line }));
      logBox.scrollTop = logBox.scrollHeight;
    };
    const clearLog = () => {
      logBox.replaceChildren();
      logBox.hidden = true;
      setStatus(""); // a new run starts with a clean slate
    };
    const setStatus = (text) => {
      statusLine.textContent = text;
      statusLine.hidden = !text;
    };

    // Buttons only work when they can: no booking without days and desks, and never over the safety limit.
    // The hint line says why, so a greyed-out button is never a mystery.
    let busy = false;
    const selectedDates = new Set(); // "2026-10-06" style strings; they stay selected when you change month
    function refreshButtons() {
      const days = selectedDates.size;
      const desks = splitList(tablesInput.value).length;
      const count = days * desks;
      const ready = count > 0;
      if (count === 0) planSummary.textContent = "Pick at least one day and one desk.";
      else planSummary.textContent = `${days} day(s) x ${desks} desk(s) = ${count} booking(s).`;
      bookButton.disabled = checkButton.disabled = busy || !ready;
      undoButton.disabled = checkInButton.disabled = busy;
    }
    const setBusy = (isBusy) => {
      busy = isBusy;
      refreshButtons();
    };

    // ----- date picker: a month calendar, click days to select / unselect them -----
    const firstOfShownMonth = new Date();
    firstOfShownMonth.setDate(1);

    const prevMonthButton = el("button", { className: "icon", textContent: "‹", title: "Previous month" });
    const nextMonthButton = el("button", { className: "icon", textContent: "›", title: "Next month" });
    const monthLabel = el("b");
    const clearDatesButton = el("button", { className: "link", textContent: "Clear", title: "Unselect all days" });
    const daysGrid = el("div", { className: "days" });
    const dateSummary = el("span", { className: "hint" });
    calendar.append(
      el("div", { className: "row between" }, prevMonthButton, monthLabel, nextMonthButton),
      daysGrid,
      el("div", { className: "row between" }, dateSummary, clearDatesButton)
    );

    const pad = (number) => String(number).padStart(2, "0");

    // Days on which you already have a desk: "2026-10-07" -> desk name. Filled by asking the site,
    // one request per day of the shown month (only days we haven't asked about yet, only once).
    const myDeskByDate = new Map();
    const askedDays = new Set();
    let askingNow = false;

    async function refreshMyDeskDays() {
      if (askingNow || !token || !userId) return;
      askingNow = true;
      try {
        for (;;) {
          const year = firstOfShownMonth.getFullYear();
          const month = firstOfShownMonth.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const pending = [];
          for (let day = 1; day <= daysInMonth; day++) {
            const text = `${year}-${pad(month + 1)}-${pad(day)}`;
            if (!askedDays.has(text) && checkDate(text) === null) pending.push({ text, day }); // past days are skipped
          }
          if (pending.length === 0) break;
          await mapParallel(pending, 4, async ({ text, day }) => {
            if (firstOfShownMonth.getMonth() !== month) return; // you moved to another month: start over there
            const name = await loadMyDeskOfDay(new Date(year, month, day).toISOString());
            if (name) myDeskByDate.set(text, name);
            askedDays.add(text);
          });
          drawCalendar();
        }
      } catch (error) {
        console.log("[Desk Batch Booker] could not mark your booked days:", redact(error)); // only cosmetic
      } finally {
        askingNow = false;
      }
    }
    refreshBookedDays = refreshMyDeskDays;

    // After Undo we no longer know which days changed, so ask again.
    const forgetMyDeskDays = () => {
      myDeskByDate.clear();
      askedDays.clear();
      drawCalendar();
    };

    function drawCalendar() {
      const year = firstOfShownMonth.getFullYear();
      const month = firstOfShownMonth.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const blanksBeforeFirst = (firstOfShownMonth.getDay() + 6) % 7; // the week starts on Monday
      monthLabel.textContent = firstOfShownMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

      // Only days that pass the same check as the booking itself can be picked.
      const bookable = (day) => checkDate(`${year}-${pad(month + 1)}-${pad(day)}`) === null;
      const dateText = (day) => `${year}-${pad(month + 1)}-${pad(day)}`;

      const cells = [];
      ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].forEach((label, weekdayIndex) => {
        const header = el("button", { className: "weekday", textContent: label, title: `Toggle every ${label} this month` });
        header.onclick = () => {
          const days = [];
          for (let day = 1; day <= daysInMonth; day++) {
            if ((blanksBeforeFirst + day - 1) % 7 === weekdayIndex && bookable(day)) days.push(dateText(day));
          }
          const allSelected = days.every((text) => selectedDates.has(text));
          days.forEach((text) => (allSelected ? selectedDates.delete(text) : selectedDates.add(text)));
          drawCalendar();
        };
        cells.push(header);
      });
      for (let i = 0; i < blanksBeforeFirst; i++) cells.push(el("span"));
      for (let day = 1; day <= daysInMonth; day++) {
        const text = dateText(day);
        const classes = ["day", selectedDates.has(text) && "on", myDeskByDate.has(text) && "booked"];
        const button = el("button", {
          className: classes.filter(Boolean).join(" "),
          textContent: day,
          disabled: !bookable(day),
          title: myDeskByDate.has(text) ? `You already have a desk: ${myDeskByDate.get(text)}` : "",
        });
        button.onclick = () => {
          if (selectedDates.has(text)) selectedDates.delete(text);
          else selectedDates.add(text);
          drawCalendar();
        };
        cells.push(button);
      }
      daysGrid.replaceChildren(...cells);
      refreshMyDeskDays(); // no-op while a check is already running or the session isn't known yet
      dateSummary.textContent = `${selectedDates.size} day(s) selected`;
      refreshButtons();
    }

    prevMonthButton.onclick = () => { firstOfShownMonth.setMonth(firstOfShownMonth.getMonth() - 1); drawCalendar(); };
    nextMonthButton.onclick = () => { firstOfShownMonth.setMonth(firstOfShownMonth.getMonth() + 1); drawCalendar(); };
    clearDatesButton.onclick = () => { selectedDates.clear(); drawCalendar(); };
    drawCalendar();

    // ----- desk picker -----
    const pickedCodes = new Set(); // codes chosen in the list (they stay chosen while you filter)

    // Favourites are just desk codes, remembered in this site's localStorage (no secrets in there).
    const FAVOURITES_KEY = "deskBatchBooker.favourites";
    let favourites = new Set();
    try {
      favourites = new Set(JSON.parse(localStorage.getItem(FAVOURITES_KEY)) || []);
    } catch {} // storage blocked or broken: start without favourites
    const saveFavourites = () => {
      try {
        localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...favourites]));
      } catch {}
    };

    // Show the picked desks by name (people remember names, not codes) and in the codes field.
    const showPickedInCodesField = () => {
      tablesInput.value = [...pickedCodes].join(", ");
      const names = [...pickedCodes].map((code) => deskNames[code] || code);
      pickedSummary.textContent = names.length ? `${names.length} picked: ${names.join("; ")}` : "No desks picked yet.";
      refreshButtons();
    };
    tablesInput.oninput = refreshButtons; // you may still type codes by hand

    refreshDeskList = () => {
      const filter = deskFilter.value.toLowerCase();
      const desks = Object.entries(deskNames)
        .filter(([, name]) => name.toLowerCase().includes(filter))
        .filter(([code]) => !onlyFavouritesBox.checked || favourites.has(code))
        .sort((a, b) => {
          const byFavourite = favourites.has(b[0]) - favourites.has(a[0]); // favourites first
          return byFavourite || a[1].localeCompare(b[1], undefined, { numeric: true });
        });
      if (Object.keys(deskNames).length === 0) {
        deskSelect.replaceChildren(el("option", { textContent: "Loading your desks... (reload the page if this stays empty)", disabled: true }));
        return;
      }
      deskSelect.replaceChildren(
        ...desks.map(([code, name]) =>
          el("option", { value: code, textContent: (favourites.has(code) ? "★ " : "") + name, selected: pickedCodes.has(code) })
        )
      );
    };
    deskFilter.oninput = onlyFavouritesBox.onchange = refreshDeskList;
    deskSelect.onchange = () => {
      for (const option of deskSelect.options) {
        if (option.selected) pickedCodes.add(option.value);
        else pickedCodes.delete(option.value);
      }
      showPickedInCodesField();
    };

    favouriteButton.onclick = () => {
      const picked = [...pickedCodes];
      const allAreFavourites = picked.length > 0 && picked.every((code) => favourites.has(code));
      picked.forEach((code) => (allAreFavourites ? favourites.delete(code) : favourites.add(code)));
      saveFavourites();
      refreshDeskList();
    };
    pickFavouritesButton.onclick = () => {
      favourites.forEach((code) => deskNames[code] && pickedCodes.add(code)); // only desks that exist
      showPickedInCodesField();
      refreshDeskList();
    };
    refreshDeskList();
    showPickedInCodesField();

    // ----- undo -----
    // Reservation ids made by this tool in this browser tab. sessionStorage keeps them across a reload
    // (and forgets them when the tab closes). They are only ids, never the token.
    const BOOKED_KEY = "deskBatchBooker.booked";
    const bookedIds = [];
    try {
      const saved = JSON.parse(sessionStorage.getItem(BOOKED_KEY)) || [];
      bookedIds.push(...saved.filter((id) => typeof id === "string" && /^[A-Za-z0-9-]{1,32}$/.test(id)));
    } catch {} // storage blocked or broken: Undo then only works until the next reload
    const updateUndoButton = () => {
      try {
        sessionStorage.setItem(BOOKED_KEY, JSON.stringify(bookedIds));
      } catch {}
      undoButton.hidden = bookedIds.length === 0;
      undoButton.textContent = `Undo bookings (${bookedIds.length})`;
    };
    updateUndoButton(); // shows the button again after a reload if this tab still has bookings

    undoButton.onclick = async (event) => {
      if (!event.isTrusted) return; // ignore clicks made by scripts, only real clicks count
      if (!nativeConfirm(`Cancel the ${bookedIds.length} booking(s) made with this tool in this tab?`)) return;
      setBusy(true);
      while (bookedIds.length > 0) {
        setStatus(`Cancelling... ${bookedIds.length} left.`);
        const id = bookedIds[0];
        try {
          const { status, text } = await deleteBooking(id);
          if (status !== 200) {
            log(`Could not cancel booking ${id} (HTTP ${status}): ${redact(text)}. Cancel it on the site, or try Undo again.`, "fail");
            break;
          }
          log(`Cancelled booking ${id}`, "ok");
          bookedIds.shift();
          updateUndoButton();
        } catch (error) {
          log(`Could not cancel booking ${id}: ${redact(error)}. Check your connection and try Undo again.`, "fail");
          break;
        }
        await sleep(PAUSE_BETWEEN_REQUESTS_MS);
      }
      setStatus(bookedIds.length ? `${bookedIds.length} booking(s) still not cancelled.` : "All cancelled.");
      setBusy(false);
      forgetMyDeskDays();
    };

    // ----- check-in -----
    async function runCheckIn() {
      if (!token || !userId) return log("Not connected to the site yet. Click something on the page once, then try again.", "fail");
      for (const r of await findCheckInnable()) {
        const { status, text } = await checkIn(r.id);
        log(status === 200 ? `Checked in: ${r.subject}` : `Check-in failed (HTTP ${status}): ${redact(text)}`, status === 200 ? "ok" : "fail");
        await sleep(PAUSE_BETWEEN_REQUESTS_MS);
      }
    }
    checkInButton.onclick = async (event) => {
      if (!event.isTrusted) return;
      clearLog();
      setBusy(true);
      try {
        await runCheckIn();
        if (logBox.hidden) log("Nothing to check in right now.");
      } catch (error) {
        log(`Check-in failed: ${redact(error)}`, "fail");
      } finally {
        setBusy(false);
      }
    };
    // ponytail: only runs while a booking tab is open; a failed round is just retried next minute
    setInterval(() => {
      if (token && userId && !busy) runCheckIn().catch(() => {});
    }, 60000);

    // ----- booking -----
    let stopRequested = false;
    stopButton.onclick = (event) => { if (event.isTrusted) stopRequested = true; };

    // Reads the form and checks it BEFORE any booking request is sent.
    // Returns the plan, or null after logging what is wrong.
    async function readPlan() {
      clearLog();
      if (!token || !userId) return log("Not connected to the site yet. Click something on the page once (open a menu, say), then try again.", "fail");

      const dates = [...selectedDates].sort();
      const tables = [...new Set(splitList(tablesInput.value).map((code) => (/^\d{1,6}$/.test(code) ? String(Number(code)) : code)))];
      const start = startInput.value;
      const end = endInput.value;

      const problems = [
        ...dates.map(checkDate),
        ...tables.map(checkTable),
        checkTimes(start, end),
        dates.length === 0 ? "Pick at least one date in the calendar" : null,
        tables.length === 0 ? "Pick at least one table" : null,
      ].filter(Boolean);
      if (problems.length) return problems.forEach((problem) => log(problem, "fail"));

      // Look up each table's name (this also proves the table exists).
      const tableNames = {};
      try {
        for (const table of tables) {
          tableNames[table] = await lookupTableName(Number(table));
          if (!tableNames[table]) return log(`Desk code ${table} was not found. Pick desks from the list instead.`, "fail");
        }
      } catch (error) {
        return log(`Could not look up the desks (${redact(error)}). Reload the page and try again.`, "fail");
      }

      // One availability request covers all desks, so they must share a timezone.
      if (new Set(tables.map((table) => timezoneOf(Number(table)))).size > 1) {
        return log("The picked desks are in different timezones. Book them in separate runs.", "fail");
      }

      const jobs = tables.flatMap((table) => dates.map((date) => ({ table: Number(table), name: tableNames[table], date })));
      return { dates, tables, start, end, tableNames, jobs };
    }

    // Asks the site which jobs are already reserved. Returns a Set of "table|date" keys.
    async function findTakenJobs(plan) {
      const taken = new Set();
      let done = 0;
      await mapParallel(plan.dates, 4, async (date) => {
        const busyTables = await findTakenTables(date, plan.start, plan.end, plan.tables.map(Number));
        busyTables.forEach((table) => taken.add(`${table}|${date}`));
        setStatus(`Checking availability... ${++done} of ${plan.dates.length} days`);
      });
      return taken;
    }
    const jobKey = (job) => `${job.table}|${job.date}`;

    checkButton.onclick = async (event) => {
      if (!event.isTrusted) return;
      setBusy(true);
      try {
        const plan = await readPlan();
        if (!plan) return;
        const taken = await findTakenJobs(plan);
        plan.jobs.forEach((job) => {
          const isTaken = taken.has(jobKey(job));
          log(`${isTaken ? "Taken" : "Free "} ${job.date}  ${job.name}`, isTaken ? "skip" : "ok");
        });
        log("(This is how it looks right now. Someone may still book a desk after this check.)");
      } catch (error) {
        log(`Availability check failed: ${redact(error)}. Try again in a moment.`, "fail");
      } finally {
        setStatus("");
        setBusy(false);
      }
    };

    bookButton.onclick = async (event) => {
      if (!event.isTrusted) return;
      setBusy(true);
      try {
        const plan = await readPlan();
        if (!plan) return;

        // Skip desks that are already taken. If the check itself fails, book NOTHING: something is wrong
        // (for example the session ran out) and a half-working run is worse than no run.
        let jobs = plan.jobs;
        try {
          const taken = await findTakenJobs(plan);
          jobs.filter((job) => taken.has(jobKey(job))).forEach((job) => log(`Skipped ${job.date}  ${job.name} (already taken)`, "skip"));
          jobs = jobs.filter((job) => !taken.has(jobKey(job)));
        } catch (error) {
          return log(`Could not check availability, so nothing was booked (${redact(error)}). Reload the page and try again.`, "fail");
        }
        setStatus("");
        if (jobs.length === 0) return log("Nothing left to book: every desk is taken. Try other days or desks.");

        // Send one request at a time, and be gentle with the site:
        // - if it says "too many requests" (HTTP 429) we wait longer and try the same booking again
        //   (a 429 means the booking was NOT made, so trying again is safe);
        // - one failed booking (say a desk taken meanwhile) is logged and the run continues,
        //   but two failures in a row end the run, because then something is wrong.
        stopButton.hidden = false;
        stopRequested = false;
        let booked = 0;
        let failuresInARow = 0;
        let pause = PAUSE_BETWEEN_REQUESTS_MS;

        // Returns true if the booking was made.
        async function bookOne(job) {
          for (let attempt = 0; attempt <= MAX_RETRIES_WHEN_THROTTLED; attempt++) {
            try {
              const { status, text } = await sendBooking(job.date, plan.start, plan.end, job.table, job.name);
              const id = readReservationId(text);
              if (status === 200 && id) {
                log(`Booked ${job.date}  ${job.name}`, "ok");
                myDeskByDate.set(job.date, job.name); // turns the day green
                bookedIds.push(id);
                updateUndoButton();
                return true;
              }
              if (status === 429 && attempt < MAX_RETRIES_WHEN_THROTTLED) {
                pause = Math.min(pause * 2, MAX_PAUSE_MS);
                log(`The site asks us to slow down. Waiting ${pause / 1000} s...`, "skip");
                await sleep(pause);
                continue;
              }
              const unsure = status >= 500 ? " It may still have been booked: check 'my bookings'." : "";
              log(`Failed ${job.date}  ${job.name} (HTTP ${status}): ${redact(text)}${unsure}`, "fail");
              return false;
            } catch (error) {
              log(`Failed ${job.date}  ${job.name}: ${redact(error)}. It may still have been booked: check 'my bookings'.`, "fail");
              return false;
            }
          }
          return false;
        }

        for (const [i, job] of jobs.entries()) {
          if (stopRequested) { log("Stopped. The rest was not booked.", "skip"); break; }
          setStatus(`Booking ${i + 1} of ${jobs.length}...`);
          if (await bookOne(job)) {
            booked++;
            failuresInARow = 0;
            pause = Math.max(PAUSE_BETWEEN_REQUESTS_MS, pause / 2); // speed up again after a calm moment
          } else if (++failuresInARow >= 2) {
            log("Stopped: two bookings failed in a row. Nothing after this was sent. Check the site, then try again.", "fail");
            break;
          }
          await sleep(pause);
        }
        drawCalendar();
        setStatus(`${booked} of ${jobs.length} booked.` + (booked ? ` "Undo bookings" cancels them.` : ""));
      } finally {
        stopButton.hidden = true;
        setBusy(false);
      }
    };

    // What is the panel still waiting for? Checked a few times a second; says nothing once everything is ready.
    const panelStarted = Date.now();
    function updateLoadingLine() {
      let text = "";
      let gaveUp = false; // true: nothing is loading any more, so no spinner
      if (!token || !userId) {
        gaveUp = Date.now() - panelStarted > 15000;
        text = gaveUp ? "Still not connected to the site. Reload the page, and click something on it once." : "Connecting to the site...";
      } else if (deskLoadFailed) {
        gaveUp = true;
        text = "Could not load your desks. Reload the page to try again.";
      } else if (Object.keys(deskNames).length === 0) {
        text = "Loading your desks...";
      } else if (askingNow) {
        text = "Checking which days you already have a desk...";
      }
      loadingText.textContent = text;
      loadingLine.hidden = !text;
      spinner.hidden = gaveUp;
    }
    updateLoadingLine();
    setInterval(updateLoadingLine, 400);

    const host = el("div");
    nativeAttachShadow.call(host, { mode: "closed" }).append(el("style", { textContent: PANEL_CSS }), box);
    document.body.append(host);
  }

  // At document_start the page body doesn't exist yet, so wait for it.
  window.addEventListener("DOMContentLoaded", buildPanel);
})();
