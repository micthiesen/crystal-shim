import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  LIMITS, RequestFailure, bootstrap, buildConfigForm, configToDraft, createSession,
  nextEntryId, requestOptions, revisionForm, secondsToTime, startPage, timeToSeconds, validateToken,
} from "./app.js";

const TOKEN = "ab".repeat(32);
const APP_KEY = "A".repeat(30);
const USER_KEY = "B".repeat(30);
const CONFIG = {
  revision: 7, stop_level: 200, restart_level: 400, duration_seconds: 900,
  timezone: "PST8PDT,M3.2.0,M11.1.0", entries: [{ id: 19, days: 65, start_second: 43201 }],
  calibrated: true, pushover_configured: true,
};
const STATUS = {
  revision: 7, relay_on: false, maintenance: true, durable_maintenance: true,
  storage_failed: false, clock_available: true, state: "Maintenance",
};
const reply = (body, ok = true) => ({ ok, async json() { return body; } });
const pause = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(writeHandler = () => reply({ outcome: "durable", revision: 8 }), config = CONFIG) {
  const calls = [];
  const session = createSession(async (path, options) => {
    calls.push({ path, options });
    if (options.method === "POST") return writeHandler(path, options);
    return reply(path === "/api/config" ? config : { ...STATUS, revision: config.revision });
  });
  return { session, calls };
}
async function loaded(writeHandler, config) {
  const result = harness(writeHandler, config);
  result.session.unlock(TOKEN);
  await result.session.refresh();
  return result;
}

test("local second conversion preserves precision and rejects invalid times", () => {
  for (const second of [0, 1, 59, 60, 3599, 43201, 86399]) assert.equal(timeToSeconds(secondsToTime(second)), second);
  assert.equal(secondsToTime(43201), "12:00:01");
  assert.equal(timeToSeconds("12:00"), 43200);
  for (const value of ["24:00:00", "23:60:00", "23:59:60", "7:00", "12:30:00Z", "", "12:30:0"]) assert.throws(() => timeToSeconds(value));
  for (const value of [-1, 86400, 0.5, NaN]) assert.throws(() => secondsToTime(value));
});

test("config drafts preserve IDs, day masks and timezone and never prefill secrets", () => {
  const draft = configToDraft({ ...CONFIG, pushover_application_token: APP_KEY, pushover_user_key: USER_KEY, settings_auth_token: TOKEN });
  assert.deepEqual(draft.entries, [{ id: 19, days: 65, time: "12:00:01" }]);
  assert.equal(draft.timezone, CONFIG.timezone);
  assert.equal(draft.pushover_action, "keep");
  for (const key of ["pushover_application_token", "pushover_user_key", "pushover_device"]) assert.equal(draft[key], "");
  assert.equal(JSON.stringify(draft).includes(TOKEN), false);
  assert.equal(nextEntryId([{ id: 1 }, { id: 19 }], [2, 3]), 4);
  assert.equal(buildConfigForm({ ...draft, entries: [{ id: 19, days: 1, time: "13:00:00" }] }, 7).get("entry0_id"), "19");
});

test("configuration form matches the exact bounded backend contract", () => {
  const draft = configToDraft(CONFIG);
  const form = buildConfigForm(draft, CONFIG.revision);
  assert.deepEqual(Object.fromEntries(form), {
    revision: "7", stop_level: "200", restart_level: "400", duration_seconds: "900",
    timezone: CONFIG.timezone, entry_count: "1", entry0_id: "19", entry0_days: "65",
    entry0_start_second: "43201", pushover_action: "keep",
  });
  const entries = Array.from({ length: LIMITS.entries }, (_, index) => ({ id: index === 15 ? 4095 : index + 1, days: 127, time: "23:59:59" }));
  const maximum = buildConfigForm({ ...draft, stop_level: 0, restart_level: 1000, duration_seconds: 86400, entries }, 4294967295);
  assert.equal(maximum.get("entry_count"), "16");
  assert.equal(maximum.get("entry15_id"), "4095");
  assert.equal(maximum.get("entry15_start_second"), "86399");
  assert.equal(maximum.has("entry16_id"), false);
  assert.equal(buildConfigForm({ ...draft, entries: [] }, 1).get("entry_count"), "0");
});

