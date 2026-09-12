export const LIMITS = Object.freeze({ entries: 16, entryId: 4095, level: 1000, duration: 86400, revision: 4294967295 });
const TIMING_FIELDS = [["low_confirmation_ms", "low-confirmation", "Low-water confirmation"], ["recovery_ms", "recovery", "Stable recovery"], ["minimum_off_ms", "minimum-off", "Minimum off period"], ["max_sample_age_ms", "sample-age", "Maximum sample age"]];
function millis(value, label) {
  if (typeof value !== "string" || !/^[0-9]{1,20}$/.test(value)) throw new Error(`${label} must be a positive whole number of milliseconds.`);
  const result = BigInt(value);
  if (result < 1n || result > 18446744073709551615n) throw new Error(`${label} is outside the supported range.`);
  return result.toString();
}
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const READ_PATHS = new Set(["/api/config", "/api/status"]);
const WRITE_PATHS = new Set(["/api/config", "/api/off", "/api/maintenance", "/api/exit"]);

function integer(value, min, max, label) {
  if (!/^[0-9]+$/.test(String(value))) throw new Error(`${label} must be a whole number.`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error(`${label} must be from ${min} to ${max}.`);
  return result;
}

export function validateToken(value) {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{64}$/.test(value) || /^0+$/.test(value)) {
    throw new Error("Enter a nonzero 64-character hexadecimal access token.");
  }
  return value;
}

export function secondsToTime(value) {
  const seconds = integer(value, 0, 86399, "Start time");
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(part => String(part).padStart(2, "0")).join(":");
}

export function timeToSeconds(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error("Use a local start time in HH:MM:SS format.");
  const [hour, minute, second = "00"] = value.split(":");
  return integer(hour, 0, 23, "Hour") * 3600 + integer(minute, 0, 59, "Minute") * 60 + integer(second, 0, 59, "Second");
}

export function nextEntryId(entries, retiredIds = []) {
  const used = new Set([...entries.map(entry => Number(entry.id)), ...retiredIds]);
  for (let id = 1; id <= LIMITS.entryId; id += 1) if (!used.has(id)) return id;
  throw new Error("No schedule entry IDs are available.");
}

export function configToDraft(config) {
  return {
    stop_level: config.stop_level, restart_level: config.restart_level,
    duration_seconds: config.duration_seconds, timezone: config.timezone,
    ...Object.fromEntries(TIMING_FIELDS.map(([key]) => [key, config[key]])),
    minimum_sample_age_ms: config.minimum_sample_age_ms,
    entries: config.entries.map(entry => ({ id: entry.id, days: entry.days, time: secondsToTime(entry.start_second) })),
    pushover_action: "keep", pushover_application_token: "", pushover_user_key: "", pushover_device: "",
  };
}

