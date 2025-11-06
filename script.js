const statusEl = document.getElementById('status');
const out = document.getElementById('output');

const METRICS = ['CTR', 'Avg. CPC', 'Cost / Install', 'Installs'];

const cleanCampaign = (name) =>
  (name || '').toString().replace(/^\s*D\s*IQ\s*\d*:\s*/i, '').trim();

const cleanInstalls = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/[",]/g, '').replace(/\.00$/, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? String(Math.trunc(n)) : s;
};

const toFloat = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace('%', '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function byDayAsc(a, b) {
  return a.localeCompare(b);
}

function normalizeColumns(row) {
  const out = {};
  for (const k in row) out[(k || '').toString().trim()] = row[k];
  return out;
}

// ---------- FILE NAME DISPLAY ----------
document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  document.getElementById('fileName').textContent = file ? file.name : 'No file selected';
});

// ---------- CSV/XLSX PARSE ----------
function filterHeaderLines(csvText) {
  const lines = csvText.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*Campaign\s*,/i.test(l));
  return idx >= 0 ? lines.slice(idx).join('\n') : csvText;
}

async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  statusEl.textContent = `Parsing ${file.name}…`;

  if (ext === 'csv') {
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
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return json.map(normalizeColumns);
  }
}

// ---------- GLOBAL VARIABLES ----------
let parsedData = [];
const campaignSelect = document.getElementById('campaignSelect');
const metricSelect = document.getElementById('metricSelect');
const graphBtn = document.getElementById('showGraph');
const graphModal = document.getElementById('graphModal');
const closeGraph = document.getElementById('closeGraph');
const chartCanvas = document.getElementById('chartCanvas');
let chartInstance = null;

