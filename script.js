/* ===========================
   Complete script.js (final)
   - Parses CSV/XLSX (PapaParse + xlsx assumed loaded)
   - Renders campaign/day tables (per-campaign)
   - Compares lastDay -> NEW_DATA_ARRAY (skips if new value === 0)
   - Renders CTR / Avg. CPC / Cost / Install Alerts with Benchmark + Actual
   - Graphing with Chart.js (assumed loaded)
   =========================== */

const statusEl = document.getElementById("status");
const out = document.getElementById("output");

const METRICS = ["CTR", "Avg. CPC", "Cost / Install", "Installs"];

// canonical key for matching (preserve D IQ number so D IQ 2 != D IQ 3)
const canonicalCampaignKey = (name) => (name || "").toString().trim();

// display-friendly name (keep the D IQ <number>: part if present but normalize spacing)
// This only affects UI labels (dropdown / table headers) — not matching.
const displayCampaign = (name) =>
  (name || "")
    .toString()
    .replace(/^\s*D\s*IQ\s*(\d+):\s*/i, "D IQ $1: ")
    .trim();

// Installs cleaning to remove commas/".00"
const cleanInstalls = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/[",]/g, "").replace(/\.00$/, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? String(Math.trunc(n)) : s;
};

// Robust numeric parser: removes %, ₹, commas and returns a numeric value (or 0)
const toFloat = (v) => {
  if (v === null || v === undefined) return 0;
  // Accept values like "3.58%", "₹0.30", "1,234", 0, "0"
  const s = String(v).replace(/[%₹,]/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function byDayAsc(a, b) {
  // Lexicographic day sort (works for ISO or string labels)
  return a.localeCompare(b);
}

function normalizeColumns(row) {
  const out = {};
  for (const k in row) out[(k || "").toString().trim()] = row[k];
  return out;
}

/* ---------- FILE NAME DISPLAY ---------- */
document.getElementById("fileInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  document.getElementById("fileName").textContent = file
    ? file.name
    : "No file selected";
});

/* ---------- CSV/XLSX PARSE ---------- */
function filterHeaderLines(csvText) {
  const lines = csvText.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*Campaign\s*,/i.test(l));
  return idx >= 0 ? lines.slice(idx).join("\n") : csvText;
}

async function parseFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  statusEl.textContent = `Parsing ${file.name}…`;

  if (ext === "csv") {
    const text = await file.text();
    const trimmed = filterHeaderLines(text);
    return new Promise((resolve, reject) => {
      Papa.parse(trimmed, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (res) => resolve(res.data.map(normalizeColumns)),
        error: reject,
      });
    });
  } else {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    return json.map(normalizeColumns);
  }
}

/* ---------- GLOBAL VARIABLES ---------- */
let parsedData = [];
const campaignSelect = document.getElementById("campaignSelect");
const metricSelect = document.getElementById("metricSelect");
const graphBtn = document.getElementById("showGraph");
const graphModal = document.getElementById("graphModal");
const closeGraph = document.getElementById("closeGraph");
let chartInstance = null;