export function buildConfigForm(draft, revision) {
  const form = revisionForm(revision);
  const stop = integer(draft.stop_level, 0, LIMITS.level, "Stop level");
  const restart = integer(draft.restart_level, 0, LIMITS.level, "Restart level");
  if (stop >= restart) throw new Error("Restart level must be above stop level.");
  form.set("stop_level", String(stop));
  form.set("restart_level", String(restart));
  form.set("duration_seconds", String(integer(draft.duration_seconds, 1, LIMITS.duration, "Run duration")));
  for (const [key, , label] of TIMING_FIELDS) form.set(key, millis(draft[key], label));
  if (BigInt(form.get("max_sample_age_ms")) < BigInt(millis(draft.minimum_sample_age_ms, "Minimum sample age"))) throw new Error("Maximum sample age must cover the configured frame-duration limit.");
  if (typeof draft.timezone !== "string" || !/^[\x21-\x7e]{1,128}$/.test(draft.timezone)) throw new Error("Enter a POSIX timezone rule of 1 to 128 ASCII characters, without spaces. The device validates the rule.");
  form.set("timezone", draft.timezone);
  if (!Array.isArray(draft.entries) || draft.entries.length > LIMITS.entries) throw new Error("Use no more than 16 scheduled starts.");
  form.set("entry_count", String(draft.entries.length));
  const ids = new Set();
  draft.entries.forEach((entry, index) => {
    const id = integer(entry.id, 1, LIMITS.entryId, "Entry ID");
    if (ids.has(id)) throw new Error("Schedule entry IDs must be unique.");
    ids.add(id);
    form.set(`entry${index}_id`, String(id));
    form.set(`entry${index}_days`, String(integer(entry.days, 1, 127, "Selected days")));
    form.set(`entry${index}_start_second`, String(timeToSeconds(entry.time)));
  });
  const action = draft.pushover_action ?? "keep";
  if (!["keep", "clear", "replace"].includes(action)) throw new Error("Choose a Pushover credential action.");
  form.set("pushover_action", action);
  if (action === "replace") {
    for (const key of ["pushover_application_token", "pushover_user_key"]) {
      if (typeof draft[key] !== "string" || !/^[a-zA-Z0-9]{30}$/.test(draft[key])) throw new Error("Pushover application token and user key must each be 30 letters or digits.");
      form.set(key, draft[key]);
    }
    const device = draft.pushover_device ?? "";
    if (typeof device !== "string" || !/^[a-zA-Z0-9_-]{0,25}$/.test(device)) throw new Error("Pushover device name must be at most 25 letters, digits, underscores or hyphens.");
    form.set("pushover_device", device);
  }
  return form;
}

export function revisionForm(revision) {
  return new URLSearchParams({ revision: String(integer(revision, 1, LIMITS.revision, "Revision")) });
}

export function requestOptions(path, token, form, signal) {
  const write = form !== undefined;
  if (!(write ? WRITE_PATHS : READ_PATHS).has(path)) throw new Error("Unsupported API path.");
  const headers = { Authorization: `Bearer ${validateToken(token)}`, Accept: "application/json" };
  if (write) headers["Content-Type"] = "application/x-www-form-urlencoded";
  return {
    method: write ? "POST" : "GET", headers, credentials: "omit", referrerPolicy: "no-referrer",
    cache: "no-store", redirect: "error", mode: "same-origin", signal,
    ...(write ? { body: form.toString() } : {}),
  };
}

export class RequestFailure extends Error {
  constructor(unknownOutcome = false) {
    super(unknownOutcome ? "Outcome unknown. Refetch settings and status before deciding what to do next. Do not automatically repeat this action." : "Request failed. Refetch settings and status before trying again.");
    this.unknownOutcome = unknownOutcome;
  }
}

function readConfig(value) {
  if (!value || !Array.isArray(value.entries) || typeof value.calibrated !== "boolean" || typeof value.pushover_configured !== "boolean") throw new RequestFailure();
  const draft = configToDraft(value);
  buildConfigForm(draft, value.revision);
  // Copy the public contract only. Never retain an unexpected secret field.
  return {
    revision: integer(value.revision, 1, LIMITS.revision, "Revision"),
    stop_level: Number(value.stop_level), restart_level: Number(value.restart_level),
    duration_seconds: Number(value.duration_seconds), timezone: value.timezone,
    ...Object.fromEntries(TIMING_FIELDS.map(([key, , label]) => [key, millis(value[key], label)])),
    minimum_sample_age_ms: millis(value.minimum_sample_age_ms, "Minimum sample age"),
    entries: value.entries.map(entry => ({ id: Number(entry.id), days: Number(entry.days), start_second: Number(entry.start_second) })),
    calibrated: value.calibrated, pushover_configured: value.pushover_configured,
  };
}

function readStatus(value) {
  const result = { revision: integer(value?.revision, 1, LIMITS.revision, "Revision") };
  for (const key of ["relay_on", "maintenance", "durable_maintenance", "storage_failed", "clock_available"]) {
    if (typeof value[key] !== "boolean") throw new RequestFailure();
    result[key] = value[key];
  }
  if (typeof value.state !== "string" || value.state.length > 128) throw new RequestFailure();
  result.state = value.state;
  return result;
}

