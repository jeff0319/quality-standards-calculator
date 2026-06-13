const iecForm = document.querySelector("#iecForm");
const iecStatusCard = document.querySelector("#iecStatusCard");
const iecChart = document.querySelector("#iecOcChart");
const declarationTablePanel = document.querySelector("#iecDeclarationTablePanel");
const declarationTable = document.querySelector("#iecDeclarationTable");
const iecSubmitButton = document.querySelector("#iecSubmitButton");
const iecSubmitLabel = document.querySelector("#iecSubmitLabel");

const iecExample = {
  title_label: "A 计权声功率级",
  declaration_samples: "75.2, 75.5, 75.9, 76.1, 76.2, 76.3, 76.3, 76.6, 76.8",
  inspection_samples: "75.5, 74.5, 76.1",
  n: "3",
  p: "6.5",
  pa: "95",
  sigma_m: "1.5",
  sigma_r: "0.8",
  declared_value: "77",
};

document.querySelector("#loadIecExample").addEventListener("click", () => {
  for (const [key, value] of Object.entries(iecExample)) {
    iecForm.elements[key].value = value;
  }
  updateIecContext();
  submitIecForm();
});

iecForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitIecForm();
});

for (const name of ["title_label", "p", "pa"]) {
  iecForm.elements[name].addEventListener("input", updateIecContext);
}

for (const item of iecForm.elements.tool_mode) {
  item.addEventListener("change", updateToolMode);
}

async function submitIecForm() {
  const startedAt = performance.now();
  setIecBusy(true);
  setIecElapsed(0);
  setIecStatus("neutral", "计算中", "正在生成 IEC 60704-3 宣称值和 OC 曲线...");

  try {
    const response = await fetch("/api/iec-60704-3", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildIecPayload()),
    });
    const data = await response.json();
    if (!response.ok) {
      setIecStatus("fail", "输入错误", data.error || "计算失败");
      return;
    }
    renderIecResult(data);
  } catch (error) {
    setIecStatus("fail", "计算失败", "请求未完成，请稍后重试。");
  } finally {
    setIecBusy(false);
    setIecElapsed(performance.now() - startedAt);
  }
}

function buildIecPayload() {
  const formData = new FormData(iecForm);
  const payload = Object.fromEntries(formData.entries());
  const mode = payload.tool_mode || "declaration";
  payload.p = percentInputToRate(payload.p);
  payload.pa = percentInputToRate(payload.pa);
  if (mode === "inspection") {
    payload.declaration_samples = payload.inspection_samples;
  } else {
    payload.inspection_samples = "";
    payload.declared_value = "";
  }
  return payload;
}

function renderIecResult(data) {
  const mode = new FormData(iecForm).get("tool_mode") || "declaration";
  const state = data.passed === true ? "pass" : data.passed === false ? "fail" : "neutral";
  const title = data.passed === true ? "通过" : data.passed === false ? "不通过" : "已计算";
  setIecStatus(state, title, data.verdict);

  setText("#iecChartFeatureName", data.title_label);
  setText("#iecNValue", data.n);
  setText("#iecMeanValue", fmt(data.mean));
  setText("#iecSampleStdValue", fmtNullable(data.sample_std));
  setText("#iecSigmaMValue", fmt(data.sigma_m));
  setText("#iecSigmaRValue", fmt(data.sigma_r));
  setText("#iecSigmaTValue", fmt(data.sigma_t));
  setText("#iecKValue", fmt(data.k_accept));
  setText("#iecMarginValue", fmt(mode === "inspection" ? data.acceptance_margin : data.declaration_margin));
  setText("#iecClaimLabel", mode === "inspection" ? "现有宣称值 Lc" : data.claim.label);
  setText("#iecClaimValue", mode === "inspection" ? formatDbNullable(data.declared_value) : data.claim.text);
  setText("#iecInspectionMeanValue", fmt(data.inspection_mean));
  setText("#iecAcceptanceLimitValue", fmtNullable(data.acceptance_limit));
  setText("#iecDeclaredCoverageValue", formatBadRateNullable(data.declared_coverage));
  setText("#iecDeclaredPaValue", formatRateNullable(data.declared_accept_probability));
  updateMarkerLegends(data.oc_plot);
  const kProbability = mode === "inspection" ? "z_Pa" : `z_${formatProbabilitySymbol(data.reference_acceptance_probability)}`;
  setText("#iecFormulaK", `k = z_(1-p1-α) - ${kProbability} / sqrt(n) = ${fmt(data.k_accept)}`);
  setText("#iecFormulaSigmaT", `σt = sqrt(s² + σR²) = ${fmt(data.sigma_t)}`);
  setText("#iecFormulaLc", `Lc = x\u0304 + kσM + z_Pa σt / sqrt(n) = ${fmt(data.recommended_declared_value)}`);
  setText("#iecFormulaOc", `Pa(p) = Φ(sqrt(n) · (Φ⁻¹(1 - p) - ${fmt(data.k_accept)}))`);
  drawOcChart(data.oc_plot);
  renderDeclarationTable(data.declaration_table || []);
  updateToolMode();
}