test("malformed thresholds, durations, revision, timezone and schedules fail before a request", () => {
  const draft = configToDraft(CONFIG);
  for (const change of [
    { stop_level: -1 }, { stop_level: 1001 }, { restart_level: 200 }, { restart_level: 199 },
    { stop_level: "2e2" }, { duration_seconds: 0 }, { duration_seconds: 86401 }, { duration_seconds: 1.5 },
    { timezone: "" }, { timezone: "a".repeat(129) }, { timezone: "UTC 0" }, { timezone: "ÜTC0" },
    { entries: Array(17).fill(draft.entries[0]) },
    ...[{ id: 0 }, { id: 4096 }, { days: 0 }, { days: 128 }, { time: "24:00:00" }].map(entry => ({ entries: [{ ...draft.entries[0], ...entry }] })),
    { entries: [draft.entries[0], draft.entries[0]] }, { pushover_action: "show" },
  ]) assert.throws(() => buildConfigForm({ ...draft, ...change }, 7));
  for (const revision of [0, -1, "", "7.5", 4294967296, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => revisionForm(revision));
});

test("Pushover credentials are included only for explicit replacement", () => {
  const draft = { ...configToDraft(CONFIG), pushover_application_token: APP_KEY, pushover_user_key: USER_KEY, pushover_device: "tank-1" };
  for (const action of ["keep", "clear"]) {
    const body = buildConfigForm({ ...draft, pushover_action: action }, 7).toString();
    assert.equal(body.includes("pushover_application_token"), false);
    assert.equal(body.includes(APP_KEY), false);
    assert.equal(body.includes(USER_KEY), false);
    assert.equal(body.includes("tank-1"), false);
  }
  const replacement = buildConfigForm({ ...draft, pushover_action: "replace" }, 7);
  assert.equal(replacement.get("pushover_application_token"), APP_KEY);
  assert.equal(replacement.get("pushover_user_key"), USER_KEY);
  assert.equal(replacement.get("pushover_device"), "tank-1");
  assert.equal(buildConfigForm({ ...draft, pushover_action: "replace", pushover_device: "" }, 7).get("pushover_device"), "");
  for (const change of [{ pushover_application_token: "short" }, { pushover_user_key: "!".repeat(30) }, { pushover_device: "a".repeat(26) }, { pushover_device: "tank device" }]) {
    assert.throws(() => buildConfigForm({ ...draft, pushover_action: "replace", ...change }, 7));
  }
});

test("tokens stay in Authorization and requests cannot use arbitrary URLs or redirects", async () => {
  assert.equal(validateToken(TOKEN.toUpperCase()), TOKEN.toUpperCase());
  for (const value of ["", "0".repeat(64), "a".repeat(63), "g".repeat(64), `${TOKEN}\n`]) assert.throws(() => validateToken(value));
  const { calls, session } = await loaded();
  await session.save(configToDraft(CONFIG));
  for (const { path, options } of calls) {
    assert.equal(path.includes(TOKEN), false);
    assert.equal(path.includes("?"), false);
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.equal(options.mode, "same-origin");
    assert.equal(options.headers.Origin, undefined);
    assert.equal(options.body?.includes(TOKEN) ?? false, false);
  }
  for (const path of ["https://example.com/api/config", "/api/config?token=x", "/api/on", "/api/utc", "/api/calibration"]) assert.throws(() => requestOptions(path, TOKEN));
  const source = await readFile(new URL("./app.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|location\.|history\.|sendBeacon/);
  assert.equal(JSON.stringify(session.snapshot).includes(TOKEN), false);
});

test("successful save never retries, exits maintenance or refetches automatically", async () => {
  const { session, calls } = await loaded();
  const result = await session.save(configToDraft(CONFIG));
  await pause();
  assert.deepEqual(result, { outcome: "durable", revision: 8 });
  assert.deepEqual(calls.map(call => [call.path, call.options.method]), [["/api/config", "GET"], ["/api/status", "GET"], ["/api/config", "POST"]]);
  assert.equal(session.snapshot.needsRefetch, true);
  await assert.rejects(session.exit(), /Refetch/);
  assert.equal(calls.length, 3);
});

test("unknown outcomes require explicit refetch without a write retry", async () => {
  const { session, calls } = await loaded(() => reply({ error: "storage", unknown_outcome: true }, false));
  await assert.rejects(session.save(configToDraft(CONFIG)), error => error instanceof RequestFailure && error.unknownOutcome && /Refetch/.test(error.message));
  await pause();
  assert.equal(calls.filter(call => call.options.method === "POST").length, 1);
  assert.equal(session.snapshot.needsRefetch, true);
  await assert.rejects(session.maintenance(), /Refetch/);
  await session.refresh();
  assert.equal(session.snapshot.needsRefetch, false);
  assert.equal(calls.filter(call => call.options.method === "POST").length, 1);
});

test("lost or malformed write replies are unknown and never expose server error text", async () => {
  for (const handler of [
    () => { throw new Error(`transport failed ${TOKEN}`); },
    () => ({ ok: true, async json() { throw new Error("bad json"); } }),
    () => reply({ outcome: "durable", revision: 0 }),
    () => reply({ outcome: "something_else", revision: 8 }),
    () => reply({ error: TOKEN }, false),
  ]) {
    const { session, calls } = await loaded(handler);
    await assert.rejects(session.maintenance(), error => error.unknownOutcome && !error.message.includes(TOKEN));
    assert.equal(calls.length, 3);
    assert.equal(session.snapshot.needsRefetch, true);
  }
});

test("each mutation requires its exact acknowledgement outcome", async () => {
  for (const [action, expected] of [["save", "durable"], ["maintenance", "durable"], ["exit", "durable"], ["off", "applied"]]) {
    for (const outcome of ["durable", "applied"]) {
      const { session, calls } = await loaded(() => reply({ outcome, revision: 8 }));
      const result = action === "save" ? session.save(configToDraft(CONFIG)) : session[action]();
      if (outcome === expected) assert.equal((await result).outcome, expected);
      else await assert.rejects(result, error => error instanceof RequestFailure && error.unknownOutcome);
      assert.equal(calls.length, 3);
      assert.equal(session.snapshot.needsRefetch, true);
    }
  }
});

test("Off waits for a pending save and cannot open a second request", async () => {
  const saving = deferred();
  const stopping = deferred();
  const { session, calls } = await loaded(path => path === "/api/config" ? saving.promise : stopping.promise);
  const save = session.save(configToDraft(CONFIG));
  assert.equal(session.snapshot.busy, true);
  const blocked = session.off().then(() => null, error => error);
  await pause();
  assert.deepEqual(calls.slice(2).map(call => call.path), ["/api/config"]);
  assert.match((await blocked).message, /current request/);
  saving.resolve(reply({ outcome: "durable", revision: 8 }));
  await save;
  assert.equal(session.snapshot.revision, 8);
  assert.equal(session.snapshot.needsRefetch, true);
  const off = session.off();
  assert.equal(session.snapshot.offBusy, true);
  await assert.rejects(session.off(), /current request/);
  await assert.rejects(session.refresh(), /current request/);
  assert.deepEqual(calls.slice(2).map(call => call.path), ["/api/config", "/api/off"]);
  assert.equal(calls[3].options.body, "revision=8");
  stopping.resolve(reply({ outcome: "applied", revision: 8 }));
  assert.equal((await off).outcome, "applied");
  assert.equal(session.snapshot.offBusy, false);
});

test("Off remains available after an uncertain mutation", async () => {
  let count = 0;
  const { session } = await loaded(() => ++count === 1 ? reply({ error: "busy", unknown_outcome: true }, false) : reply({ outcome: "applied", revision: 7 }));
  await assert.rejects(session.maintenance());
  await session.off();
  assert.equal(count, 2);
});

test("a lock aborts requests and a late response cannot unlock or restore state", async () => {
  const saving = deferred();
  const { session, calls } = await loaded(() => saving.promise);
  const pending = session.save({ ...configToDraft(CONFIG), pushover_action: "replace", pushover_application_token: APP_KEY, pushover_user_key: USER_KEY });
  session.lock();
  assert.equal(calls[2].options.signal.aborted, true);
  assert.deepEqual(session.snapshot, { unlocked: false, busy: false, offBusy: false, needsRefetch: true, revision: null, config: null, status: null });
  saving.resolve(reply({ outcome: "durable", revision: 8 }));
  await assert.rejects(pending);
  assert.equal(session.snapshot.revision, null);
  assert.equal(session.snapshot.unlocked, false);
  await assert.rejects(session.refresh(), /Unlock/);
});

test("re-unlocking does not let an older generation overwrite the new session", async () => {
  const waiting = deferred();
  let count = 0;
  const session = createSession(async path => ++count === 1 ? waiting.promise : reply(path === "/api/config" ? CONFIG : STATUS));
  session.unlock(TOKEN);
  const old = session.refresh();
  session.unlock("cd".repeat(32));
  await session.refresh();
  waiting.resolve(reply({ ...CONFIG, revision: 2 }));
  await assert.rejects(old);
  assert.equal(session.snapshot.revision, 7);
  assert.equal(session.snapshot.needsRefetch, false);
});

test("configuration and status from different revisions cannot enable mutation", async () => {
  const session = createSession(async path => reply(path === "/api/config" ? CONFIG : { ...STATUS, revision: 8 }));
  session.unlock(TOKEN);
  await assert.rejects(session.refresh(), RequestFailure);
  assert.equal(session.snapshot.needsRefetch, true);
  await assert.rejects(session.exit());
});

test("Off cannot overtake the status request after configuration has loaded", async () => {
  const status = deferred();
  const calls = [];
  const session = createSession(async (path, options) => {
    calls.push(path);
    if (options.method === "POST") return reply({ outcome: "applied", revision: 7 });
    return path === "/api/config" ? reply(CONFIG) : status.promise;
  });
  session.unlock(TOKEN);
  const refresh = session.refresh();
  await pause();
  assert.equal(session.snapshot.revision, 7);
  await assert.rejects(session.off(), /current request/);
  assert.deepEqual(calls, ["/api/config", "/api/status"]);
  status.resolve(reply(STATUS));
  await refresh;
  assert.equal(session.snapshot.needsRefetch, false);
  await session.off();
  assert.deepEqual(calls, ["/api/config", "/api/status", "/api/off"]);
});

test("the session discards unexpected secret fields returned by the server", async () => {
  const { session } = await loaded(undefined, { ...CONFIG, pushover_application_token: APP_KEY, pushover_user_key: USER_KEY, settings_auth_token: TOKEN });
  const snapshot = JSON.stringify(session.snapshot);
  for (const secret of [APP_KEY, USER_KEY, TOKEN]) assert.equal(snapshot.includes(secret), false);
});

test("static page has external self assets, password entry and no credential form names", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<link\b/);
  assert.match(html, /id="access-token" type="password"/);
  assert.match(html, /<input id="access-token"[^>]+\bdisabled\b/);
  assert.match(html, /<button id="unlock-submit"[^>]+\bdisabled\b/);
  assert.match(html, /<fieldset id="settings-fields"[^>]+\bdisabled\b/);
  assert.match(html, /form-action 'none'/);
  assert.doesNotMatch(html, /<style|\sstyle=|\son[a-z]+=|\sname="(?:token|password|pushover)/i);
  assert.doesNotMatch(html, /(?:src|href)="(?:https?:)?\/\//);
});

function fakeDocument(html) {
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    value: "", dataset: {}, children: [], listeners: new Map(),
    addEventListener(name, callback) { this.listeners.set(name, callback); },
    replaceChildren() { this.children = []; }, reset() {},
  }]));
  for (const [, id] of html.matchAll(/id="([^"]+)"[^>]*\bdisabled\b/g)) nodes.get(id).disabled = true;
  const viewEvents = new Map();
  return {
    nodes, viewEvents, getElementById(id) { assert.ok(nodes.has(id), id); return nodes.get(id); },
    defaultView: { addEventListener(name, callback) { viewEvents.set(name, callback); } },
  };
}

