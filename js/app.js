// public/js/app.js
const App = (() => {
  const main = document.getElementById("main");
  const toastEl = document.getElementById("toast");
  let currentView = "today";
  let cache = { habits: [], habit_logs: [], todos: [], expenses: [], goals: [] };

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const fmtMoney = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  async function refreshCache() {
    for (const table of ClearDB.TABLES) {
      cache[table] = await ClearDB.getAll(table);
    }
  }

  async function saveRow(table, row, { isNew = false } = {}) {
    const full = {
      ...row,
      updated_at: ClearDB.nowISO(),
      dirty: true,
      ...(isNew ? { id: ClearDB.uuid(), created_at: ClearDB.nowISO() } : {}),
    };
    await ClearDB.put(table, full);
    await refreshCache();
    Sync.runSync();
    return full;
  }

  async function softDelete(table, id) {
    const rows = await ClearDB.getAll(table, { includeDeleted: true });
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    await ClearDB.put(table, { ...row, deleted_at: ClearDB.nowISO(), updated_at: ClearDB.nowISO(), dirty: true });
    await refreshCache();
    render();
    Sync.runSync();
  }

  // ---------------------------------------------------------------- Habits
  function habitLogsFor(habitId) {
    return cache.habit_logs.filter((l) => l.habit_id === habitId && l.completed);
  }

  function last7Ratio(habitId) {
    const logs = new Set(habitLogsFor(habitId).map((l) => l.date));
    let hit = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (logs.has(d.toISOString().slice(0, 10))) hit++;
    }
    return hit / 7;
  }

  function ringSVG(ratio, size = 74) {
    const r = (size - 7) / 2;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - ratio);
    return `<div class="ring-wrap" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}"></circle>
        <circle class="ring-progress" cx="${size / 2}" cy="${size / 2}" r="${r}"
          stroke-dasharray="${c}" stroke-dashoffset="${offset}"></circle>
      </svg>
      <div class="ring-center">${Math.round(ratio * 7)}/7</div>
    </div>`;
  }

  async function toggleHabitToday(habitId) {
    const date = todayStr();
    const existing = cache.habit_logs.find((l) => l.habit_id === habitId && l.date === date && !l.deleted_at);
    if (existing) {
      await ClearDB.put("habit_logs", { ...existing, deleted_at: ClearDB.nowISO(), updated_at: ClearDB.nowISO(), dirty: true });
    } else {
      await ClearDB.put("habit_logs", {
        id: ClearDB.uuid(), habit_id: habitId, date, completed: 1,
        updated_at: ClearDB.nowISO(), created_at: ClearDB.nowISO(), dirty: true, deleted_at: null,
      });
    }
    await refreshCache();
    render();
    Sync.runSync();
  }

  function habitCard(h) {
    const ratio = last7Ratio(h.id);
    const doneToday = cache.habit_logs.some((l) => l.habit_id === h.id && l.date === todayStr() && !l.deleted_at);
    return `<div class="habit-card">
      ${ringSVG(ratio)}
      <div class="habit-name">${escapeHtml(h.name)}</div>
      <div class="habit-meta">${h.target_per_week}× / week</div>
      <button class="habit-toggle ${doneToday ? "done" : ""}" data-action="toggle-habit" data-id="${h.id}">
        ${doneToday ? "Done today" : "Mark done"}
      </button>
    </div>`;
  }

  function renderHabitsPanel(list) {
    if (!list.length) return `<div class="empty-state">No habits yet. Add one you'd like to keep showing up for.</div>`;
    return `<div class="habit-grid">${list.map(habitCard).join("")}</div>`;
  }

  // ----------------------------------------------------------------- Todos
  function todoRow(t) {
    return `<div class="list-row">
      <div class="check ${t.completed ? "done" : ""}" data-action="toggle-todo" data-id="${t.id}" role="checkbox" aria-checked="${!!t.completed}" tabindex="0"></div>
      <div class="row-title ${t.completed ? "done" : ""}">${escapeHtml(t.title)}</div>
      ${t.due_date ? `<span class="row-meta">${t.due_date}</span>` : ""}
      ${t.priority && t.priority !== "normal" ? `<span class="tag priority-${t.priority}">${t.priority}</span>` : ""}
      <button class="btn-quiet" data-action="delete-todo" data-id="${t.id}" aria-label="Delete to-do">✕</button>
    </div>`;
  }

  async function toggleTodo(id) {
    const t = cache.todos.find((x) => x.id === id);
    if (!t) return;
    await saveRow("todos", { ...t, completed: t.completed ? 0 : 1, completed_at: t.completed ? null : ClearDB.nowISO() });
    render();
  }

  // -------------------------------------------------------------- Expenses
  function expenseRow(e) {
    return `<div class="list-row">
      <span class="row-meta">${e.date}</span>
      <span class="tag">${escapeHtml(e.category)}</span>
      <div class="row-title">${escapeHtml(e.note || "")}</div>
      <div class="amount">$${fmtMoney(e.amount)}</div>
      <button class="btn-quiet" data-action="delete-expense" data-id="${e.id}" aria-label="Delete expense">✕</button>
    </div>`;
  }

  // ----------------------------------------------------------------- Goals
  function goalRow(g) {
    const pct = Math.min(100, Math.round((g.current_value / (g.target_value || 1)) * 100));
    return `<div class="list-row" style="flex-direction:column;align-items:stretch;gap:6px;">
      <div style="display:flex;justify-content:space-between;">
        <strong>${escapeHtml(g.title)}</strong>
        <span class="row-meta">${g.current_value}/${g.target_value} ${escapeHtml(g.unit || "")}</span>
      </div>
      <div style="height:8px;background:var(--surface-2);border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:var(--sage);"></div>
      </div>
    </div>`;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ------------------------------------------------------------------ Views
  function viewToday() {
    const dueTodos = cache.todos.filter((t) => !t.completed).slice(0, 6);
    const habits = cache.habits.filter((h) => !h.archived);
    const monthPrefix = todayStr().slice(0, 7);
    const spentThisMonth = cache.expenses.filter((e) => e.date.startsWith(monthPrefix)).reduce((s, e) => s + e.amount, 0);
    return `
      <div class="page-head">
        <div><h1 class="page-title">Today</h1><div class="page-sub">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div></div>
      </div>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${habits.length}</div><div class="stat-label">Active habits</div></div>
        <div class="stat-card"><div class="stat-value">${dueTodos.length}</div><div class="stat-label">Open to-dos</div></div>
        <div class="stat-card"><div class="stat-value">$${fmtMoney(spentThisMonth)}</div><div class="stat-label">Spent this month</div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Habits</h2></div>
        ${renderHabitsPanel(habits)}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Up next</h2></div>
        <div class="list">${dueTodos.length ? dueTodos.map(todoRow).join("") : `<div class="empty-state">Nothing pending — nice.</div>`}</div>
      </div>
    `;
  }

  function viewHabits() {
    return `
      <div class="page-head"><h1 class="page-title">Habits</h1><div class="page-sub">Consistency, not intensity.</div></div>
      <div class="panel panel-pad">
        <form class="inline-form" data-form="habit">
          <div class="field"><label for="habitName">New habit</label><input id="habitName" name="name" placeholder="e.g. Read 10 pages" required /></div>
          <div class="field" style="max-width:140px;"><label for="habitTarget">Times / week</label><input id="habitTarget" name="target_per_week" type="number" min="1" max="7" value="7" /></div>
          <button class="btn btn-primary" type="submit">Add habit</button>
        </form>
      </div>
      <div class="panel">${renderHabitsPanel(cache.habits.filter((h) => !h.archived))}</div>
    `;
  }

  function viewTodos() {
    const open = cache.todos.filter((t) => !t.completed).sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
    const done = cache.todos.filter((t) => t.completed);
    return `
      <div class="page-head"><h1 class="page-title">To-Dos</h1><div class="page-sub">${open.length} open</div></div>
      <div class="panel panel-pad">
        <form class="inline-form" data-form="todo">
          <div class="field"><label for="todoTitle">New to-do</label><input id="todoTitle" name="title" placeholder="What needs doing?" required /></div>
          <div class="field" style="max-width:150px;"><label for="todoDue">Due date</label><input id="todoDue" name="due_date" type="date" /></div>
          <div class="field" style="max-width:120px;"><label for="todoPriority">Priority</label>
            <select id="todoPriority" name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select>
          </div>
          <button class="btn btn-primary" type="submit">Add</button>
        </form>
      </div>
      <div class="panel"><div class="panel-head"><h2>Open</h2></div>
        <div class="list">${open.length ? open.map(todoRow).join("") : `<div class="empty-state">All clear.</div>`}</div>
      </div>
      ${done.length ? `<div class="panel"><div class="panel-head"><h2>Completed</h2></div><div class="list">${done.map(todoRow).join("")}</div></div>` : ""}
    `;
  }

  function viewExpenses() {
    const sorted = [...cache.expenses].sort((a, b) => b.date.localeCompare(a.date));
    const total = cache.expenses.reduce((s, e) => s + e.amount, 0);
    return `
      <div class="page-head"><h1 class="page-title">Expenses</h1><div class="page-sub">Total logged: $${fmtMoney(total)}</div></div>
      <div class="panel panel-pad">
        <form class="inline-form" data-form="expense">
          <div class="field" style="max-width:120px;"><label for="expAmount">Amount</label><input id="expAmount" name="amount" type="number" step="0.01" min="0" required /></div>
          <div class="field" style="max-width:150px;"><label for="expCategory">Category</label><input id="expCategory" name="category" placeholder="groceries" required /></div>
          <div class="field" style="max-width:150px;"><label for="expDate">Date</label><input id="expDate" name="date" type="date" value="${todayStr()}" /></div>
          <div class="field"><label for="expNote">Note</label><input id="expNote" name="note" placeholder="optional" /></div>
          <button class="btn btn-primary" type="submit">Add</button>
        </form>
      </div>
      <div class="panel"><div class="list">${sorted.length ? sorted.map(expenseRow).join("") : `<div class="empty-state">No expenses logged yet.</div>`}</div></div>
    `;
  }

  function viewGoals() {
    return `
      <div class="page-head"><h1 class="page-title">Goals</h1><div class="page-sub">Slow progress is still progress.</div></div>
      <div class="panel panel-pad">
        <form class="inline-form" data-form="goal">
          <div class="field"><label for="goalTitle">New goal</label><input id="goalTitle" name="title" placeholder="e.g. Save for trip" required /></div>
          <div class="field" style="max-width:110px;"><label for="goalTarget">Target</label><input id="goalTarget" name="target_value" type="number" value="100" /></div>
          <div class="field" style="max-width:100px;"><label for="goalUnit">Unit</label><input id="goalUnit" name="unit" placeholder="$, km…" /></div>
          <button class="btn btn-primary" type="submit">Add</button>
        </form>
      </div>
      <div class="panel"><div class="list">${cache.goals.length ? cache.goals.map(goalRow).join("") : `<div class="empty-state">No goals yet.</div>`}</div></div>
    `;
  }

  const VIEWS = { today: viewToday, habits: viewHabits, todos: viewTodos, expenses: viewExpenses, goals: viewGoals };

  function render() {
    main.innerHTML = VIEWS[currentView]();
    document.querySelectorAll(".nav-link").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === currentView));
  }

  function wireNav() {
    document.querySelectorAll(".nav-link").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentView = btn.dataset.view;
        render();
      });
    });
  }

  function wireActions() {
    main.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-action]");
      if (!t) return;
      const id = t.dataset.id;
      if (t.dataset.action === "toggle-habit") await toggleHabitToday(id);
      if (t.dataset.action === "toggle-todo") await toggleTodo(id);
      if (t.dataset.action === "delete-todo") await softDelete("todos", id);
      if (t.dataset.action === "delete-expense") await softDelete("expenses", id);
    });

    main.addEventListener("submit", async (e) => {
      const form = e.target.closest("form[data-form]");
      if (!form) return;
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const kind = form.dataset.form;
      if (kind === "habit") {
        await saveRow("habits", { name: data.name, target_per_week: Number(data.target_per_week) || 7, frequency: "weekly", archived: 0 }, { isNew: true });
        toast("Habit added");
      } else if (kind === "todo") {
        await saveRow("todos", { title: data.title, due_date: data.due_date || null, priority: data.priority, completed: 0 }, { isNew: true });
        toast("To-do added");
      } else if (kind === "expense") {
        await saveRow("expenses", { amount: Number(data.amount), category: data.category, date: data.date || todayStr(), note: data.note || "" }, { isNew: true });
        toast("Expense logged");
      } else if (kind === "goal") {
        await saveRow("goals", { title: data.title, target_value: Number(data.target_value) || 100, current_value: 0, unit: data.unit || "" }, { isNew: true });
        toast("Goal added");
      }
      form.reset();
      render();
    });
  }

  function wireStatus() {
    const pill = document.getElementById("statusPill");
    const text = document.getElementById("statusText");
    Sync.onStatusChange((state) => {
      pill.dataset.state = state;
      text.textContent = state === "online" ? "Synced with server" : state === "syncing" ? "Syncing…" : "Offline — saved locally";
    });
  }

  async function init() {
    wireNav();
    wireActions();
    wireStatus();
    await refreshCache();
    render();
    Sync.start();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Re-render after any background sync brings in new data.
    Sync.onStatusChange(async (state) => {
      if (state === "online") {
        await refreshCache();
        render();
      }
    });
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