/* ---------- NEW DATA (BENCHMARK) - hardcoded snapshot ----------
   You can replace this block or later make it uploadable.
*/
const NEW_DATA_ARRAY = [
  {
    Campaign: "D IQ 2: Andrd India Ads 10",
    CTR: "3.58%",
    "Avg. CPC": 0.3,
    "Cost / Install": 0.56,
    Installs: 557437,
  },
  {
    Campaign: "D IQ 2: Andrd Bangla Ads 20",
    CTR: "5.09%",
    "Avg. CPC": 0.24,
    "Cost / Install": 0.41,
    Installs: 221995,
  },
  {
    Campaign: "Brain Games: Andrd India TLC 25 v1",
    CTR: "3.57%",
    "Avg. CPC": 0.27,
    "Cost / Install": 0.61,
    Installs: 5390,
  },
  {
    Campaign: "D IQ 2: Andrd Spanish Ads 10 v1",
    CTR: "2.45%",
    "Avg. CPC": 1.21,
    "Cost / Install": 2.3,
    Installs: 1214,
  },
  {
    Campaign: "D IQ 2: Andrd Portuguese Ads 10 v1",
    CTR: "2.27%",
    "Avg. CPC": 1.16,
    "Cost / Install": 2.26,
    Installs: 45912,
  },
  {
    Campaign: "D IQ 3: Andrd India Ads 20",
    CTR: 0,
    "Avg. CPC": 0,
    "Cost / Install": 0,
    Installs: 0,
  },
  {
    Campaign: "D IQ 2: Andrd Pak Ads 20",
    CTR: "3.73%",
    "Avg. CPC": 0.25,
    "Cost / Install": 0.55,
    Installs: 115459,
  },
  {
    Campaign: "D IQ 2: Andrd India ROAS",
    CTR: "3.26%",
    "Avg. CPC": 0.41,
    "Cost / Install": 0.72,
    Installs: 512854,
  },
  {
    Campaign: "D IQ 2: Andrd India Ads 20 v1",
    CTR: "3.04%",
    "Avg. CPC": 0.32,
    "Cost / Install": 0.73,
    Installs: 331176,
  },
  {
    Campaign: "D IQ 2: Andrd Indonesia Ads 20 V1",
    CTR: "2.44%",
    "Avg. CPC": 0.69,
    "Cost / Install": 1.48,
    Installs: 37576,
  },
  {
    Campaign: "D IQ 2: Andrd Turkish TLC 15",
    CTR: "2.40%",
    "Avg. CPC": 0.72,
    "Cost / Install": 1.35,
    Installs: 66402,
  },
  {
    Campaign: "D IQ 2: Andrd Turkish ROAS",
    CTR: "2.26%",
    "Avg. CPC": 1.11,
    "Cost / Install": 2.3,
    Installs: 36313,
  },
  {
    Campaign: "D IQ 3: Andrd India Ads 10",
    CTR: "4.93%",
    "Avg. CPC": 0.19,
    "Cost / Install": 0.51,
    Installs: 69692,
  },
  {
    Campaign: "D IQ 2: Andrd Portuguese ROAS 135",
    CTR: "2.35%",
    "Avg. CPC": 1.64,
    "Cost / Install": 3.08,
    Installs: 5991,
  },
  {
    Campaign: "D IQ 2: Andrd French Ads 10",
    CTR: 0,
    "Avg. CPC": 0,
    "Cost / Install": 0,
    Installs: 0,
  },
  {
    Campaign: "D IQ 2: Andrd Pak ROAS 150",
    CTR: 0,
    "Avg. CPC": 0,
    "Cost / Install": 0,
    Installs: 0,
  },
];