test("actual DOM bootstrap disables Off during save and Lock clears all credential fields", async () => {
  const document = fakeDocument(await readFile(new URL("./index.html", import.meta.url), "utf8"));
  const saving = deferred();
  const page = bootstrap(document, async (path, options) => options.method === "POST" ? saving.promise : reply(path === "/api/config" ? { ...CONFIG, entries: [] } : STATUS));
  page.session.unlock(TOKEN);
  await page.session.refresh();
  const pending = page.session.save(configToDraft(CONFIG));
  assert.equal(document.nodes.get("off").disabled, true);
  assert.equal(document.nodes.get("settings-fields").disabled, true);
  for (const id of ["access-token", "pushover-application", "pushover-user", "pushover-device"]) document.nodes.get(id).value = TOKEN;
  document.nodes.get("pushover-action").value = "replace";
  page.lock();
  for (const id of ["access-token", "pushover-application", "pushover-user", "pushover-device"]) assert.equal(document.nodes.get(id).value, "");
  assert.equal(document.nodes.get("pushover-action").value, "keep");
  assert.equal(document.nodes.get("pushover-fields").hidden, true);
  assert.equal(document.nodes.get("workspace").hidden, true);
  saving.resolve(reply({ outcome: "durable", revision: 8 }));
  await assert.rejects(pending);
  assert.equal(page.session.snapshot.unlocked, false);
  assert.equal(typeof document.viewEvents.get("pagehide"), "function");
});

