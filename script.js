// ---------- DOM REFERENCES ----------
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
  for (const k in row) {
    out[(k || '').toString().trim()] = row[k];
  }
  return out;
}

// ---------- FILE INPUT ----------
document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  document.getElementById('fileName').textContent = file ? file.name : 'No file selected';
});

// ---------- CSV CLEANUP ----------
function filterHeaderLines(csvText) {
  const lines = csvText.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*Campaign\s*,/i.test(l));
  return idx >= 0 ? lines.slice(idx).join('\n') : csvText;
}

// ---------- PARSER ----------
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

// ---------- MAIN BUILD ----------
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
  if (days.length < 2) {
    statusEl.textContent = 'Need at least two days to compare.';
    return;
  }

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

        // Highlight only last day's digit
        if (d === lastDay && days.length >= 2) {
          const prevRec = map.get(prevDay);
          const p = prevRec
            ? metric === 'Installs'
              ? toFloat(cleanInstalls(prevRec[metric]))
              : toFloat(prevRec[metric])
            : 0;
          const n = rec
            ? metric === 'Installs'
              ? toFloat(cleanInstalls(rec[metric]))
              : toFloat(rec[metric])
            : 0;

          let good = false;
          if (metric === 'CTR') good = n > p;
          else if (metric === 'Installs') good = n >= p;
          else if (metric === 'Avg. CPC' || metric === 'Cost / Install')
            good = n <= p;

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

    const sep = document.createElement('div');
    sep.className = 'sep';
    out.appendChild(sep);
  });

  statusEl.textContent = `Rendered ${byCampaign.size} campaign(s), ${days.length} day(s). Comparing ${prevDay} → ${lastDay}.`;

  // Initial chart render
  renderChart(byCampaign, days, 'CTR');

  // Populate campaign dropdown
  const campaignSelect = document.getElementById('campaignSelect');
  campaignSelect.innerHTML = '<option value="all">All Campaigns</option>';
  [...byCampaign.keys()].forEach((c) => {
    const option = document.createElement('option');
    option.value = c;
    option.textContent = cleanCampaign(c);
    campaignSelect.appendChild(option);
  });

  // Metric dropdown
  const metricSelect = document.getElementById('metricSelect');
  metricSelect.onchange = (e) => {
    const selectedMetric = e.target.value;
    const selectedCampaign = campaignSelect.value;
    renderChart(byCampaign, days, selectedMetric, selectedCampaign);
  };

  // Campaign dropdown
  campaignSelect.onchange = (e) => {
    const selectedCampaign = e.target.value;
    const selectedMetric = metricSelect.value;
    renderChart(byCampaign, days, selectedMetric, selectedCampaign);

    // Hide/show tables
    const tables = document.querySelectorAll('#output table');
    tables.forEach((t) => {
      const title = t.querySelector('th')?.textContent || '';
      t.style.display =
        selectedCampaign === 'all' || title.includes(cleanCampaign(selectedCampaign))
          ? ''
          : 'none';
    });
  };
}

// ---------- FILE UPLOAD EVENT ----------
document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) {
    out.innerHTML = '';
    statusEl.textContent = 'Waiting for file…';
    return;
  }

  try {
    const rows = await parseFile(file);
    buildPortal(rows);
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Failed to parse file. Check format and try again.';
  }
});

// ---------- CHART.JS ----------
let chartInstance = null;

