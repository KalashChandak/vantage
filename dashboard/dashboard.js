// dashboard/dashboard.js

// ── tab switching ──────────────────────────────────────────────────────
document.querySelectorAll("nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll("main section").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.section).classList.add("active");
  });
});

// ── overview gauge cards ────────────────────────────────────────────────
function gaugeSvg(percent, color) {
  const r = 26, c = 2 * Math.PI * r;
  const filled = (percent / 100) * c;
  return `
    <svg width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="#2a2f3a" stroke-width="6" />
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="6"
        stroke-dasharray="${filled} ${c}" stroke-linecap="round"
        transform="rotate(-90 32 32)" />
      <text x="32" y="37" text-anchor="middle" font-size="13" fill="#e6e8ec" font-family="ui-monospace, monospace">${percent}%</text>
    </svg>`;
}

async function renderOverview() {
  const container = document.getElementById("overview-cards");
  const snapshot = await getLatest("claude");

  container.innerHTML = "";

  const card = document.createElement("div");
  card.className = "gauge-card";

  if (!snapshot) {
    card.innerHTML = `
      <div>${gaugeSvg(0, "#2a2f3a")}</div>
      <div>
        <div class="label">Claude</div>
        <div class="detail">No data yet — open a claude.ai tab, or the usage endpoint isn't configured. See README.</div>
      </div>`;
  } else {
    const color = snapshot.percentUsed > 85 ? "#ef5350" : snapshot.percentUsed > 60 ? "#f2a94d" : "#5b8cff";
    card.innerHTML = `
      <div>${gaugeSvg(snapshot.percentUsed, color)}</div>
      <div>
        <div class="label">Claude · ${snapshot.model}</div>
        <div class="big">${snapshot.percentUsed}%</div>
        <div class="detail">~${snapshot.messagesLeftEstimate} messages left</div>
      </div>`;
  }
  container.appendChild(card);

  // Placeholder cards hinting at what's coming, so the dashboard doesn't
  // look empty/unfinished — honest about what's not wired up yet.
  ["ChatGPT", "Gemini", "Grok"].forEach((label) => {
    const c = document.createElement("div");
    c.className = "gauge-card";
    c.innerHTML = `
      <div>${gaugeSvg(0, "#2a2f3a")}</div>
      <div>
        <div class="label">${label}</div>
        <div class="detail">Not connected yet — Phase 1.x</div>
      </div>`;
    container.appendChild(c);
  });
}

// ── trends chart ────────────────────────────────────────────────────────
async function renderTrends() {
  const history = await getHistory("claude");
  const svg = document.getElementById("trend-chart-svg");
  const W = 700, H = 220, PAD = 30;

  if (history.length < 2) {
    svg.innerHTML = `<text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#8b93a1" font-size="12">Not enough data yet — check back after a bit more usage.</text>`;
    return;
  }

  const xs = history.map((s) => s.fetchedAt);
  const ys = history.map((s) => s.percentUsed);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const scaleX = (x) => PAD + ((x - minX) / (maxX - minX || 1)) * (W - PAD * 2);
  const scaleY = (y) => H - PAD - (y / 100) * (H - PAD * 2);

  let gridlines = "";
  [0, 25, 50, 75, 100].forEach((v) => {
    const y = scaleY(v);
    gridlines += `<line x1="${PAD}" y1="${y}" x2="${W-PAD}" y2="${y}" class="gridline" />`;
    gridlines += `<text x="4" y="${y + 3}">${v}%</text>`;
  });

  const points = history.map((s) => `${scaleX(s.fetchedAt)},${scaleY(s.percentUsed)}`).join(" ");

  svg.innerHTML = `${gridlines}<polyline class="line" points="${points}" />`;
}

// ── boot ─────────────────────────────────────────────────────────────
renderOverview();
renderTrends();