export function createSession(fetcher, onChange = () => {}) {
  let token = "";
  let generation = 0;
  let mutations = 0;
  const controllers = new Set();
  let state = { unlocked: false, busy: false, offBusy: false, needsRefetch: true, revision: null, config: null, status: null };
  const publish = () => onChange(structuredClone(state));

  async function request(path, form, epoch) {
    const controller = new AbortController();
    controllers.add(controller);
    const write = form !== undefined;
    try {
      const response = await fetcher(path, requestOptions(path, token, form, controller.signal));
      const result = await response.json();
      if (epoch !== generation) throw new RequestFailure(write);
      if (!response.ok) throw new RequestFailure(result?.unknown_outcome === true || (write && typeof result?.unknown_outcome !== "boolean"));
      return result;
    } catch (error) {
      if (error instanceof RequestFailure) throw error;
      throw new RequestFailure(write);
    } finally {
      controllers.delete(controller);
    }
  }

  async function write(path, form) {
    const off = path === "/api/off";
    if (!state.unlocked || state.revision === null) throw new Error("Unlock and refetch first.");
    if (state.busy || state.offBusy) throw new Error("Wait for the current request before changing settings.");
    if (!off && state.needsRefetch) throw new Error("Refetch before changing settings.");
    const epoch = generation;
    mutations += 1;
    state[off ? "offBusy" : "busy"] = true;
    state.needsRefetch = true;
    publish();
    try {
      const result = await request(path, form, epoch);
      if (result?.outcome !== (off ? "applied" : "durable")) throw new RequestFailure(true);
      const revision = integer(result.revision, 1, LIMITS.revision, "Revision");
      if (epoch !== generation) throw new RequestFailure(true);
      state.revision = Math.max(state.revision, revision);
      return { outcome: result.outcome, revision };
    } catch (error) {
      if (error instanceof RequestFailure) throw error;
      throw new RequestFailure(true);
    } finally {
      if (epoch === generation) {
        state[off ? "offBusy" : "busy"] = false;
        publish();
      }
    }
  }

  const session = {
    get snapshot() { return structuredClone(state); },
    unlock(value) {
      session.lock();
      token = validateToken(value);
      state.unlocked = true;
      publish();
    },
    lock() {
      generation += 1;
      token = "";
      for (const controller of controllers) controller.abort();
      controllers.clear();
      state = { unlocked: false, busy: false, offBusy: false, needsRefetch: true, revision: null, config: null, status: null };
      publish();
    },
    async refresh() {
      if (!state.unlocked) throw new Error("Unlock first.");
      if (state.busy || state.offBusy) throw new Error("Wait for the current request before refetching.");
      const epoch = generation;
      const mutation = mutations;
      state.busy = true;
      state.needsRefetch = true;
      publish();
      try {
        const config = readConfig(await request("/api/config", undefined, epoch));
        // Retain the revision if the later status request fails. Off still waits
        // for this serialized refresh to settle.
        state.revision = Math.max(state.revision ?? 0, config.revision);
        publish();
        const status = readStatus(await request("/api/status", undefined, epoch));
        if (epoch !== generation || mutation !== mutations || config.revision !== status.revision) throw new RequestFailure();
        state.config = config;
        state.status = status;
        state.revision = config.revision;
        state.needsRefetch = false;
        return structuredClone(config);
      } finally {
        if (epoch === generation) { state.busy = false; publish(); }
      }
    },
    save(draft) { return write("/api/config", buildConfigForm(draft, state.revision)); },
    off() { return write("/api/off", revisionForm(state.revision)); },
    maintenance() { return write("/api/maintenance", revisionForm(state.revision)); },
    exit() { return write("/api/exit", revisionForm(state.revision)); },
  };
  return session;
}