function updateIecContext() {
  setText("#iecChartFeatureName", iecForm.elements.title_label.value.trim() || "噪声声功率级");
  setText("#iecHeroP", formatPercentInput(iecForm.elements.p.value));
  setText("#iecHeroPa", formatPercentInput(iecForm.elements.pa.value));
  setText("#iecBoundaryLegend", `${formatPercentInput(iecForm.elements.p.value)} / ${formatPercentInput(iecForm.elements.pa.value)}`);
  setText("#iecDeclaredLegend", "当前 Lc");
}

function updateToolMode() {
  const mode = new FormData(iecForm).get("tool_mode") || "declaration";
  for (const panel of document.querySelectorAll("[data-tool-panel]")) {
    panel.hidden = panel.dataset.toolPanel !== mode;
  }
  document.querySelector(".chart-panel").hidden = mode !== "inspection";
  document.querySelector(".iec-bounds-grid").hidden = mode !== "inspection";
  declarationTablePanel.hidden = mode !== "declaration";
  document.querySelector("#iecFormulaLc").hidden = mode !== "declaration";
  document.querySelector("#iecFormulaOc").hidden = mode !== "inspection";
}

function updateMarkerLegends(plot) {
  const boundary = plot?.markers?.find((marker) => marker.kind === "boundary");
  const declared = plot?.markers?.find((marker) => marker.kind === "declared");
  if (boundary) {
    setText("#iecBoundaryLegend", `${formatRate(boundary.x)} / ${formatRate(boundary.y)}`);
  }
  setText("#iecDeclaredLegend", declared ? `当前 Lc ${formatRate(declared.x)} / ${formatRate(declared.y)}` : "当前 Lc");
}

function renderDeclarationTable(rows) {
  if (!rows.length) {
    declarationTable.innerHTML = "";
    return;
  }
  declarationTable.innerHTML = `
    <table class="result-table">
      <thead><tr><th>p<sub>1-α</sub></th><th>Pa</th><th>k</th><th>K</th><th>推荐 L<sub>c</sub></th></tr></thead>
      <tbody>${rows
        .map(
          (row) =>
            `<tr><td>${formatRate(row.p)}</td><td>${formatRate(row.pa)}</td><td>${fmt(row.k_accept)}</td><td>${fmt(row.margin)}</td><td>${row.declared_text}</td></tr>`
        )
        .join("")}</tbody>
    </table>
  `;
}

function setIecBusy(isBusy) {
  iecSubmitButton.disabled = isBusy;
  iecSubmitLabel.textContent = isBusy ? "计算中" : "计算";
}