test("bootstrap loads CSS after the module and enables no API or form before its load event", async () => {
  const document = fakeDocument(await readFile(new URL("./index.html", import.meta.url), "utf8"));
  const assets = [];
  const apiCalls = [];
  document.createElement = tag => {
    assert.equal(tag, "link");
    return { listeners: new Map(), addEventListener(name, callback) { this.listeners.set(name, callback); } };
  };
  document.head = { append(asset) { assets.push(asset); } };
  const pending = startPage(document, async (path, options) => {
    apiCalls.push({ path, options });
    return reply(path === "/api/config" ? { ...CONFIG, entries: [] } : STATUS);
  });
  assert.equal(assets.length, 1);
  assert.equal(assets[0].rel, "stylesheet");
  assert.equal(assets[0].href, "/style.css");
  await pause();
  assert.equal(apiCalls.length, 0);
  assert.equal(document.nodes.get("access-token").disabled, true);
  assert.equal(document.nodes.get("unlock-submit").disabled, true);
  assert.equal(document.nodes.get("unlock-form").listeners.has("submit"), false);
  assets[0].listeners.get("load")();
  const page = await pending;
  assert.equal(document.nodes.get("access-token").disabled, false);
  assert.equal(document.nodes.get("unlock-submit").disabled, false);
  assert.equal(document.nodes.get("unlock-form").listeners.has("submit"), true);
  assert.equal(apiCalls.length, 0);
  page.session.unlock(TOKEN);
  await page.session.refresh();
  assert.deepEqual(apiCalls.map(call => call.path), ["/api/config", "/api/status"]);
});