export function bootstrap(document, fetcher) {
  const byId = id => document.getElementById(id);
  let retiredIds = [];
  let viewGeneration = 0;
  const showMessage = (message, error = false) => {
    byId("message").textContent = message;
    byId("message").dataset.kind = error ? "error" : "info";
  };
  const session = createSession(fetcher, state => {
    byId("access").hidden = state.unlocked;
    byId("workspace").hidden = !state.unlocked;
    byId("lock").hidden = !state.unlocked;
    byId("refresh").disabled = state.busy || state.offBusy;
    byId("off").disabled = state.revision === null || state.busy || state.offBusy;
    byId("maintenance").disabled = state.busy || state.offBusy || state.needsRefetch;
    byId("exit").disabled = state.busy || state.offBusy || state.needsRefetch || !state.status?.maintenance || !state.status?.durable_maintenance || state.status?.storage_failed;
    byId("settings-fields").disabled = state.busy || state.offBusy || state.needsRefetch;
    byId("freshness").textContent = state.needsRefetch ? "Status may have changed. Refetch before making another change." : "Status from the last explicit refetch.";
    byId("freshness").dataset.stale = String(state.needsRefetch);
    const status = state.status;
    byId("relay-status").textContent = status ? (status.relay_on ? "On" : "Off") : "Unknown";
    byId("maintenance-status").textContent = status ? (status.maintenance ? (status.durable_maintenance ? "On, saved" : "On, not saved") : "Off") : "Unknown";
    byId("storage-status").textContent = status ? (status.storage_failed ? "Failed" : "Available") : "Unknown";
    byId("clock-status").textContent = status ? (status.clock_available ? "Available" : "Unavailable") : "Unknown";
    byId("control-status").textContent = status?.state ?? "Unknown";
    byId("revision-status").textContent = state.revision ?? "Unknown";
  });

  function clearCredentials() {
    for (const id of ["access-token", "pushover-application", "pushover-user", "pushover-device"]) byId(id).value = "";
    byId("pushover-action").value = "keep";
    byId("pushover-fields").hidden = true;
  }
  function lock() {
    viewGeneration += 1;
    session.lock();
    clearCredentials();
    byId("settings-form").reset();
    byId("entries").replaceChildren();
    retiredIds = [];
    showMessage("Locked. Refetch after unlocking to check any action already sent.");
  }
  function readDraft() {
    return {
      stop_level: byId("stop-level").value, restart_level: byId("restart-level").value,
      duration_seconds: byId("duration").value, timezone: byId("timezone").value,
      ...Object.fromEntries(TIMING_FIELDS.map(([key, id]) => [key, byId(id).value])),
      minimum_sample_age_ms: session.snapshot.config?.minimum_sample_age_ms,
      entries: [...byId("entries").children].map(row => ({
        id: Number(row.dataset.entryId), time: row.querySelector('input[type="time"]').value,
        days: [...row.querySelectorAll('input[type="checkbox"]')].reduce((mask, input, day) => mask | (input.checked ? 1 << day : 0), 0),
      })),
      pushover_action: byId("pushover-action").value,
      pushover_application_token: byId("pushover-application").value,
      pushover_user_key: byId("pushover-user").value, pushover_device: byId("pushover-device").value,
    };
  }
  function updateEntryCount() {
    const count = byId("entries").children.length;
    byId("add-entry").disabled = count >= LIMITS.entries;
    byId("empty-entries").hidden = count !== 0;
  }
  function addEntry(entry) {
    const row = document.createElement("fieldset");
    row.className = "entry";
    row.dataset.entryId = String(entry.id);
    const legend = document.createElement("legend");
    legend.textContent = `Entry ${entry.id}`;
    const top = document.createElement("div");
    top.className = "entry-row";
    const label = document.createElement("label");
    label.className = "entry-time";
    label.textContent = "Local start time";
    const time = document.createElement("input");
    time.type = "time"; time.step = "1"; time.required = true; time.value = entry.time;
    label.append(time);
    const remove = document.createElement("button");
    remove.type = "button"; remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove entry ${entry.id}`);
    remove.addEventListener("click", () => { retiredIds.push(entry.id); row.remove(); updateEntryCount(); });
    top.append(label, remove);
    const days = document.createElement("div");
    days.className = "day-options";
    DAY_NAMES.forEach((name, day) => {
      const choice = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox"; input.checked = Boolean(entry.days & (1 << day));
      choice.append(input, document.createTextNode(name)); days.append(choice);
    });
    row.append(legend, top, days); byId("entries").append(row); updateEntryCount();
  }
  function showConfig(config) {
    clearCredentials();
    const draft = configToDraft(config);
    for (const [id, key] of [["stop-level", "stop_level"], ["restart-level", "restart_level"], ["duration", "duration_seconds"], ["timezone", "timezone"]]) byId(id).value = draft[key];
    byId("entries").replaceChildren(); retiredIds = [];
    draft.entries.forEach(addEntry); updateEntryCount();
    for (const [key, id] of TIMING_FIELDS) byId(id).value = draft[key];
    byId("sample-age-help").textContent = `Maximum sample age also limits gaps in local control. The configured frame-duration limit requires at least ${config.minimum_sample_age_ms} ms.`;
    byId("calibration-status").textContent = config.calibrated ? "Calibration is stored. The device also checks thresholds against its calibrated range." : "Calibration is not stored. Calibration is configured through commissioning, outside this page.";
    byId("pushover-status").textContent = config.pushover_configured ? "Credentials are configured." : "Credentials are not configured.";
  }
  async function run(action, success) {
    const epoch = viewGeneration;
    showMessage("Request pending…");
    try {
      const result = await action();
      if (epoch === viewGeneration) success(result);
    } catch (error) {
      if (epoch === viewGeneration) showMessage(error instanceof Error ? error.message : "Request failed. Refetch before continuing.", true);
    }
  }
  const refresh = () => run(() => session.refresh(), config => { showConfig(config); showMessage("Settings and status loaded."); });
  byId("unlock-form").addEventListener("submit", event => {
    event.preventDefault();
    try { session.unlock(byId("access-token").value); byId("access-token").value = ""; void refresh(); }
    catch (error) { byId("access-token").value = ""; showMessage(error.message, true); }
  });
  byId("lock").addEventListener("click", lock);
  byId("refresh").addEventListener("click", () => { void refresh(); });
  byId("add-entry").addEventListener("click", () => {
    const draft = readDraft();
    if (draft.entries.length < LIMITS.entries) addEntry({ id: nextEntryId(draft.entries, retiredIds), days: 127, time: "00:00:00" });
  });
  byId("pushover-action").addEventListener("change", () => {
    const replace = byId("pushover-action").value === "replace";
    byId("pushover-fields").hidden = !replace;
    if (!replace) for (const id of ["pushover-application", "pushover-user", "pushover-device"]) byId(id).value = "";
  });
  byId("settings-form").addEventListener("submit", event => {
    event.preventDefault();
    const epoch = viewGeneration;
    void run(async () => {
      try { return await session.save(readDraft()); }
      finally { if (epoch === viewGeneration) clearCredentials(); }
    }, result => showMessage(`Save ${result.outcome}. Refetch settings and status, then explicitly exit maintenance when ready.`));
  });
  for (const [id, action, label] of [["off", () => session.off(), "Off"], ["maintenance", () => session.maintenance(), "Maintenance"], ["exit", () => session.exit(), "Exit maintenance"]]) {
    byId(id).addEventListener("click", () => { void run(action, result => showMessage(`${label} ${result.outcome}. Refetch settings and status.`)); });
  }
  document.defaultView?.addEventListener("pagehide", lock);
  lock();
  byId("access-token").disabled = false;
  byId("unlock-submit").disabled = false;
  return { lock, session };
}

export async function startPage(document, fetcher) {
  // The device has one HTTP listener. Request CSS only after this module loaded,
  // then enable the page after CSS completes so asset and API reads stay serial.
  try {
    await new Promise((resolve, reject) => {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "/style.css";
      stylesheet.addEventListener("load", resolve, { once: true });
      stylesheet.addEventListener("error", reject, { once: true });
      document.head.append(stylesheet);
    });
  } catch {
    const message = document.getElementById("message");
    message.textContent = "The page could not finish loading. Reload it before entering an access token. No settings request was sent.";
    message.dataset.kind = "error";
    return null;
  }
  return bootstrap(document, fetcher);
}

if (typeof document !== "undefined") void startPage(document, globalThis.fetch.bind(globalThis));