function setIecStatus(kind, label, text) {
  iecStatusCard.className = `status-card ${kind}`;
  iecStatusCard.querySelector("span").textContent = label;
  iecStatusCard.querySelector("strong").textContent = text;
}

function setIecElapsed(ms) {
  const elapsed = document.querySelector("#iecElapsedValue");
  elapsed.hidden = ms === null || ms === undefined;
  if (ms !== null && ms !== undefined) {
    elapsed.textContent = formatElapsed(ms);
  }
}

function drawOcChart(badRatePlot) {
  const plot = buildBadRatePlot(badRatePlot);
  const width = 900;
  const height = 390;
  const pad = { left: 72, right: 28, top: 26, bottom: 64 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xMin = 0.0;
  const xMax = 0.5;
  const xScale = (x) => pad.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const yScale = (y) => pad.top + innerH - y * innerH;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const points = plot.x.map((x, index) => `${xScale(x).toFixed(2)},${yScale(plot.y[index]).toFixed(2)}`);
  const xTicks = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5];
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  const grid = xTicks
    .map((tick) => `<line class="grid-line" x1="${xScale(tick)}" y1="${pad.top}" x2="${xScale(tick)}" y2="${pad.top + innerH}" />`)
    .join("");
  const horizontalGrid = yTicks
    .map((tick) => `<line class="grid-line" x1="${pad.left}" y1="${yScale(tick)}" x2="${pad.left + innerW}" y2="${yScale(tick)}" />`)
    .join("");
  const xLabels = xTicks
    .map(
      (tick) => `
        <line class="axis" x1="${xScale(tick)}" y1="${pad.top + innerH}" x2="${xScale(tick)}" y2="${pad.top + innerH + 5}" />
        <text class="tick-label" x="${xScale(tick)}" y="${height - 17}" text-anchor="middle">${formatAxisRate(tick)}</text>
      `
    )
    .join("");
  const yLabels = yTicks
    .map(
      (tick) => `
        <line class="axis" x1="${pad.left - 5}" y1="${yScale(tick)}" x2="${pad.left}" y2="${yScale(tick)}" />
        <text class="tick-label" x="${pad.left - 10}" y="${yScale(tick) + 4}" text-anchor="end">${(tick * 100).toFixed(0)}%</text>
      `
    )
    .join("");
  const markers = plot.markers
    .map((marker) => {
      const x = clamp(xScale(marker.x), pad.left, pad.left + innerW);
      const y = clamp(yScale(marker.y), pad.top, pad.top + innerH);
      return `
        <line class="marker ${marker.kind}" x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + innerH}" />
        <line class="marker ${marker.kind}" x1="${pad.left}" y1="${y}" x2="${pad.left + innerW}" y2="${y}" />
        <circle class="oc-marker ${marker.kind}" cx="${x}" cy="${y}" r="5" />
      `;
    })
    .join("");

  iecChart.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="#fff" />
    ${grid}
    ${horizontalGrid}
    <polyline class="curve oc-curve coverage" points="${points.join(" ")}" />
    ${markers}
    <line class="axis" x1="${pad.left}" y1="${pad.top + innerH}" x2="${pad.left + innerW}" y2="${pad.top + innerH}" />
    <line class="axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + innerH}" />
    ${xLabels}
    ${yLabels}
    <text class="chart-label" x="${pad.left}" y="17">质量水平 p<tspan baseline-shift="sub" font-size="10">1-α</tspan>（超差比例）</text>
    <text class="chart-label" x="${pad.left + innerW / 2}" y="${height - 6}" text-anchor="middle">p<tspan baseline-shift="sub" font-size="10">1-α</tspan></text>
    <text class="chart-label" x="18" y="${pad.top + innerH / 2}" text-anchor="middle" transform="rotate(-90 18 ${pad.top + innerH / 2})">Pa(p)</text>
    <g class="hover-layer" hidden>
      <line class="hover-line hover-x" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + innerH}" />
      <line class="hover-line hover-y" x1="${pad.left}" y1="0" x2="${pad.left + innerW}" y2="0" />
      <circle class="hover-dot hover-dot-coverage" cx="0" cy="0" r="5" />
      <rect class="hover-label-box" x="0" y="0" width="190" height="46" rx="6" />
      <text class="hover-label hover-label-x" x="0" y="0"></text>
      <text class="hover-label hover-label-y" x="0" y="0"></text>
    </g>
    <rect class="hover-capture" x="${pad.left}" y="${pad.top}" width="${innerW}" height="${innerH}" />
  `;
  installOcHover(iecChart, plot, { width, height, pad, innerW, innerH, xMin, xMax, xScale, yScale, clamp });
}

function buildBadRatePlot(badRatePlot) {
  return {
    x: badRatePlot.x,
    y: badRatePlot.y,
    markers: badRatePlot.markers.map((marker) => ({
      ...marker,
      label: marker.kind === "boundary" ? "边界点" : marker.label,
    })),
  };
}

function installOcHover(svg, plot, config) {
  const capture = svg.querySelector(".hover-capture");
  const layer = svg.querySelector(".hover-layer");
  const hoverX = svg.querySelector(".hover-x");
  const hoverY = svg.querySelector(".hover-y");
  const dot = svg.querySelector(".hover-dot");
  const labelBox = svg.querySelector(".hover-label-box");
  const labelX = svg.querySelector(".hover-label-x");
  const labelY = svg.querySelector(".hover-label-y");

  capture.addEventListener("mousemove", (event) => {
    const rect = svg.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * config.width;
    const rawX = config.xMin + ((viewX - config.pad.left) / config.innerW) * (config.xMax - config.xMin);
    const index = nearestIndex(plot.x, rawX);
    const xValue = plot.x[index];
    const yValue = plot.y[index];
    const x = config.clamp(config.xScale(xValue), config.pad.left, config.pad.left + config.innerW);
    const y = config.clamp(config.yScale(yValue), config.pad.top, config.pad.top + config.innerH);
    const boxX = config.clamp(x + 10, config.pad.left + 4, config.width - 204);
    const boxY = config.clamp(y - 58, config.pad.top + 4, config.pad.top + config.innerH - 50);

    layer.hidden = false;
    hoverX.setAttribute("x1", x);
    hoverX.setAttribute("x2", x);
    hoverY.setAttribute("y1", y);
    hoverY.setAttribute("y2", y);
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    labelBox.setAttribute("x", boxX);
    labelBox.setAttribute("y", boxY);
    labelX.setAttribute("x", boxX + 10);
    labelX.setAttribute("y", boxY + 18);
    labelY.setAttribute("x", boxX + 10);
    labelY.setAttribute("y", boxY + 36);
    labelX.textContent = `质量水平: ${formatRate(xValue)}`;
    labelY.textContent = `Pa(p): ${formatRate(yValue)}`;
  });
  capture.addEventListener("mouseleave", () => {
    layer.hidden = true;
  });
}

function nearestIndex(values, target) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const distance = Math.abs(values[index] - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
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

function formatDbNullable(value) {
  return value === null || value === undefined ? "未设置" : `${Number(value).toFixed(1)} dB`;
}

function formatRate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "--";
}

function percentInputToRate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number / 100) : value;
}

function formatPercentInput(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : "--";
}

function formatAxisRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }
  if (number > 0 && number < 0.1) {
    return `${(number * 100).toFixed(1)}%`;
  }
  return `${(number * 100).toFixed(0)}%`;
}

function formatRateNullable(value) {
  return value === null || value === undefined ? "未设置" : formatRate(value);
}

function formatBadRateNullable(coverage) {
  return coverage === null || coverage === undefined ? "未设置" : formatRate(1 - Number(coverage));
}

function formatProbabilitySymbol(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "--";
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

updateIecContext();
updateToolMode();
