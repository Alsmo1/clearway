// public/js/admin.js
(() => {
  const lockScreen = document.getElementById("lockScreen");
  const adminApp = document.getElementById("adminApp");
  const toastEl = document.getElementById("toast");

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function adminPassword() {
    return sessionStorage.getItem("clearway_admin_pw");
  }

  async function adminFetch(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { ...(opts.headers || {}), "X-Admin-Password": adminPassword() },
    });
    if (res.status === 401) {
      sessionStorage.removeItem("clearway_admin_pw");
      showLock("Session expired — enter the password again.");
      throw new Error("Unauthorized");
    }
    return res.json();
  }

  function showLock(error) {
    lockScreen.style.display = "block";
    adminApp.style.display = "none";
    document.getElementById("loginError").textContent = error || "";
  }

  function showApp() {
    lockScreen.style.display = "none";
    adminApp.style.display = "block";
    loadStats();
  }

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = document.getElementById("pw").value;
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.ok) {
      sessionStorage.setItem("clearway_admin_pw", password);
      showApp();
    } else {
      document.getElementById("loginError").textContent = "Incorrect password.";
    }
  });

  function statCard(value, label) {
    return `<div class="stat-card"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
  }

  async function loadStats() {
    const s = await adminFetch("/api/admin/stats");
    document.getElementById("statGrid").innerHTML = [
      statCard(s.counts.habits, "Active habits"),
      statCard(s.counts.todosOpen, "Open to-dos"),
      statCard(s.counts.todosDone, "Completed to-dos"),
      statCard(`$${s.totalSpent.toFixed(2)}`, "Total spent"),
      statCard(s.counts.goals, "Active goals"),
    ].join("");

    const cats = Object.entries(s.spendByCategory).sort((a, b) => b[1] - a[1]);
    document.getElementById("categoryBreakdown").innerHTML = cats.length
      ? cats.map(([cat, amt]) => {
          const max = cats[0][1] || 1;
          const pct = Math.round((amt / max) * 100);
          return `<div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>${cat}</span><span class="amount">$${amt.toFixed(2)}</span></div>
            <div style="height:8px;background:var(--surface-2);border-radius:99px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--ochre);"></div></div>
          </div>`;
        }).join("")
      : `<div class="empty-state">No expenses logged yet.</div>`;

    const max = Math.max(1, ...s.checkInsPerDay.map((d) => d.count));
    document.getElementById("checkinChart").innerHTML = `
      <div style="display:flex;align-items:flex-end;gap:10px;height:120px;">
        ${s.checkInsPerDay.map((d) => `
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;">
            <div style="width:100%;background:var(--sage-soft);border-radius:4px;height:${Math.max(4, (d.count / max) * 90)}px;position:relative;">
              <div style="position:absolute;bottom:0;left:0;right:0;background:var(--sage);border-radius:4px;height:100%;"></div>
            </div>
            <span style="font-size:11px;color:var(--ink-soft);">${d.date.slice(5)}</span>
          </div>`).join("")}
      </div>`;

    document.getElementById("lastBackup").textContent = s.lastBackupAt
      ? `Last backup: ${new Date(s.lastBackupAt).toLocaleString()}`
      : "No backup saved yet.";
    document.getElementById("backupFolder").textContent = s.backupFolder || "";
  }

  document.getElementById("backupNow").addEventListener("click", async () => {
    const btn = document.getElementById("backupNow");
    btn.disabled = true;
    btn.textContent = "Backing up…";
    try {
      const result = await adminFetch("/api/backup/now", { method: "POST" });
      if (result.ok) {
        toast("Backup saved to your device.");
        loadStats();
      } else {
        toast(result.error || "Backup failed.");
      }
    } catch {
      toast("Backup failed.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Back up now";
    }
  });

  if (adminPassword()) {
    showApp();
  } else {
    showLock();
  }
})();
