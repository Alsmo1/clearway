// public/js/db.js
// Thin promise wrapper around IndexedDB. Every table mirrors the server
// schema plus a local-only `dirty` flag that marks records with changes
// not yet confirmed by the server. The app reads and writes here first —
// the network is only ever a background concern (see sync.js).
const ClearDB = (() => {
  const DB_NAME = "clearway";
  const DB_VERSION = 1;
  const TABLES = ["habits", "habit_logs", "todos", "expenses", "goals"];
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        TABLES.forEach((t) => {
          if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: "id" });
        });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(table, mode) {
    const db = await open();
    return db.transaction(table, mode).objectStore(table);
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(table, { includeDeleted = false } = {}) {
    const store = await tx(table, "readonly");
    const rows = await reqToPromise(store.getAll());
    return includeDeleted ? rows : rows.filter((r) => !r.deleted_at);
  }

  async function put(table, row) {
    const store = await tx(table, "readwrite");
    await reqToPromise(store.put(row));
    return row;
  }

  async function putMany(table, rows) {
    const store = await tx(table, "readwrite");
    for (const row of rows) store.put(row);
  }

  async function getDirty(table) {
    const rows = await getAll(table, { includeDeleted: true });
    return rows.filter((r) => r.dirty);
  }

  async function clearDirty(table, ids) {
    const store = await tx(table, "readwrite");
    for (const id of ids) {
      const row = await reqToPromise(store.get(id));
      if (row) {
        delete row.dirty;
        store.put(row);
      }
    }
  }

  async function getMeta(key, fallback = null) {
    const store = await tx("meta", "readonly");
    const row = await reqToPromise(store.get(key));
    return row ? row.value : fallback;
  }

  async function setMeta(key, value) {
    const store = await tx("meta", "readwrite");
    await reqToPromise(store.put({ key, value }));
  }

  function uuid() {
    return crypto.randomUUID();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  return { TABLES, getAll, put, putMany, getDirty, clearDirty, getMeta, setMeta, uuid, nowISO };
})();