/* ---------- BUILD TABLE PORTAL ---------- */
function buildPortal(rows) {
  // Normalize to expected columns
  const data = rows
    .map((r) => ({
      Campaign: (r["Campaign"] || "").toString().trim(),
      Day: (r["Day"] || "").toString().trim(),
      CTR: (r["CTR"] || "").toString().trim(),
      "Avg. CPC": (r["Avg. CPC"] || "").toString().trim(),
      "Cost / Install": (r["Cost / Install"] || "").toString().trim(),
      Installs: cleanInstalls(r["Installs"]),
    }))
    .filter((r) => r.Campaign && r.Day);

  if (!data.length) {
    statusEl.textContent =
      "No valid rows found. Make sure header starts at Campaign,…";
    out.innerHTML = "";
    return;
  }

  const daySet = new Set(data.map((d) => d.Day));
  const days = Array.from(daySet).sort(byDayAsc);
  if (days.length === 0) {
    statusEl.textContent = "No days found in data.";
    out.innerHTML = "";
    return;
  }
  const lastDay = days[days.length - 1];
  const prevDay = days.length >= 2 ? days[days.length - 2] : null;

  // Group by campaign
  const byCampaign = new Map();
  for (const r of data) {
    const key = canonicalCampaignKey(r.Campaign); // use canonical key (preserves D IQ number)
    if (!byCampaign.has(key)) byCampaign.set(key, []);
    byCampaign.get(key).push(r);
  }

  // Clear output area
  out.innerHTML = "";

  // Render campaign tables (per campaign, day columns)
  [...byCampaign.keys()].forEach((camp) => {
    const cleanName = displayCampaign(camp);
    const rowsForCamp = byCampaign.get(camp);
    const map = new Map(rowsForCamp.map((r) => [r.Day, r]));

    const table = document.createElement("table");
    table.className = "camp-table";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    const th0 = document.createElement("th");
    th0.textContent = cleanName;
    trh.appendChild(th0);
    days.forEach((d) => {
      const th = document.createElement("th");
      th.textContent = d;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    METRICS.forEach((metric) => {
      const tr = document.createElement("tr");
      tr.className = "metric-row";
      const tdName = document.createElement("td");
      tdName.className = "metric-name";
      tdName.textContent = metric;
      tr.appendChild(tdName);

      days.forEach((d) => {
        const td = document.createElement("td");
        const rec = map.get(d);
        let val = "";

        if (rec) {
          if (metric === "Installs") val = cleanInstalls(rec[metric]);
          else val = (rec[metric] || "").toString().replace(/\.00$/, "");
        }

        // For main tables: color last day vs previous day (keeps original behavior)
        if (d === lastDay && prevDay) {
          const prevRec = map.get(prevDay);
          const p = prevRec ? toFloat(prevRec[metric]) : 0;
          const n = rec ? toFloat(rec[metric]) : 0;

          let good = false;
          if (metric === "CTR") good = n > p;
          else if (metric === "Installs") good = n >= p;
          else if (metric === "Avg. CPC" || metric === "Cost / Install")
            good = n <= p;

          const span = document.createElement("span");
          span.textContent = val;
          span.className = good ? "good" : "bad";
          td.appendChild(span);
        } else {
          td.textContent = val;
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    out.appendChild(table);
  });

  statusEl.textContent = `Rendered ${byCampaign.size} campaign(s), ${
    days.length
  } day(s). Comparing ${prevDay || "N/A"} → ${lastDay}.`;

  /* ---------- ALERTS: compare lastDay (uploaded file) -> NEW_DATA_ARRAY (benchmark) ---------- */
  const alertGroups = {
    CTR: [],
    "Avg. CPC": [],
    "Cost / Install": [],
  };

  // Map benchmark data (NEW_DATA_ARRAY) by cleaned campaign name
  const newMap = new Map();
  NEW_DATA_ARRAY.forEach((r) => {
    const key = canonicalCampaignKey(r["Campaign"]); // same canonical key as byCampaign
    newMap.set(key, r);
  });

  // For each campaign, compare lastDay vs NEW_DATA_ARRAY values
  [...byCampaign.entries()].forEach(([camp, rows]) => {
    const cleanName = displayCampaign(camp);
    const map = new Map(rows.map((r) => [r.Day, r]));
    const lastRec = map.get(lastDay);
    const benchRec = newMap.get(camp); // camp is already canonicalCampaignKey
    if (!lastRec || !benchRec) return;

    // Only these three metrics produce alerts now
    ["CTR", "Avg. CPC", "Cost / Install"].forEach((metric) => {
      const actualValNum = toFloat(lastRec[metric]); // value from lastDay (actual)
      const benchValNum = toFloat(benchRec[metric]); // benchmark from NEW_DATA_ARRAY
      // If bench is exactly 0 => skip (neutral)
      if (benchValNum === 0) return;

      // Comparison rules: same as before
      let isBad = false;
      if (metric === "CTR")
        isBad = benchValNum < actualValNum ? false : actualValNum < benchValNum;
      // (we want to mark bad only if actual is worse than benchmark)
      // For CTR: actual < benchmark = bad
      // For Avg. CPC and Cost / Install: actual > benchmark = bad
      if (metric === "Avg. CPC" || metric === "Cost / Install")
        isBad = actualValNum > benchValNum;

      // Format values for display
      const formatVal = (m, v) => {
        if (m.includes("CTR"))
          return Number.isFinite(v) ? v.toFixed(2) + "%" : v;
        if (m.includes("CPC") || m.includes("Cost"))
          return Number.isFinite(v) ? "₹" + v.toFixed(2) : v;
        return Number.isFinite(v) ? v.toFixed(2) : v;
      };

      // If it's bad, push into alertGroups (we only show bad trends)
      if (isBad) {
        alertGroups[metric].push({
          Campaign: cleanName,
          Date: lastDay,
          Benchmark: formatVal(metric, benchValNum), // always black
          Actual: formatVal(metric, actualValNum), // colored based on comparison
          Good: !isBad,
        });
      }
    });
  });

  /* ---------- RENDER ALERT TABLE FUNCTION ---------- */
  function renderAlertTable(metricKey, containerId, titleText) {
    const dataForMetric = alertGroups[metricKey];
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    if (!dataForMetric.length) return;

    const table = document.createElement("table");
    table.className = "alert-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th colspan="4" style="background:#f1f5ff;font-size:15px;text-align:center;">
          🔴 ${titleText} Alerts
        </th>
      </tr>
      <tr>
        <th>Campaign</th>
        <th>Date</th>
        <th>Benchmark</th>
        <th>Actual</th>
      </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    dataForMetric.forEach((row) => {
      const tr = document.createElement("tr");
      // Benchmark must remain black always; Actual gets colored
      const actualColor = row.Good ? "var(--good)" : "var(--bad)";
      tr.innerHTML = `
        <td>${row.Campaign}</td>
        <td>${row.Date}</td>
        <td style="color:black;">${row.Benchmark}</td>
        <td style="font-weight:600; color:${actualColor};">${row.Actual}</td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  // Clear previous alert containers first (if they exist)
  ["ctrAlerts", "avgCpcAlerts", "cpiAlerts"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

  // Render only CTR / Avg. CPC / Cost / Install
  renderAlertTable("CTR", "ctrAlerts", "CTR");
  renderAlertTable("Avg. CPC", "avgCpcAlerts", "Avg. CPC");
  renderAlertTable("Cost / Install", "cpiAlerts", "Cost / Install");

  // If no alerts, show no-negative message
  if (
    !alertGroups["CTR"].length &&
    !alertGroups["Avg. CPC"].length &&
    !alertGroups["Cost / Install"].length
  ) {
    const alertContainer = document.getElementById("alertTables");
    if (alertContainer) {
      alertContainer.innerHTML = `<p style="color: var(--good); font-weight: 600;">✅ No negative trend detected vs new data.</p>`;
    }
  }

  // Populate campaigns in dropdown
  populateCampaignsFromMap(byCampaign);
}

/* ---------- POPULATE CAMPAIGN DROPDOWN ---------- */
function populateCampaignsFromMap(byCampaign) {
  const campaigns = [...byCampaign.keys()].filter(Boolean).sort();
  if (!campaignSelect) return;
  campaignSelect.innerHTML = '<option value="">Select Campaign</option>';
  campaigns.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c; // value = canonical name
    opt.textContent = displayCampaign(c); // label for user
    campaignSelect.appendChild(opt);
  });
}

/* ---------- FILE UPLOAD HANDLER ---------- */
document.getElementById("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) {
    out.innerHTML = "";
    statusEl.textContent = "Waiting for file…";
    return;
  }

  try {
    parsedData = await parseFile(file);
    buildPortal(parsedData);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Failed to parse file. Check format and try again.";
  }
});

/* ---------- GRAPH SECTION (Chart.js) ---------- */
/* Helpers to reset canvas size and create Chart.js charts */
function resetCanvasTo(parentSelector = null, width = 1200, height = 600) {
  const oldCanvas = document.getElementById("chartCanvas");
  const parent = oldCanvas
    ? oldCanvas.parentNode
    : parentSelector
    ? document.querySelector(parentSelector)
    : null;
  if (!parent) return null;

  const newCanvas = document.createElement("canvas");
  newCanvas.id = "chartCanvas";
  newCanvas.width = width;
  newCanvas.height = height;

  if (oldCanvas) parent.replaceChild(newCanvas, oldCanvas);
  else parent.appendChild(newCanvas);

  return newCanvas.getContext("2d");
}

graphBtn &&
  graphBtn.addEventListener("click", () => {
    if (!parsedData.length) {
      alert("Please upload a file first.");
      return;
    }

    const selectedCampaign = campaignSelect.value || "ALL";
    const selectedMetric = metricSelect.value || "ALL";

    renderSmartGraph(parsedData, selectedCampaign, selectedMetric);
    if (graphModal) graphModal.style.display = "block";
  });

closeGraph &&
  closeGraph.addEventListener("click", () => {
    if (graphModal) graphModal.style.display = "none";
  });

window.addEventListener("click", (e) => {
  if (e.target === graphModal) graphModal.style.display = "none";
});

/* ---------- SMART GRAPH RENDER ---------- */
function renderSmartGraph(data, selectedCampaign, selectedMetric) {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const ctx = resetCanvasTo(null, 1200, 600);
  if (!ctx) return;

  const daySet = new Set(data.map((d) => d.Day));
  const days = Array.from(daySet).sort(byDayAsc);

  const allMetrics = ["CTR", "Avg. CPC", "Cost / Install", "Installs"];
  const colors = ["#2563eb", "#16a34a", "#f97316", "#dc2626"];

  const toNum = (v) => {
    const s = (v || "")
      .toString()
      .replace(/[₹,%]/g, "")
      .replace(/,/g, "")
      .trim();
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  // Filter by campaign
  const filteredData =
    selectedCampaign === "ALL"
      ? data
      : data.filter((r) => r.Campaign === selectedCampaign);

  // Metrics to plot
  const metricsToPlot =
    selectedMetric === "ALL" ? allMetrics : [selectedMetric];

  // Prepare dataset for each metric
  const datasets = metricsToPlot.map((metric, idx) => {
    const color = colors[idx % colors.length];
    const values = days.map((d) => {
      const records = filteredData.filter((r) => r.Day === d);
      if (!records.length) return 0;
      const avg =
        records.reduce((sum, r) => sum + toNum(r[metric]), 0) /
        (records.length || 1);
      return avg;
    });

    return {
      label: metric,
      data: values,
      borderColor: color,
      backgroundColor: color + "33",
      tension: 0.35,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 6,
      yAxisID: "y" + idx,
    };
  });

  const yAxes = metricsToPlot.map((metric, idx) => ({
    id: "y" + idx,
    position: idx % 2 === 0 ? "left" : "right",
    grid: { drawOnChartArea: idx === 0 },
    ticks: {
      callback: (v) => {
        if (metric.includes("CTR")) return v.toFixed(1) + "%";
        if (metric.includes("CPC") || metric.includes("Cost"))
          return "₹" + v.toFixed(2);
        if (metric.includes("Install"))
          return v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(0);
        return v;
      },
    },
    title: { display: true, text: metric },
  }));

  chartInstance = new Chart(ctx, {
    type: "line",
    data: { labels: days, datasets },
    options: {
      responsive: false,
      maintainAspectRatio: true,
      animation: { duration: 0 },
      interaction: { mode: "nearest", intersect: false },
      scales: {
        x: {
          title: { display: true, text: "Day" },
          grid: { color: "rgba(0, 0, 0, 0.08)" },
          ticks: { maxRotation: 50, minRotation: 30 },
          border: { color: "#94a3b8", width: 1 },
        },
        ...Object.fromEntries(yAxes.map((y) => [y.id, y])),
      },
      plugins: {
        legend: { position: "bottom" },
        title: {
          display: true,
          text:
            selectedCampaign === "ALL"
              ? "All Campaigns – Combined Trend"
              : `${displayCampaign(selectedCampaign)} – ${
                  selectedMetric === "ALL" ? "All Metrics" : selectedMetric
                } Trend`,
          font: { size: 16 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.dataset.label;
              const value = ctx.formattedValue;
              return `${label}: ${value}`;
            },
          },
        },
      },
      elements: {
        point: {
          backgroundColor: "#2563eb",
          borderColor: "#fff",
          borderWidth: 1,
        },
      },
    },
  });
}

/* ---------- RENDER SINGLE CAMPAIGN METRIC GRAPH (optional) ---------- */
function renderGraph(data, campaign, metric) {
  const filtered = data.filter((r) => r.Campaign === campaign);
  if (!filtered.length) {
    alert("No data found for this campaign.");
    return;
  }

  const daySet = new Set(filtered.map((d) => d.Day));
  const days = Array.from(daySet).sort(byDayAsc);

  const values = days.map((d) => {
    const rec = filtered.find((r) => r.Day === d);
    if (!rec) return 0;
    let raw = (rec[metric] || "").toString().trim();
    raw = raw.replace(/[₹,%]/g, "").replace(/,/g, "").trim();
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : 0;
  });

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  const ctx = resetCanvasTo(null, 1200, 600);
  if (!ctx) return;

  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = Math.abs(maxVal - minVal) || 1;
  const pad = range * 0.2;
  const suggestedMin = Math.max(0, minVal - pad);
  const suggestedMax = maxVal + pad;

  let formatValue = (v) => v;
  if (metric.includes("CTR")) formatValue = (v) => v.toFixed(2) + "%";
  else if (metric.includes("CPC") || metric.includes("Cost"))
    formatValue = (v) => "₹" + v.toFixed(2);
  else if (metric.includes("Install"))
    formatValue = (v) =>
      v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(0);

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: days,
      datasets: [
        {
          label: `${displayCampaign(campaign)} – ${metric}`,
          data: values,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.15)",
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: true,
      animation: { duration: 0 },
      scales: {
        y: {
          beginAtZero: false,
          suggestedMin,
          suggestedMax,
          title: { display: true, text: metric },
          ticks: { callback: formatValue },
          grid: { color: "rgba(0, 0, 0, 0.12)" },
          border: { color: "#94a3b8", width: 1 },
        },
        x: {
          title: { display: true, text: "Day" },
          ticks: { maxRotation: 45, minRotation: 30 },
          grid: { color: "rgba(0, 0, 0, 0.08)" },
          border: { color: "#94a3b8", width: 1 },
        },
      },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `${displayCampaign(campaign)} – ${metric} Trend`,
          font: { size: 16 },
        },
      },
    },
  });
}

/* ---------- OPEN TREND PAGE ---------- */
document.getElementById("trendBtn")?.addEventListener("click", () => {
  if (!parsedData.length) {
    alert("Please upload a file first to analyze trends.");
    return;
  }

  sessionStorage.setItem("trendData", JSON.stringify(parsedData));
  window.open("trend.html", "_blank");
});
