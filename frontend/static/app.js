const form = document.querySelector("#validationForm");
const statusCard = document.querySelector("#statusCard");
const chart = document.querySelector("#chart");
const specFields = {
  lsl: document.querySelector('[data-spec-field="lsl"]'),
  usl: document.querySelector('[data-spec-field="usl"]'),
};

const example = {
  title_label: "关键结构件尺寸",
  samples:
    "50.1, 48.9, 51.2, 49.5, 50.6, 52.1, 48.5, 50.0, 49.8, 51.0,\n50.5, 49.2, 51.8, 50.1, 49.9, 51.1, 48.8, 50.3, 49.6, 50.8",
  scenario: "lower",
  p_target: "0.95",
  conf_target: "0.95",
  lsl: "47.5",
  usl: "",
};

document.querySelector("#loadExample").addEventListener("click", () => {
  for (const [key, value] of Object.entries(example)) {
    if (key === "scenario") {
      form.querySelector(`input[name="scenario"][value="${value}"]`).checked = true;
    } else {
      form.elements[key].value = value;
    }
  }
  updateHeaderRates();
  updateResultContext();
  updateSpecFields();
  submitForm();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitForm();
});

for (const name of ["p_target", "conf_target"]) {
  form.elements[name].addEventListener("input", updateHeaderRates);
}

form.elements.title_label.addEventListener("input", updateResultContext);

for (const item of form.elements.scenario) {
  item.addEventListener("change", () => {
    updateResultContext();
    updateSpecFields();
  });
}

function updateHeaderRates() {
  document.querySelector("#heroP").textContent = formatRate(form.elements.p_target.value);
  document.querySelector("#heroConf").textContent = formatRate(form.elements.conf_target.value);
}

function updateResultContext() {
  const title = form.elements.title_label.value.trim() || "产品特性";
  const scenario = new FormData(form).get("scenario");
  setText("#chartFeatureName", title);
  setText("#scenarioBadge", scenarioLabel(scenario));
}

function updateSpecFields() {
  const scenario = new FormData(form).get("scenario");
  form.dataset.scenario = scenario;
  const showLsl = scenario !== "upper";
  const showUsl = scenario !== "lower";
  setSpecField(specFields.lsl, form.elements.lsl, showLsl);
  setSpecField(specFields.usl, form.elements.usl, showUsl);
}

function setSpecField(container, input, visible) {
  container.hidden = !visible;
  input.disabled = !visible;
  if (!visible) {
    input.value = "";
  }
}

async function submitForm() {
  const payload = Object.fromEntries(new FormData(form).entries());
  setStatus("neutral", "计算中", "正在生成容差边界...");

  const response = await fetch("/api/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    setStatus("fail", "输入错误", data.error || "计算失败");
    return;
  }

  renderResult(data);
}

function renderResult(data) {
  const state = data.passed === true ? "pass" : data.passed === false ? "fail" : "neutral";
  const title = data.passed === true ? "合格" : data.passed === false ? "不合格" : "已计算";
  setStatus(state, title, data.verdict);
  setText("#chartFeatureName", data.title_label);
  setText("#scenarioBadge", scenarioLabel(data.scenario));

  setText("#nValue", data.n);
  setText("#meanValue", fmt(data.mean));
  setText("#stdValue", fmt(data.std));
  setText("#kValue", fmt(data.k_factor));
  setText("#ltlValue", fmtNullable(data.ltl));
  setText("#utlValue", fmtNullable(data.utl));
  setText("#lslValue", fmtNullable(data.lsl));
  setText("#uslValue", fmtNullable(data.usl));
  setText("#claimLabel", data.claim.label);
  setText("#claimValue", data.claim.text);

  drawChart(data.plot, data.scenario);
}

function setStatus(kind, label, text) {
  statusCard.className = `status-card ${kind}`;
  statusCard.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(text)}</strong>`;
}

function drawChart(plot, scenario) {
  const width = 900;
  const height = 390;
  const pad = { left: 52, right: 24, top: 18, bottom: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xMin = plot.x_min;
  const xMax = plot.x_max;
  const yMax = plot.y_max * 1.14;
  const xScale = (x) => pad.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const yScale = (y) => pad.top + innerH - (y / yMax) * innerH;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const points = plot.x.map((x, index) => `${xScale(x).toFixed(2)},${yScale(plot.y[index]).toFixed(2)}`);
  const areaPoints = [
    `${xScale(plot.x[0]).toFixed(2)},${yScale(0).toFixed(2)}`,
    ...points,
    `${xScale(plot.x.at(-1)).toFixed(2)},${yScale(0).toFixed(2)}`,
  ].join(" ");

  const ticks = Array.from({ length: 6 }, (_, index) => xMin + ((xMax - xMin) * index) / 5);
  const grid = ticks
    .map((tick) => {
      const x = xScale(tick);
      return `<line class="grid-line" x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + innerH}" />`;
    })
    .join("");

  const markerLines = plot.markers
    .map((marker, index) => {
      const rawX = xScale(marker.value);
      const x = clamp(rawX, pad.left, pad.left + innerW);
      const labelY = pad.top + 16 + (index % 4) * 18;
      const labelX = clamp(x + 6, pad.left + 6, width - 120);
      return `
        <line class="marker ${marker.kind}" x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + innerH}" />
        <text class="chart-label" x="${labelX}" y="${labelY}">${marker.label} ${fmt(marker.value)}</text>
      `;
    })
    .join("");

  const sampleDots = plot.samples
    .map((sample, index) => {
      const x = xScale(sample);
      const y = pad.top + innerH + 14 + (index % 2) * 6;
      return `<circle class="sample-dot" cx="${x}" cy="${y}" r="3" />`;
    })
    .join("");

  const tickLabels = ticks
    .map((tick) => {
      const x = xScale(tick);
      return `
        <line class="axis" x1="${x}" y1="${pad.top + innerH}" x2="${x}" y2="${pad.top + innerH + 5}" />
        <text class="tick-label" x="${x}" y="${height - 15}" text-anchor="middle">${fmt(tick)}</text>
      `;
    })
    .join("");

  chart.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="#fff" />
    ${grid}
    <polyline class="area" points="${areaPoints}" />
    <polyline class="curve" points="${points.join(" ")}" />
    ${markerLines}
    <line class="axis" x1="${pad.left}" y1="${pad.top + innerH}" x2="${pad.left + innerW}" y2="${pad.top + innerH}" />
    <line class="axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + innerH}" />
    ${tickLabels}
    ${sampleDots}
    <text class="tick-label" x="${pad.left}" y="${height - 31}">样本点</text>
    <text class="chart-label" x="${pad.left}" y="15">${scenarioLabel(scenario)}</text>
  `;
}

function scenarioLabel(scenario) {
  return {
    "two-sided": "双侧统计容差区间",
    lower: "下限统计容差区间",
    upper: "上限统计容差区间",
  }[scenario];
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function fmt(value) {
  return Number(value).toFixed(3);
}

function fmtNullable(value) {
  return value === null || value === undefined ? "未设置" : fmt(value);
}

function formatRate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "--";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

updateHeaderRates();
updateResultContext();
updateSpecFields();