// ---------- BUILD TABLE PORTAL ----------
function buildPortal(rows) {
  const data = rows
    .map((r) => ({
      Campaign: (r['Campaign'] || '').toString().trim(),
      Day: (r['Day'] || '').toString().trim(),
      CTR: (r['CTR'] || '').toString().trim(),
      'Avg. CPC': (r['Avg. CPC'] || '').toString().trim(),
      'Cost / Install': (r['Cost / Install'] || '').toString().trim(),
      Installs: cleanInstalls(r['Installs']),
    }))
    .filter((r) => r.Campaign && r.Day);

  if (!data.length) {
    statusEl.textContent = 'No valid rows found. Make sure header starts at Campaign,…';
    return;
  }

  const daySet = new Set(data.map((d) => d.Day));
  const days = Array.from(daySet).sort(byDayAsc);
  const prevDay = days[days.length - 2];
  const lastDay = days[days.length - 1];

  const byCampaign = new Map();
  for (const r of data) {
    const key = r.Campaign;
    if (!byCampaign.has(key)) byCampaign.set(key, []);
    byCampaign.get(key).push(r);
  }

  out.innerHTML = '';

  [...byCampaign.keys()].forEach((camp) => {
    const cleanName = cleanCampaign(camp);
    const rows = byCampaign.get(camp);
    const map = new Map(rows.map((r) => [r.Day, r]));

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.textContent = cleanName;
    trh.appendChild(th0);
    days.forEach((d) => {
      const th = document.createElement('th');
      th.textContent = d;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    METRICS.forEach((metric) => {
      const tr = document.createElement('tr');
      tr.className = 'metric-row';
      const tdName = document.createElement('td');
      tdName.className = 'metric-name';
      tdName.textContent = metric;
      tr.appendChild(tdName);

      days.forEach((d) => {
        const td = document.createElement('td');
        const rec = map.get(d);
        let val = '';

        if (rec) {
          if (metric === 'Installs') val = cleanInstalls(rec[metric]);
          else val = (rec[metric] || '').toString().replace(/\.00$/, '');
        }

        if (d === lastDay && days.length >= 2) {
          const prevRec = map.get(prevDay);
          const p = prevRec ? toFloat(prevRec[metric]) : 0;
          const n = rec ? toFloat(rec[metric]) : 0;

          let good = false;
          if (metric === 'CTR') good = n > p;
          else if (metric === 'Installs') good = n >= p;
          else if (metric === 'Avg. CPC' || metric === 'Cost / Install') good = n <= p;

          const span = document.createElement('span');
          span.textContent = val;
          span.className = good ? 'good' : 'bad';
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

  statusEl.textContent = `Rendered ${byCampaign.size} campaign(s), ${days.length} day(s). Comparing ${prevDay} → ${lastDay}.`;

  // ✅ Populate campaign dropdown here
  populateCampaignsFromMap(byCampaign);
}

// ---------- POPULATE CAMPAIGN DROPDOWN ----------
function populateCampaignsFromMap(byCampaign) {
  const campaigns = [...byCampaign.keys()].filter(Boolean).sort();
  campaignSelect.innerHTML = '<option value="">Select Campaign</option>';
  campaigns.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = cleanCampaign(c);
    campaignSelect.appendChild(opt);
  });
}

// ---------- FILE UPLOAD HANDLER ----------
document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) {
    out.innerHTML = '';
    statusEl.textContent = 'Waiting for file…';
    return;
  }

  try {
    parsedData = await parseFile(file);
    buildPortal(parsedData); // this now also populates dropdown
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed to parse file. Check format and try again.';
  }
});

// ---------- GRAPH FEATURE ----------
// ---------- GRAPH FEATURE (UPDATED) ----------
graphBtn.addEventListener("click", () => {
  if (!parsedData.length) {
    alert("Please upload a file first.");
    return;
  }

  const selectedCampaign = campaignSelect.value || "ALL";
  const selectedMetric = metricSelect.value || "ALL";

  renderSmartGraph(parsedData, selectedCampaign, selectedMetric);
  graphModal.style.display = "block";
});

closeGraph.addEventListener("click", () => {
  graphModal.style.display = "none";
});

window.addEventListener("click", (e) => {
  if (e.target === graphModal) graphModal.style.display = "none";
});

function resetCanvas() {
  const oldCanvas = document.getElementById("chartCanvas");
  const parent = oldCanvas.parentNode;
  const newCanvas = document.createElement("canvas");
  newCanvas.id = "chartCanvas";
  newCanvas.width = 800;
  newCanvas.height = 400;
  parent.replaceChild(newCanvas, oldCanvas);
  return newCanvas.getContext("2d");
}

// ---------- SMART GRAPH RENDER ----------
function renderSmartGraph(data, selectedCampaign, selectedMetric) {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const ctx = resetCanvas();
  const daySet = new Set(data.map((d) => d.Day));
  const days = Array.from(daySet).sort(byDayAsc);

  const allMetrics = ["CTR", "Avg. CPC", "Cost / Install", "Installs"];
  const colors = ["#2563eb", "#16a34a", "#f97316", "#dc2626"];

  const toNum = (v) => {
    const s = (v || "").toString().replace(/[₹,%]/g, "").replace(/,/g, "").trim();
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
      yAxisID: "y" + idx, // unique axis for each metric
    };
  });

  // Create dynamic Y-axis per metric
  const yAxes = metricsToPlot.map((metric, idx) => ({
    id: "y" + idx,
    position: idx % 2 === 0 ? "left" : "right", // alternate left/right
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

  // Build the chart
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
              : `${cleanCampaign(selectedCampaign)} – ${
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


closeGraph.addEventListener('click', () => {
  graphModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === graphModal) graphModal.style.display = 'none';
});

function resetCanvas() {
  const oldCanvas = document.getElementById("chartCanvas");
  const parent = oldCanvas.parentNode;
  const newCanvas = document.createElement("canvas");
  newCanvas.id = "chartCanvas";

  // 🔹 Increased fixed drawing size (HD canvas)
  newCanvas.width = 1200; // wider
  newCanvas.height = 600; // taller

  parent.replaceChild(newCanvas, oldCanvas);
  return newCanvas.getContext("2d");
}


function renderGraph(data, campaign, metric) {
  const filtered = data.filter((r) => r.Campaign === campaign);
  if (!filtered.length) {
    alert("No data found for this campaign.");
    return;
  }

  const daySet = new Set(filtered.map((d) => d.Day));
  const days = Array.from(daySet).sort(byDayAsc);

  // 🔹 Force numeric cleaning for all metric types
  const values = days.map((d) => {
    const rec = filtered.find((r) => r.Day === d);
    if (!rec) return 0;
    let raw = (rec[metric] || "").toString().trim();

    // Remove % and currency and commas
    raw = raw.replace(/[₹,%]/g, "").replace(/,/g, "").trim();

    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : 0;
  });

  // 🔹 Reset chart properly each time
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  const ctx = resetCanvas();

  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = Math.abs(maxVal - minVal) || 1;

  // Tight auto zoom for flat data (e.g., installs 5200–5300)
  const pad = range * 0.2;
  const suggestedMin = Math.max(0, minVal - pad);
  const suggestedMax = maxVal + pad;

  // 🔹 Axis formatting per metric
  let formatValue = (v) => v;
  if (metric.includes("CTR")) formatValue = (v) => v.toFixed(2) + "%";
  else if (metric.includes("CPC") || metric.includes("Cost"))
    formatValue = (v) => "₹" + v.toFixed(2);
  else if (metric.includes("Install"))
    formatValue = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(0));

  // 🔹 Build chart fresh
  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: days,
      datasets: [
        {
          label: `${cleanCampaign(campaign)} – ${metric}`,
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
          text: `${cleanCampaign(campaign)} – ${metric} Trend`,
          font: { size: 16 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${metric}: ${formatValue(ctx.parsed.y)}`,
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







