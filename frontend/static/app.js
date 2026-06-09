const form = document.querySelector("#validationForm");
const statusCard = document.querySelector("#statusCard");
const chart = document.querySelector("#chart");
const specFields = {
  lsl: document.querySelector('[data-spec-field="lsl"]'),
  usl: document.querySelector('[data-spec-field="usl"]'),
};
const extraResult = document.querySelector("#extraResult");
const submitButton = document.querySelector("#submitButton");
const submitLabel = document.querySelector("#submitLabel");
const cancelButton = document.querySelector("#cancelButton");
const twoSidedOptions = document.querySelector("#twoSidedOptions");
let currentResult = null;
let selectedGroupIndex = 0;
let activeController = null;
let activeStartedAt = 0;
let elapsedTimer = null;

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

document.querySelector("#addGroup").addEventListener("click", () => {
  const groupInputs = document.querySelector("#groupInputs");
  const index = groupInputs.querySelectorAll(".group-row").length + 1;
  const row = document.createElement("div");
  row.className = "group-row";
  row.innerHTML = `
    <input name="group_label" value="组 ${index}" aria-label="组名" />
    <textarea name="group_samples" rows="2" spellcheck="false" placeholder="组 ${index} 样本"></textarea>
    <button class="subtle-button icon-button remove-group" type="button" aria-label="删除组">×</button>
  `;
  groupInputs.append(row);
  updateGroupRemoveButtons();
});

document.querySelector("#groupInputs").addEventListener("click", (event) => {
  const button = event.target.closest(".remove-group");
  if (!button) {
    return;
  }
  const rows = document.querySelectorAll("#groupInputs .group-row");
  if (rows.length <= 2) {
    return;
  }
  button.closest(".group-row").remove();
  updateGroupRemoveButtons();
});

extraResult.addEventListener("click", (event) => {
  const row = event.target.closest("[data-group-index]");
  if (!row || !currentResult || currentResult.method !== "normal-pooled") {
    return;
  }
  renderPooledSelection(currentResult, Number(row.dataset.groupIndex));
});

cancelButton.addEventListener("click", () => {
  if (activeController) {
    activeController.abort();
  }
});

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

for (const item of form.elements.method) {
  item.addEventListener("change", () => {
    updateMethodPanels();
    updateTwoSidedOptions();
  });
}

for (const item of form.elements.rank_mode) {
  item.addEventListener("change", updateRankFields);
}

