const API = window.location.origin;

/* =========================================================
   LASER LABELS & UNITS (ORDERED + SAME COLOR)
========================================================= */

const LASER_LABELS = {
  current: "Current",
  voltage: "Voltage",
  tec_load_1: "TEC Load 1",
  diode_temperature: "Diode Temperature",
  tec_load_2: "TEC Load 2",
  electronics_temperature: "Electronics Temperature",
  fan_load: "Fan Load",
  body_temperature: "Body Temperature"
};

const LASER_UNITS = {
  current: "mA",
  voltage: "V",
  tec_load_1: "%",
  diode_temperature: "°C",
  tec_load_2: "%",
  electronics_temperature: "°C",
  fan_load: "%",
  body_temperature: "°C"
};

/* =========================================================
   SOCKET CONNECTIONS
========================================================= */

const laserSocket = io("/ws/laser/status");
const timetaggerSocket = io("/ws/timetagger/status");

/* =========================================================
   LASER (REST immediate + WS sync)
========================================================= */

function laserOn(state) {
  return state !== "OFF";
}

laserSocket.on("connect", () => {
  console.log("[WS] Laser connected");
});

laserSocket.on("laser_status", (data) => {
  updateLaserUI(data);
});

function updateLaserUI(r) {
  const toggle = document.getElementById("laserToggle");
  const pill = document.getElementById("laserState");

  const isOn = laserOn(r.power_state);
  toggle.checked = isOn;
  pill.textContent = r.power_state;
  pill.className = `pill ${isOn ? "live" : "idle"}`;

  // Immediate REST response for realtime feel
  toggle.onchange = async () => {
    const desired = toggle.checked ? 1 : 0;

    try {
      const res = await fetch(
        `${API}/laser/control?switch=${desired}`
      ).then(r => r.json());

      if (res.status !== "ok") {
        throw new Error(res.error || "Laser control failed");
      }

      const powerState = res.power_state;
      const onNow = powerState !== "OFF";

      toggle.checked = onNow;
      pill.textContent = powerState;
      pill.className = `pill ${onNow ? "live" : "idle"}`;

    } catch (err) {
      console.error("Laser control error:", err);
      toggle.checked = !toggle.checked; // rollback
    }
  };

  // -------- Telemetry (ordered labels + same-color units) --------
  const grid = document.getElementById("laserTelemetry");
  grid.innerHTML = "";

  Object.entries(LASER_LABELS).forEach(([key, label]) => {
    if (!(key in r)) return;

    const raw = r[key];
    const value = Number(raw);
    const unit = LASER_UNITS[key] || "";

    grid.innerHTML += `
      <div>
        <div class="label">${label}</div>
        <div class="value">
          ${isNaN(value) ? raw : value.toFixed(2)}
          <span style="font-size:12px;">${unit}</span>
        </div>
      </div>
    `;
  });
}

/* =========================================================
   TIMETAGGER TEST SIGNALS (REST immediate + WS sync)
========================================================= */

let enabledTestChannels = new Set();

timetaggerSocket.on("connect", () => {
  console.log("[WS] TimeTagger connected");
});

timetaggerSocket.on("timetagger_status", (data) => {
  enabledTestChannels = new Set(data.test_enabled_channels);
  renderTestSignals();
});

function renderTestSignals() {
  const box = document.getElementById("testChannels");
  box.innerHTML = "";

  for (let ch = 1; ch <= 8; ch++) {
    const pill = document.createElement("div");
    pill.className =
      "channel-pill" + (enabledTestChannels.has(ch) ? " active" : "");
    pill.textContent = `CH ${ch}`;

    pill.onclick = async () => {
      const enable = enabledTestChannels.has(ch) ? 0 : 1;

      try {
        const res = await fetch(
          `${API}/timetagger/testing?enable=${enable}&ch=${ch}`
        ).then(r => r.json());

        if (res.status !== "ok") {
          throw new Error("Test signal update failed");
        }

        // REST response = immediate truth
        enabledTestChannels = new Set(res.test_enabled_channels);
        renderTestSignals();

      } catch (err) {
        console.error("Test signal error:", err);
        // WS will resync if needed
      }
    };

    box.appendChild(pill);
  }
}