test("a stylesheet failure leaves access disabled and reports failure without retrying", async () => {
  const document = fakeDocument(await readFile(new URL("./index.html", import.meta.url), "utf8"));
  const assets = [];
  document.createElement = () => ({ listeners: new Map(), addEventListener(name, callback) { this.listeners.set(name, callback); } });
  document.head = { append(asset) { assets.push(asset); } };
  let apiCalls = 0;
  const pending = startPage(document, async () => { apiCalls += 1; });
  assets[0].listeners.get("error")();
  assert.equal(await pending, null);
  await pause();
  assert.equal(assets.length, 1);
  assert.equal(apiCalls, 0);
  assert.equal(document.nodes.get("access-token").disabled, true);
  assert.equal(document.nodes.get("unlock-submit").disabled, true);
  assert.equal(document.nodes.get("unlock-form").listeners.has("submit"), false);
  assert.match(document.nodes.get("message").textContent, /Reload/);
});


test("known pre-admission JSON rejection is not an ambiguous mutation", async () => {
  for (const error of ["invalid_request", "forbidden"]) {
    const { session, calls } = await loaded(() => reply({ error, unknown_outcome: false }, false));
    await assert.rejects(session.maintenance(), failure => failure instanceof RequestFailure && !failure.unknownOutcome);
    assert.equal(calls.length, 3);
    assert.equal(session.snapshot.busy, false);
    assert.equal(session.snapshot.needsRefetch, true);
  }
});

test("DOM enables Off after an ambiguous write settles without requiring refetch", async () => {
  const document = fakeDocument(await readFile(new URL("./index.html", import.meta.url), "utf8"));
  const writing = deferred();
  const stopping = deferred();
  const calls = [];
  const page = bootstrap(document, async (path, options) => {
    calls.push(path);
    if (options.method !== "POST") return reply(path === "/api/config" ? { ...CONFIG, entries: [] } : STATUS);
    return path === "/api/off" ? stopping.promise : writing.promise;
  });
  page.session.unlock(TOKEN);
  await page.session.refresh();
  const pending = page.session.maintenance();
  assert.equal(document.nodes.get("off").disabled, true);
  writing.resolve(reply({ error: "outcome_unknown", unknown_outcome: true }, false));
  await assert.rejects(pending, failure => failure.unknownOutcome);
  assert.equal(page.session.snapshot.needsRefetch, true);
  assert.equal(document.nodes.get("off").disabled, false);
  assert.equal(document.nodes.get("settings-fields").disabled, true);
  const off = page.session.off();
  assert.equal(document.nodes.get("off").disabled, true);
  stopping.resolve(reply({ outcome: "applied", revision: 7 }));
  await off;
  assert.equal(document.nodes.get("off").disabled, false);
  assert.deepEqual(calls, ["/api/config", "/api/status", "/api/maintenance", "/api/off"]);
});
