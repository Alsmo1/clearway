// public/js/sync.js
// The app always reads/writes IndexedDB first (see db.js), so it works
// fully offline. This module's only job is to notice when a connection is
// available and reconcile local changes with the server in the background.
const Sync = (() => {
  let syncing = false;
  let listeners = [];

  function onStatusChange(fn) {
    listeners.push(fn);
  }
  function emit(state) {
    listeners.forEach((fn) => fn(state));
  }

  async function pingServer() {
    try {
      const res = await fetch("/health", { cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function pushDirty() {
    const changes = {};
    let any = false;
    for (const table of ClearDB.TABLES) {
      const dirty = await ClearDB.getDirty(table);
      changes[table] = dirty.map(({ dirty, ...row }) => row);
      if (dirty.length) any = true;
    }
    if (!any) return;
    const result = await Api.post("/api/sync/push", { changes });
    for (const table of ClearDB.TABLES) {
      const ids = (changes[table] || []).map((r) => r.id);
      if (ids.length) await ClearDB.clearDirty(table, ids);
    }
    return result;
  }

  async function pullServer() {
    const since = (await ClearDB.getMeta("lastPullAt")) || "0000-00-00T00:00:00.000Z";
    const res = await fetch(`/api/sync/pull?since=${encodeURIComponent(since)}`);
    if (!res.ok) return;
    const { changes, serverTime } = await res.json();
    for (const table of ClearDB.TABLES) {
      if (changes[table] && changes[table].length) {
        await ClearDB.putMany(table, changes[table]);
      }
    }
    await ClearDB.setMeta("lastPullAt", serverTime);
  }

  async function runSync() {
    if (syncing) return;
    const online = await pingServer();
    if (!online) {
      emit("offline");
      return;
    }
    syncing = true;
    emit("syncing");
    try {
      await pushDirty();
      await pullServer();
      await ClearDB.setMeta("lastSyncAt", ClearDB.nowISO());
      emit("online");
    } catch (err) {
      console.warn("Sync failed:", err);
      emit("offline");
    } finally {
      syncing = false;
    }
  }

  function start() {
    runSync();
    window.addEventListener("online", runSync);
    window.addEventListener("offline", () => emit("offline"));
    // Also poll periodically in case the browser's online event is unreliable
    // (common on flaky wifi) — cheap no-op when nothing changed.
    setInterval(runSync, 60_000);
  }

  return { start, runSync, onStatusChange };
})();