/* =========================================================
   COUNTRATE (REST, centered realtime graph)
========================================================= */

const CR_POINTS = 61;
const CR_CENTER = Math.floor(CR_POINTS / 2);

const CHANNEL_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#7c3aed",
  "#ea580c", "#0891b2", "#ca8a04", "#9333ea"
];

let crRunning = false;
let crTimer = null;
let selectedCRChannels = new Set([1]);
let crChart = null;

/* ---------- Channel selector ---------- */

function initCRChannelSelector() {
  const box = document.getElementById("crChannels");
  box.innerHTML = "";

  for (let ch = 1; ch <= 8; ch++) {
    const pill = document.createElement("div");
    pill.className =
      "channel-pill" + (selectedCRChannels.has(ch) ? " active" : "");
    pill.textContent = `CH ${ch}`;

    pill.onclick = () => {
      if (selectedCRChannels.has(ch)) {
        selectedCRChannels.delete(ch);
      } else {
        selectedCRChannels.add(ch);
      }
      pill.classList.toggle("active");
      rebuildCRDatasets();
    };

    box.appendChild(pill);
  }
}

/* ---------- Chart ---------- */

function initCountrateChart() {
  const ctx = document.getElementById("crChart");

  crChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: Array.from({ length: CR_POINTS }, (_, i) => i - CR_CENTER),
      datasets: []
    },
    options: {
      animation: { duration: 250, easing: "linear" },
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { display: false },
        y: { min: 0, title: { display: true, text: "Counts / s" } }
      }
    },
    plugins: [centerValueLabelPlugin]
  });

  rebuildCRDatasets();
}

/* ---------- Dataset rebuild ---------- */

function rebuildCRDatasets() {
  crChart.data.datasets = [...selectedCRChannels].map((ch) => ({
    label: `CH ${ch}`,
    data: Array(CR_POINTS).fill(0),
    borderColor: CHANNEL_COLORS[ch - 1],
    borderWidth: 2,
    tension: 0.35,
    pointRadius: (ctx) => (ctx.dataIndex === CR_CENTER ? 4 : 0),
    pointBackgroundColor: CHANNEL_COLORS[ch - 1]
  }));
  crChart.update();
}

/* ---------- Start / Stop ---------- */

document.getElementById("crToggle").onclick = () => {
  crRunning = !crRunning;
  const btn = document.getElementById("crToggle");
  btn.textContent = crRunning ? "Stop" : "Start";
  btn.classList.toggle("running", crRunning);

  if (crRunning) startCountrate();
  else clearInterval(crTimer);
};

function startCountrate() {
  const rtime = parseFloat(document.getElementById("crTime").value);

  crTimer = setInterval(async () => {
    if (!selectedCRChannels.size) return;

    const channels = [...selectedCRChannels];
    const res = await fetch(
      `${API}/timetagger/countrate?ch=${channels.join(",")}&rtime=${rtime}`
    ).then(r => r.json());

    crChart.data.datasets.forEach(ds => {
      const ch = parseInt(ds.label.replace("CH ", ""));
      const val = res.channel_click_rate[ch] ?? 0;

      ds.data.splice(CR_CENTER, 0, val);
      ds.data.pop();
    });

    crChart.update();
  }, Math.max(200, rtime * 1000));
}

/* ---------- Center value label plugin ---------- */

const centerValueLabelPlugin = {
  id: "centerValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const usedY = [];

    chart.data.datasets.forEach((ds) => {
      const meta = chart.getDatasetMeta(ds._datasetIndex ?? 0);
      const point = meta.data[CR_CENTER];
      if (!point) return;

      const value = ds.data[CR_CENTER];
      let y = point.y;

      while (usedY.some(prev => Math.abs(prev - y) < 18)) {
        y -= 18;
      }
      usedY.push(y);

      ctx.save();
      ctx.font = "12px system-ui";
      const text = value.toString();
      const w = ctx.measureText(text).width + 10;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = ds.borderColor;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.roundRect(point.x + 8, y - 10, w, 18, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#111827";
      ctx.fillText(text, point.x + 13, y + 4);
      ctx.restore();
    });
  }
};

/* =========================================================
   INIT
========================================================= */

initCRChannelSelector();
initCountrateChart();