for (const item of form.elements.scenario) {
  item.addEventListener("change", () => {
    updateResultContext();
    updateSpecFields();
    updateTwoSidedOptions();
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
  if (activeController) {
    activeController.abort();
  }
  const controller = new AbortController();
  activeController = controller;
  activeStartedAt = performance.now();
  const payload = buildPayload();
  const exactMode = payload.scenario === "two-sided" && payload.two_sided_method === "exact";
  setBusy(true);
  startElapsedTimer();
  setStatus("neutral", exactMode ? "精确计算中" : "计算中", exactMode ? "正在执行双侧数值积分，可点击停止取消等待..." : "正在生成容差边界...");

  try {
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json();
    if (!response.ok) {
      setStatus("fail", "输入错误", data.error || "计算失败");
      return;
    }

    renderResult(data);
  } catch (error) {
    if (error.name === "AbortError") {
      if (activeController === controller) {
        setStatus("neutral", "已停止", `已取消本次计算等待，已等待 ${formatElapsed(performance.now() - activeStartedAt)}。`);
      }
      return;
    }
    setStatus("fail", "计算失败", "请求未完成，请稍后重试。");
  } finally {
    if (activeController === controller) {
      activeController = null;
      stopElapsedTimer();
      setBusy(false);
    }
  }
}

function renderResult(data) {
  currentResult = data;
  selectedGroupIndex = 0;
  const state = data.passed === true ? "pass" : data.passed === false ? "fail" : "neutral";
  const title = data.passed === true ? "合格" : data.passed === false ? "不合格" : "已计算";
  setStatus(state, title, data.verdict);
  setText("#chartFeatureName", data.title_label);
  setText("#scenarioBadge", scenarioLabel(data.scenario));

  setText("#nValue", data.n);
  setText("#meanValue", fmt(data.mean));
  setText("#stdLabel", data.method === "normal-pooled" ? "sₚ" : "s");
  setText("#stdValue", fmt(data.std));
  setText("#kValue", fmtNullable(data.k_factor));
  setText("#ltlValue", fmtBound(data.ltl, "ltl", data.scenario));
  setText("#utlValue", fmtBound(data.utl, "utl", data.scenario));
  setText("#lslValue", fmtNullable(data.lsl));
  setText("#uslValue", fmtNullable(data.usl));
  setText("#claimLabel", data.claim.label);
  setText("#claimValue", data.claim.text);
  setElapsed(data.elapsed_ms);

  renderExtraResult(data);
  if (data.method === "normal-pooled") {
    renderPooledSelection(data, 0);
  } else {
    drawChart(data.plot, data.scenario);
  }
}

function buildPayload() {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.method = formData.get("method") || "normal-single";
  if (payload.method === "normal-pooled") {
    const labels = formData.getAll("group_label");
    const samples = formData.getAll("group_samples");
    payload.groups = labels.map((label, index) => ({ label, samples: samples[index] || "" })).filter((group) => group.samples.trim());
  }
  return payload;
}

function setBusy(isBusy) {
  submitButton.disabled = isBusy;
  submitLabel.textContent = isBusy ? "计算中" : "计算";
  cancelButton.hidden = !isBusy;
}

function startElapsedTimer() {
  stopElapsedTimer();
  setElapsed(0);
  elapsedTimer = window.setInterval(() => {
    setElapsed(performance.now() - activeStartedAt);
  }, 100);
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    window.clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

function updateMethodPanels() {
  const method = new FormData(form).get("method");
  for (const panel of document.querySelectorAll("[data-method-panel]")) {
    panel.hidden = panel.dataset.methodPanel !== method;
  }
  form.elements.samples.closest("label").hidden = method === "normal-pooled";
  updateRankFields();
}

function updateTwoSidedOptions() {
  const method = new FormData(form).get("method");
  const scenario = new FormData(form).get("scenario");
  const visible = scenario === "two-sided" && method !== "distribution-free";
  twoSidedOptions.hidden = !visible;
  for (const input of twoSidedOptions.querySelectorAll("input")) {
    input.disabled = !visible;
  }
}

function updateRankFields() {
  const rankMode = new FormData(form).get("rank_mode");
  for (const panel of document.querySelectorAll("[data-rank-fields]")) {
    const visible = panel.dataset.rankFields === rankMode;
    panel.hidden = !visible;
    for (const input of panel.querySelectorAll("input")) {
      input.disabled = !visible;
    }
  }
}

function renderExtraResult(data) {
  extraResult.hidden = true;
  extraResult.innerHTML = "";
  if (data.method === "normal-pooled") {
    const boundHeaders = pooledBoundHeaders(data.scenario);
    const specHeaders = pooledSpecHeaders(data.scenario);
    extraResult.hidden = false;
    extraResult.innerHTML = `
      <h3>多组共同方差结果</h3>
      <div class="rank-summary">
        <span>组数 ${data.group_count}</span>
        <span>总样本量 ${data.n}</span>
        <span>合并自由度 ${data.pooled_df}</span>
        <span>s<sub>p</sub> ${fmt(data.std)}</span>
      </div>
      <table class="result-table">
        <thead><tr><th>组</th><th>n</th><th>x&#772;</th><th>组内 s</th><th>k</th>${boundHeaders}${specHeaders}<th>结论</th></tr></thead>
        <tbody>${data.groups
          .map(
            (group, index) =>
              `<tr class="result-row" data-group-index="${index}"><td>${escapeHtml(group.label)}</td><td>${group.n}</td><td>${fmt(group.mean)}</td><td>${fmt(group.group_std)}</td><td>${fmt(group.k_factor)}</td>${pooledBoundCells(group, data.scenario)}${pooledSpecCells(data)}<td>${resultBadge(group.passed, group.verdict)}</td></tr>`
          )
          .join("")}</tbody>
      </table>
    `;
  }
  if (data.method === "distribution-free") {
    extraResult.hidden = false;
    extraResult.innerHTML = `
      <h3>自由分布阶次结果</h3>
      <div class="rank-summary">
        <span>v = ${data.v}</span>
        <span>w = ${data.w}</span>
        <span>r = ${data.r}</span>
        <span>s = ${data.s}</span>
        <span>达到置信度 ${formatRate(data.achieved_conf)}</span>
      </div>
    `;
  }
}

function renderPooledSelection(data, index) {
  const group = data.groups[index] || data.groups[0];
  if (!group) {
    return;
  }
  selectedGroupIndex = data.groups[index] ? index : 0;
  setText("#chartFeatureName", `${data.title_label} · ${group.label}`);
  setText("#nValue", group.n);
  setText("#meanValue", fmt(group.mean));
  setText("#stdLabel", "sₚ");
  setText("#stdValue", fmt(data.std));
  setText("#kValue", fmtNullable(group.k_factor));
  setText("#ltlValue", fmtBound(group.ltl, "ltl", data.scenario));
  setText("#utlValue", fmtBound(group.utl, "utl", data.scenario));
  setText("#lslValue", fmtNullable(data.lsl));
  setText("#uslValue", fmtNullable(data.usl));
  setText("#claimLabel", `当前组 ${group.label}`);
  setText("#claimValue", pooledClaimText(group, data.scenario));
  drawChart(buildClientPlot(group.samples, group.mean, data.std, data.scenario, group.ltl, group.utl, data.lsl, data.usl), data.scenario);
  updateSelectedGroupRow();
}

function updateSelectedGroupRow() {
  for (const row of extraResult.querySelectorAll("[data-group-index]")) {
    row.classList.toggle("selected", Number(row.dataset.groupIndex) === selectedGroupIndex);
  }
}

function pooledClaimText(group, scenario) {
  if (scenario === "lower") {
    return `>= ${fmtBound(group.ltl, "ltl", scenario)}`;
  }
  if (scenario === "upper") {
    return `<= ${fmtBound(group.utl, "utl", scenario)}`;
  }
  return `${fmtBound(group.ltl, "ltl", scenario)} ~ ${fmtBound(group.utl, "utl", scenario)}`;
}

function updateGroupRemoveButtons() {
  const rows = document.querySelectorAll("#groupInputs .group-row");
  for (const button of document.querySelectorAll("#groupInputs .remove-group")) {
    button.disabled = rows.length <= 2;
  }
}

function resultBadge(passed, verdict) {
  const kind = passed === true ? "pass" : passed === false ? "fail" : "neutral";
  const label = passed === true ? "合格" : passed === false ? "不合格" : "已计算";
  return `<span class="result-badge ${kind}" title="${escapeHtml(verdict)}">${label}</span>`;
}

function pooledBoundHeaders(scenario) {
  if (scenario === "lower") {
    return "<th>LTL</th>";
  }
  if (scenario === "upper") {
    return "<th>UTL</th>";
  }
  return "<th>LTL</th><th>UTL</th>";
}

function pooledBoundCells(group, scenario) {
  if (scenario === "lower") {
    return `<td>${fmtBound(group.ltl, "ltl", scenario)}</td>`;
  }
  if (scenario === "upper") {
    return `<td>${fmtBound(group.utl, "utl", scenario)}</td>`;
  }
  return `<td>${fmtBound(group.ltl, "ltl", scenario)}</td><td>${fmtBound(group.utl, "utl", scenario)}</td>`;
}

function pooledSpecHeaders(scenario) {
  if (scenario === "lower") {
    return "<th>LSL</th>";
  }
  if (scenario === "upper") {
    return "<th>USL</th>";
  }
  return "<th>LSL</th><th>USL</th>";
}

function pooledSpecCells(data) {
  if (data.scenario === "lower") {
    return `<td>${fmtNullable(data.lsl)}</td>`;
  }
  if (data.scenario === "upper") {
    return `<td>${fmtNullable(data.usl)}</td>`;
  }
  return `<td>${fmtNullable(data.lsl)}</td><td>${fmtNullable(data.usl)}</td>`;
}

function setStatus(kind, label, text) {
  statusCard.className = `status-card ${kind}`;
  statusCard.querySelector("span").textContent = label;
  statusCard.querySelector("strong").textContent = text;
}

function setElapsed(ms) {
  document.querySelector("#elapsedValue").hidden = ms === null || ms === undefined;
  if (ms === null || ms === undefined) {
    return;
  }
  setText("#elapsedValue", formatElapsed(ms));
}

function buildClientPlot(samples, mean, std, scenario, ltl, utl, lsl, usl) {
  const finiteSamples = samples.map(Number).filter(Number.isFinite);
  const safeStd = Number(std) > 0 ? Number(std) : Math.max(Math.abs(Number(mean)) * 0.01, 1);
  const bounds = [
    Number(mean) - 4.5 * safeStd,
    Number(mean) + 4.5 * safeStd,
    Math.min(...finiteSamples),
    Math.max(...finiteSamples),
  ];
  if (lsl !== null && lsl !== undefined) {
    bounds.push(Number(lsl) - safeStd, Number(lsl) + safeStd);
  }
  if (usl !== null && usl !== undefined) {
    bounds.push(Number(usl) - safeStd, Number(usl) + safeStd);
  }
  if (ltl !== null && ltl !== undefined) {
    bounds.push(Number(ltl) - safeStd * 0.4);
  }
  if (utl !== null && utl !== undefined) {
    bounds.push(Number(utl) + safeStd * 0.4);
  }

  const xMin = Math.min(...bounds);
  const xMax = Math.max(...bounds);
  const x = Array.from({ length: 220 }, (_, index) => xMin + ((xMax - xMin) * index) / 219);
  const y = x.map((value) => normalPdf(value, Number(mean), safeStd));
  const markers = [{ key: "mean", label: "x\u0304", value: Number(mean), kind: "mean" }];
  if (ltl !== null && ltl !== undefined) {
    markers.push({ key: "ltl", label: "LTL", value: Number(ltl), kind: "tolerance" });
  }
  if (utl !== null && utl !== undefined) {
    markers.push({ key: "utl", label: "UTL", value: Number(utl), kind: "tolerance" });
  }
  if (lsl !== null && lsl !== undefined && scenario !== "upper") {
    markers.push({ key: "lsl", label: "LSL", value: Number(lsl), kind: "spec" });
  }
  if (usl !== null && usl !== undefined && scenario !== "lower") {
    markers.push({ key: "usl", label: "USL", value: Number(usl), kind: "spec" });
  }

  return {
    x,
    y,
    samples: finiteSamples,
    x_min: xMin,
    x_max: xMax,
    y_max: Math.max(...y),
    markers,
  };
}

function normalPdf(value, mean, std) {
  const z = (value - mean) / std;
  return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
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

function fmtBound(value, kind, scenario) {
  if (value !== null && value !== undefined) {
    return fmt(value);
  }
  if ((kind === "ltl" && scenario === "upper") || (kind === "utl" && scenario === "lower")) {
    return "不需计算";
  }
  return "未设置";
}

function formatRate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "--";
}

function formatElapsed(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (value < 1000) {
    return `${value.toFixed(0)} ms`;
  }
  return `${(value / 1000).toFixed(1)} 秒`;
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
updateMethodPanels();
updateTwoSidedOptions();
updateGroupRemoveButtons();