function renderChart(dataByCampaign, days, metric, selectedCampaign = 'all') {
  const ctx = document.getElementById('campaignChart')?.getContext('2d');
  if (!ctx) return;

  const keys =
    selectedCampaign === 'all' ? [...dataByCampaign.keys()] : [selectedCampaign];

  const datasets = keys.map((campaign, i) => {
    const rows = dataByCampaign.get(campaign);
    const dayMap = new Map(rows.map((r) => [r.Day, r]));
    const values = days.map((d) => {
      const rec = dayMap.get(d);
      if (!rec) return null;
      const val =
        metric === 'Installs'
          ? parseFloat(rec[metric].replace(/,/g, '')) || 0
          : parseFloat(rec[metric].replace('%', '').trim()) || 0;
      return val;
    });

    const colors = [
      '#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6',
      '#0ea5e9', '#d946ef', '#10b981', '#f97316', '#64748b'
    ];
    const color = colors[i % colors.length];

    return {
      label: cleanCampaign(campaign),
      data: values,
      borderColor: color,
      backgroundColor: color + '33',
      borderWidth: 3.5,
      pointRadius: 6,
      pointHoverRadius: 8,
      pointHitRadius: 0,
      pointBackgroundColor: color,
      pointHoverBackgroundColor: '#fff',
      pointBorderColor: color,
      pointHoverBorderColor: color,
      pointBorderWidth: 2,
      tension: 0.35,
      fill: false,
    };
  });

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: days, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 40, bottom: 20, left: 20, right: 20 },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#111827',
            font: { size: 14, weight: '600' },
            boxWidth: 18,
            padding: 12,
          },
        },
        title: {
          display: true,
          text:
            selectedCampaign === 'all'
              ? `${metric} Trend Across All Campaigns`
              : `${metric} Trend – ${cleanCampaign(selectedCampaign)}`,
          color: '#0f172a',
          font: { size: 20, weight: '700' },
          padding: { bottom: 25 },
        },
        tooltip: {
          enabled: false, // We'll handle tooltips manually
          external: function (context) {
            const tooltipEl =
              document.getElementById('chartjs-tooltip') ||
              createCustomTooltipElement();
            const tooltipModel = context.tooltip;

            if (tooltipModel.opacity === 0) {
              tooltipEl.style.opacity = 0;
              return;
            }

            const point = tooltipModel.dataPoints?.[0];
            if (!point) return;

            const val = point.parsed.y;
            let formattedVal =
              metric === 'CTR'
                ? val.toFixed(2) + '%'
                : metric === 'Installs'
                ? val.toLocaleString()
                : val.toFixed(2);

            tooltipEl.innerHTML = `
              <div style="font-weight:600;margin-bottom:2px;">📅 ${point.label}</div>
              <div style="color:#2563eb;font-weight:600;">${point.dataset.label}</div>
              <div style="font-size:14px;">${metric}: ${formattedVal}</div>
            `;

            tooltipEl.style.opacity = 1;
            tooltipEl.style.left =
              context.chart.canvas.offsetLeft +
              tooltipModel.caretX +
              10 +
              'px';
            tooltipEl.style.top =
              context.chart.canvas.offsetTop +
              tooltipModel.caretY -
              20 +
              'px';
          },
        },
      },
      interaction: {
        mode: 'nearest',
        intersect: true,
      },
   hover: {
  mode: 'point',           // exact hover — only triggers when cursor touches a point
  intersect: true,          // must physically intersect the drawn dot
  onHover: (event, elements, chart) => {
    const canvas = event.native.target;
    canvas.style.cursor = 'default';

    // increase detection sensitivity a bit
    chart.options.elements.point.hitRadius = 8;  // expands invisible hit area
    chart.options.elements.point.hoverRadius = 8;

    // detect the point exactly under the cursor
    const activePoints = chart.getElementsAtEventForMode(
      event,
      'point',
      { intersect: true, axis: 'xy' },
      true
    );

    if (activePoints.length) {
      const point = activePoints[0];
      canvas.style.cursor = 'pointer';

      chart.setActiveElements([point]);
      chart.tooltip.setActiveElements([point], {
        x: point.element.x,
        y: point.element.y,
      });
      chart.update();
    } else {
      // clear when cursor leaves the dot
      chart.setActiveElements([]);
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update();
    }
  },
},



      scales: {
        y: {
          beginAtZero: true,
          grace: '10%',
          grid: { color: '#e5e7eb', lineWidth: 1.2 },
          ticks: { color: '#1e293b', font: { size: 14 }, padding: 8 },
          title: {
            display: true,
            text: metric,
            color: '#111827',
            font: { size: 16, weight: 'bold' },
          },
        },
        x: {
          grid: { color: '#f3f4f6' },
          ticks: { color: '#1e293b', font: { size: 13.5 }, padding: 8 },
        },
      },
      elements: {
        line: { borderJoinStyle: 'round' },
        point: { hoverBorderWidth: 3 },
      },
    },
  });
}

// 🧩 Helper to create tooltip DOM element
function createCustomTooltipElement() {
  const tooltipEl = document.createElement('div');
  tooltipEl.id = 'chartjs-tooltip';
  tooltipEl.style.position = 'absolute';
  tooltipEl.style.background = 'rgba(15,23,42,0.95)';
  tooltipEl.style.color = '#fff';
  tooltipEl.style.borderRadius = '8px';
  tooltipEl.style.pointerEvents = 'none';
  tooltipEl.style.padding = '10px 12px';
  tooltipEl.style.transition = 'all 0.1s ease';
  tooltipEl.style.fontSize = '13.5px';
  tooltipEl.style.zIndex = '999';
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}





