// eMANDEVAL-Future v2.0.0 – script.js
// Fully client-side, no external dependencies except Chart.js (loaded via CDN).

(() => {
  const APP_VERSION = "v2.0.0";
  const STORAGE_SCENARIOS_KEY = "eMANDEVALFuture_v2_scenarios";
  const STORAGE_CALIBRATION_KEY = "eMANDEVALFuture_v2_calibration";

  // -----------------------------
  // Basic helpers
  // -----------------------------

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const parseNumber = (val, fallback = 0) => {
    const n = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
    return Number.isFinite(n) ? n : fallback;
  };

  const formatNumber = (value, decimals = 1) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "–";
    const factor = Math.pow(10, decimals);
    return (Math.round(value * factor) / factor).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatCurrency = (value, currencyLabel) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "–";
    const abs = Math.abs(value);
    let unit = "";
    let scaled = value;

    if (abs >= 1e9) {
      unit = " B";
      scaled = value / 1e9;
    } else if (abs >= 1e6) {
      unit = " M";
      scaled = value / 1e6;
    }

    return `${currencyLabel} ${formatNumber(scaled, 2)}${unit}`;
  };

  const logistic = (x) => 1 / (1 + Math.exp(-x));

  const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

  // -----------------------------
  // Preference models (stylised)
  // -----------------------------
  // Simple mixed-logit-inspired reduced form. Values are illustrative and
  // monotone with respect to lives saved and severity.

  const preferenceModels = {
    AU: {
      mild: {
        intercept: -0.2,
        lives: 0.05,
        scopeAll: -0.35,
        exemptionsMedRel: 0.05,
        exemptionsMedRelPers: -0.25,
        coverage70: -0.10,
        coverage90: -0.20,
      },
      severe: {
        intercept: 0.4,
        lives: 0.06,
        scopeAll: -0.20,
        exemptionsMedRel: 0.05,
        exemptionsMedRelPers: -0.18,
        coverage70: -0.05,
        coverage90: -0.12,
      },
    },
    FR: {
      mild: {
        intercept: -0.1,
        lives: 0.045,
        scopeAll: -0.30,
        exemptionsMedRel: 0.10,
        exemptionsMedRelPers: -0.20,
        coverage70: -0.12,
        coverage90: -0.25,
      },
      severe: {
        intercept: 0.5,
        lives: 0.055,
        scopeAll: -0.18,
        exemptionsMedRel: 0.08,
        exemptionsMedRelPers: -0.15,
        coverage70: -0.06,
        coverage90: -0.16,
      },
    },
    IT: {
      mild: {
        intercept: 0.0,
        lives: 0.05,
        scopeAll: -0.25,
        exemptionsMedRel: 0.12,
        exemptionsMedRelPers: -0.22,
        coverage70: -0.08,
        coverage90: -0.18,
      },
      severe: {
        intercept: 0.6,
        lives: 0.06,
        scopeAll: -0.15,
        exemptionsMedRel: 0.10,
        exemptionsMedRelPers: -0.15,
        coverage70: -0.04,
        coverage90: -0.12,
      },
    },
  };

  // -----------------------------
  // Default settings & calibration
  // -----------------------------

  const defaultSettingsPerCountry = {
    AU: {
      horizon: 1,
      population: 1_000_000,
      currencyLabel: "local currency units",
      vslMetric: "vsl",
      vsl: 5_000_000,
    },
    FR: {
      horizon: 1,
      population: 1_000_000,
      currencyLabel: "EURO",
      vslMetric: "vsl",
      vsl: 5_000_000,
    },
    IT: {
      horizon: 1,
      population: 1_000_000,
      currencyLabel: "EURO",
      vslMetric: "vsl",
      vsl: 4_500_000,
    },
  };

  // -----------------------------
  // State
  // -----------------------------

  const state = {
    settings: {
      horizon: 1,
      population: 1_000_000,
      currencyLabel: "local currency units",
      vslMetric: "vsl",
      vsl: 5_400_000,
      metrics: {
        hospPerLife: 8,
        hospPer100k: 0,
        icuPerLife: 10,
        icuPer100k: 0,
        workdaysPerLife: 180,
        workdaysPer100k: 0,
      },
    },
    calibration: {
      // countryCode: { vsl, year }
    },
    currentConfig: null,
    currentCosts: {
      itSystems: 0,
      communications: 0,
      enforcement: 0,
      compensation: 0,
      admin: 0,
      other: 0,
    },
    currentResults: null,
    previousResults: null,
    scenarios: [],
    pinnedIds: [],
    charts: {
      bcrChart: null,
      supportChart: null,
      mrsChart: null,
      radarChart: null,
    },
  };

  // -----------------------------
  // Toast notifications
  // -----------------------------

  const toastContainer = $("#toast-container");

  function showToast(message, type = "success", timeout = 2500) {
    if (!toastContainer) return;
    const el = document.createElement("div");
    el.className = `toast ${type === "error" ? "toast-error" : "toast-success"}`;
    const msg = document.createElement("span");
    msg.textContent = message;
    el.appendChild(msg);
    toastContainer.appendChild(el);

    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(4px)";
      setTimeout(() => {
        el.remove();
      }, 180);
    }, timeout);
  }

  // -----------------------------
  // Tabs
  // -----------------------------

  function initTabs() {
    const tabLinks = $$(".tab-link");
    tabLinks.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        if (!target) return;
        tabLinks.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        $$(".tab-content").forEach((section) => {
          section.classList.toggle("active", section.id === target);
        });
      });
    });
  }

  // -----------------------------
  // Tooltips
  // -----------------------------

  const tooltipEl = $("#globalTooltip");

  function initTooltips() {
    if (!tooltipEl) return;

    document.body.addEventListener("mouseover", (e) => {
      const icon = e.target.closest(".info-icon");
      if (!icon) return;
      const text = icon.getAttribute("data-tooltip");
      if (!text) return;
      tooltipEl.textContent = text;
      tooltipEl.classList.remove("tooltip-hidden");
      positionTooltip(e);
    });

    document.body.addEventListener("mousemove", (e) => {
      if (!tooltipEl || tooltipEl.classList.contains("tooltip-hidden")) return;
      positionTooltip(e);
    });

    document.body.addEventListener("mouseout", (e) => {
      const icon = e.target.closest(".info-icon");
      if (!icon) return;
      tooltipEl.classList.add("tooltip-hidden");
    });
  }

  function positionTooltip(e) {
    const offsetX = 0;
    const offsetY = 12;
    tooltipEl.style.left = `${e.clientX + offsetX}px`;
    tooltipEl.style.top = `${e.clientY - offsetY}px`;
  }

  // -----------------------------
  // Presentation mode
  // -----------------------------

  function initPresentationMode() {
    const btn = $("#btn-presentation-mode");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const isOn = document.body.classList.toggle("presentation-mode");
      btn.textContent = isOn ? "Exit presentation mode" : "Presentation mode";
    });
  }

  // -----------------------------
  // Settings
  // -----------------------------

  function loadCalibrationFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_CALIBRATION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state.calibration = parsed;
      }
    } catch (e) {
      console.warn("Failed to load calibration", e);
    }
  }

  function saveCalibrationToStorage() {
    try {
      localStorage.setItem(STORAGE_CALIBRATION_KEY, JSON.stringify(state.calibration));
    } catch (e) {
      console.warn("Failed to save calibration", e);
    }
  }

  function applyCountryDefaultsToSettings(country) {
    const defaults = defaultSettingsPerCountry[country] || defaultSettingsPerCountry.AU;
    state.settings.horizon = defaults.horizon;
    state.settings.population = defaults.population;
    state.settings.currencyLabel = defaults.currencyLabel;
    state.settings.vslMetric = defaults.vslMetric;

    const calibration = state.calibration[country];
    if (calibration && calibration.vsl > 0) {
      state.settings.vsl = calibration.vsl;
      $("#vsl-calibration-note").textContent =
        `Using stored calibration for ${country} (guideline year ${calibration.year || "n/a"}).`;
    } else {
      state.settings.vsl = defaults.vsl;
      $("#vsl-calibration-note").textContent = "";
    }

    // Push to UI
    $("#setting-horizon").value = state.settings.horizon;
    $("#setting-population").value = state.settings.population;
    $("#setting-currency").value = state.settings.currencyLabel;
    $("#setting-vsl-metric").value = state.settings.vslMetric;
    $("#setting-vsl").value = state.settings.vsl;
  }

  function initSettings() {
    // Load calibration first
    loadCalibrationFromStorage();

    // Initial country defaults based on config selector
    const cfgCountrySelect = $("#cfg-country");
    const initialCountry = cfgCountrySelect ? cfgCountrySelect.value || "AU" : "AU";
    applyCountryDefaultsToSettings(initialCountry);

    // Metric inputs
    state.settings.metrics = {
      hospPerLife: parseNumber($("#metric-hosp-per-life").value, 8),
      hospPer100k: parseNumber($("#metric-hosp-per100k").value, 0),
      icuPerLife: parseNumber($("#metric-icu-per-life").value, 10),
      icuPer100k: parseNumber($("#metric-icu-per100k").value, 0),
      workdaysPerLife: parseNumber($("#metric-workdays-per-life").value, 180),
      workdaysPer100k: parseNumber($("#metric-workdays-per100k").value, 0),
    };

    $("#btn-apply-settings").addEventListener("click", () => {
      state.settings.horizon = parseNumber($("#setting-horizon").value, 1);
      state.settings.population = parseNumber($("#setting-population").value, 1_000_000);
      state.settings.currencyLabel = $("#setting-currency").value.trim() || "local currency units";
      state.settings.vslMetric = $("#setting-vsl-metric").value;
      state.settings.vsl = parseNumber($("#setting-vsl").value, 0);

      state.settings.metrics.hospPerLife = parseNumber($("#metric-hosp-per-life").value, 8);
      state.settings.metrics.hospPer100k = parseNumber($("#metric-hosp-per100k").value, 0);
      state.settings.metrics.icuPerLife = parseNumber($("#metric-icu-per-life").value, 10);
      state.settings.metrics.icuPer100k = parseNumber($("#metric-icu-per100k").value, 0);
      state.settings.metrics.workdaysPerLife = parseNumber($("#metric-workdays-per-life").value, 180);
      state.settings.metrics.workdaysPer100k = parseNumber($("#metric-workdays-per100k").value, 0);

      $("#vsl-calibration-note").textContent = "";
      recalcCurrentResults();
      showToast("Settings applied", "success");
    });

    $("#btn-restore-country-defaults").addEventListener("click", () => {
      const country = $("#cfg-country") ? $("#cfg-country").value : "AU";
      applyCountryDefaultsToSettings(country);
      recalcCurrentResults();
      showToast("Country defaults restored", "success");
    });

    $("#btn-apply-calibration").addEventListener("click", () => {
      const newVsl = parseNumber($("#calibration-vsl-new").value, 0);
      const year = parseInt($("#calibration-note-year").value, 10);
      if (!newVsl || newVsl <= 0) {
        showToast("Enter a positive value for new VSL", "error");
        return;
      }
      const country = $("#cfg-country") ? $("#cfg-country").value : "AU";
      state.calibration[country] = {
        vsl: newVsl,
        year: Number.isFinite(year) ? year : null,
      };
      saveCalibrationToStorage();
      state.settings.vsl = newVsl;
      $("#setting-vsl").value = newVsl;
      $("#vsl-calibration-note").textContent =
        `Using calibrated value per life saved for ${country} (guideline year ${state.calibration[country].year || "n/a"}).`;
      recalcCurrentResults();
      $("#calibration-status").textContent = "Calibration stored in this browser for the selected country.";
      showToast("Calibration stored", "success");
    });

    // Update settings when country changes (for convenience)
    if (cfgCountrySelect) {
      cfgCountrySelect.addEventListener("change", () => {
        applyCountryDefaultsToSettings(cfgCountrySelect.value);
        recalcCurrentResults();
      });
    }
  }

  // -----------------------------
  // Configuration
  // -----------------------------

  function getCurrentCountryConfig() {
    const country = $("#cfg-country").value;
    const outbreak = $("#cfg-outbreak").value;
    const scope = $("#cfg-scope").value;
    const exemptions = $("#cfg-exemptions").value;
    const coverage = parseNumber($("#cfg-coverage").value, 0.5);
    const livesPer100k = parseNumber($("#cfg-lives").value, 0);

    return {
      country,
      outbreak,
      scope,
      exemptions,
      coverage,
      livesPer100k,
    };
  }

  function initConfig() {
    const livesSlider = $("#cfg-lives");
    const livesDisplay = $("#cfg-lives-display");
    if (livesSlider && livesDisplay) {
      livesDisplay.textContent = livesSlider.value;
      livesSlider.addEventListener("input", () => {
        livesDisplay.textContent = livesSlider.value;
      });
    }

    $("#btn-apply-config").addEventListener("click", () => {
      state.previousResults = state.currentResults ? { ...state.currentResults } : null;

      state.currentConfig = getCurrentCountryConfig();
      updateConfigSummary();
      recalcCurrentResults(true);
      showToast("Configuration applied", "success");
    });

    $("#btn-save-scenario").addEventListener("click", () => {
      saveCurrentScenario();
    });

    // Distributional / equity notes handled in saveCurrentScenario
  }

  function updateConfigSummary() {
    if (!state.currentConfig) {
      $("#summary-country").textContent = "–";
      $("#summary-outbreak").textContent = "–";
      $("#summary-scope").textContent = "–";
      $("#summary-exemptions").textContent = "–";
      $("#summary-coverage").textContent = "–";
      $("#summary-lives").textContent = "–";
      $("#summary-support").textContent = "–";
      $("#headlineRecommendation").textContent =
        "No configuration applied yet. Configure country, outbreak scenario and design, then click “Apply configuration” to see a summary.";
      return;
    }

    const cfg = state.currentConfig;
    const countryLabels = { AU: "Australia", FR: "France", IT: "Italy" };
    $("#summary-country").textContent = countryLabels[cfg.country] || cfg.country;
    $("#summary-outbreak").textContent = cfg.outbreak === "severe" ? "Severe outbreak" : "Mild / endemic";
    $("#summary-scope").textContent =
      cfg.scope === "all" ? "All occupations & public spaces" : "High-risk occupations only";

    let excText = "";
    if (cfg.exemptions === "medical") excText = "Medical only";
    else if (cfg.exemptions === "medrel") excText = "Medical + religious";
    else excText = "Medical + religious + personal belief";
    $("#summary-exemptions").textContent = excText;

    const covPct = cfg.coverage * 100;
    $("#summary-coverage").textContent = `${formatNumber(covPct, 0)}% population vaccinated`;
    $("#summary-lives").textContent = `${formatNumber(cfg.livesPer100k, 1)} per 100,000`;

    if (state.currentResults) {
      $("#summary-support").textContent = `${formatNumber(state.currentResults.supportPct, 1)}%`;
      $("#headlineRecommendation").textContent = state.currentResults.headline;
    }
  }

  // -----------------------------
  // Costing
  // -----------------------------

  function getCostsFromInputs() {
    return {
      itSystems: parseNumber($("#cost-it-systems").value, 0),
      communications: parseNumber($("#cost-communications").value, 0),
      enforcement: parseNumber($("#cost-enforcement").value, 0),
      compensation: parseNumber($("#cost-compensation").value, 0),
      admin: parseNumber($("#cost-admin").value, 0),
      other: parseNumber($("#cost-other").value, 0),
    };
  }

  function setCostsToInputs(costs) {
    $("#cost-it-systems").value = costs.itSystems;
    $("#cost-communications").value = costs.communications;
    $("#cost-enforcement").value = costs.enforcement;
    $("#cost-compensation").value = costs.compensation;
    $("#cost-admin").value = costs.admin;
    $("#cost-other").value = costs.other;
  }

  function getDefaultCosts(country, scope, outbreak, population, horizon) {
    // Very stylised defaults: base ~ 6.75 M per 1M pop for severe, scaled by scope.
    const scopeFactor = scope === "all" ? 1.4 : 1.0;
    const outbreakFactor = outbreak === "severe" ? 1.0 : 0.6;
    const basePerMillion = 6_750_000; // baseline for 1M, severe, high-risk
    const popFactor = population / 1_000_000;
    const horizonFactor = Math.max(0.25, horizon);
    const total = basePerMillion * popFactor * scopeFactor * outbreakFactor * horizonFactor;

    // Allocate across categories
    const itSystems = total * 0.30;
    const communications = total * 0.15;
    const enforcement = total * 0.25;
    const compensation = total * 0.10;
    const admin = total * 0.15;
    const other = total * 0.05;

    return { itSystems, communications, enforcement, compensation, admin, other };
  }

  function initCosts() {
    $("#btn-apply-costs").addEventListener("click", () => {
      state.currentCosts = getCostsFromInputs();
      recalcCurrentResults(true);
      showToast("Costs applied", "success");
    });

    $("#btn-load-default-costs").addEventListener("click", () => {
      const cfg = state.currentConfig || getCurrentCountryConfig();
      const settings = state.settings;
      const defaults = getDefaultCosts(
        cfg.country,
        cfg.scope,
        cfg.outbreak,
        settings.population,
        settings.horizon
      );
      state.currentCosts = defaults;
      setCostsToInputs(defaults);
      recalcCurrentResults(true);
      showToast("Evidence-based cost template loaded", "success");
    });

    $("#btn-save-scenario-costs").addEventListener("click", () => {
      state.currentCosts = getCostsFromInputs();
      saveCurrentScenario();
    });
  }

  // -----------------------------
  // Preference & results
  // -----------------------------

  function getPredictedSupport(config) {
    if (!config) return null;
    const countryModel = preferenceModels[config.country] || preferenceModels.AU;
    const model = config.outbreak === "severe" ? countryModel.severe : countryModel.mild;

    let u = model.intercept;
    u += model.lives * (config.livesPer100k / 10); // scale lives per 100k
    if (config.scope === "all") u += model.scopeAll;
    if (config.exemptions === "medrel") u += model.exemptionsMedRel;
    if (config.exemptions === "medrelpers") u += model.exemptionsMedRelPers;
    if (config.coverage >= 0.9) u += model.coverage90;
    else if (config.coverage >= 0.7) u += model.coverage70;

    const support = logistic(u) * 100;
    return clamp(support, 0, 100);
  }

  function computeLivesTotal(config, settings) {
    if (!config || !settings) return 0;
    const livesPer100k = config.livesPer100k || 0;
    const pop = settings.population || 0;
    return (livesPer100k * pop) / 100_000;
  }

  function computeAdditionalMetrics(config, settings, livesTotal) {
    const m = settings.metrics;
    const livesPer100k = config.livesPer100k || 0;
    const popFactor = settings.population / 100_000;

    // Hospitalisations
    let hosp = 0;
    if (m.hospPer100k && m.hospPer100k > 0) {
      hosp = m.hospPer100k * popFactor;
    } else {
      hosp = (m.hospPerLife || 0) * livesTotal;
    }

    // ICU
    let icu = 0;
    if (m.icuPer100k && m.icuPer100k > 0) {
      icu = m.icuPer100k * popFactor;
    } else {
      icu = (m.icuPerLife || 0) * livesTotal;
    }

    // Working days
    let workdays = 0;
    if (m.workdaysPer100k && m.workdaysPer100k > 0) {
      workdays = m.workdaysPer100k * popFactor;
    } else {
      workdays = (m.workdaysPerLife || 0) * livesTotal;
    }

    return { hosp, icu, workdays };
  }

  function computeResults() {
    const config = state.currentConfig || getCurrentCountryConfig();
    state.currentConfig = config;
    const settings = state.settings;
    const costs = state.currentCosts || getCostsFromInputs();

    const supportPct = getPredictedSupport(config);
    const livesTotal = computeLivesTotal(config, settings);
    const benefitMonetary = livesTotal * (settings.vsl || 0);

    const costTotal =
      (costs.itSystems || 0) +
      (costs.communications || 0) +
      (costs.enforcement || 0) +
      (costs.compensation || 0) +
      (costs.admin || 0) +
      (costs.other || 0);

    const bcr = costTotal > 0 ? benefitMonetary / costTotal : null;
    const netBenefit = benefitMonetary - costTotal;

    const add = computeAdditionalMetrics(config, settings, livesTotal);

    const headline = buildHeadlineSummary(config, supportPct, livesTotal, bcr, netBenefit, settings);

    const results = {
      supportPct,
      livesTotal,
      benefitMonetary,
      costTotal,
      netBenefit,
      bcr,
      hosp: add.hosp,
      icu: add.icu,
      workdays: add.workdays,
      headline,
    };

    state.currentResults = results;
    return results;
  }

  function buildHeadlineSummary(config, supportPct, livesTotal, bcr, netBenefit, settings) {
    const countryLabels = { AU: "Australia", FR: "France", IT: "Italy" };
    const countryName = countryLabels[config.country] || config.country;
    const outbreakLabel = config.outbreak === "severe" ? "a severe outbreak" : "a mild / endemic scenario";
    const scopeText =
      config.scope === "all" ? "all occupations and public spaces" : "high-risk occupations only";
    let excText = "";
    if (config.exemptions === "medical") excText = "medical-only exemptions";
    else if (config.exemptions === "medrel") excText = "medical and religious exemptions";
    else excText = "medical, religious and personal-belief exemptions";

    const coveragePct = config.coverage * 100;
    const livesT = formatNumber(livesTotal, 1);
    const supportT = formatNumber(supportPct, 1);
    const bcrT = bcr === null ? "not defined" : formatNumber(bcr, 2);
    const netT = formatCurrency(netBenefit, settings.currencyLabel);

    return `In ${countryName}, under ${outbreakLabel}, a mandate covering ${scopeText} with ${excText} and a coverage threshold of ${formatNumber(
      coveragePct,
      0
    )}% is expected to save around ${livesT} lives over the analysis horizon, with model-based public support of about ${supportT}%. The corresponding net benefit is approximately ${netT}, with a benefit–cost ratio of ${bcrT}, given the current cost and benefit assumptions.`;
  }

  function updateStatusChips(results) {
    const supportChip = $("#status-support");
    const bcrChip = $("#status-bcr");
    const dataChip = $("#status-data");

    if (!results) {
      supportChip.textContent = "Support: –";
      supportChip.className = "status-chip status-neutral";

      bcrChip.textContent = "BCR: –";
      bcrChip.className = "status-chip status-neutral";

      dataChip.textContent = "Data: configuration only";
      dataChip.className = "status-chip status-neutral";
      return;
    }

    // Support
    let supportClass = "status-neutral";
    if (results.supportPct >= 70) supportClass = "status-positive";
    else if (results.supportPct >= 50) supportClass = "status-warning";
    else supportClass = "status-negative";
    supportChip.className = `status-chip ${supportClass}`;
    supportChip.textContent = `Support: ${formatNumber(results.supportPct, 1)}%`;

    // BCR
    if (results.bcr === null) {
      bcrChip.className = "status-chip status-neutral";
      bcrChip.textContent = "BCR: not defined (cost = 0)";
    } else {
      let bcrClass = "status-neutral";
      if (results.bcr >= 1.5) bcrClass = "status-positive";
      else if (results.bcr >= 1.0) bcrClass = "status-warning";
      else bcrClass = "status-negative";
      bcrChip.className = `status-chip ${bcrClass}`;
      bcrChip.textContent = `BCR: ${formatNumber(results.bcr, 2)}`;
    }

    // Data chip
    const hasCosts = results.costTotal && results.costTotal > 0;
    dataChip.className = "status-chip status-neutral";
    dataChip.textContent = hasCosts ? "Data: config + costs + benefits" : "Data: config + benefits only";
  }

  function updateResultsUI() {
    const results = state.currentResults;
    const cfg = state.currentConfig || getCurrentCountryConfig();
    const settings = state.settings;

    if (!results) {
      $("#result-lives-total").textContent = "–";
      $("#result-benefit-monetary").textContent = "–";
      $("#result-cost-total").textContent = "–";
      $("#result-net-benefit").textContent = "–";
      $("#result-bcr").textContent = "–";
      $("#result-support").textContent = "–";
      $("#result-hosp-averted").textContent = "–";
      $("#result-icu-averted").textContent = "–";
      $("#result-workdays-saved").textContent = "–";
      $("#resultsNarrative").textContent =
        "Apply a configuration and, if possible, enter costs to see a narrative summary of cost–benefit performance, model-based public support and additional non-monetary metrics.";
      $("#equity-badge").style.display = "none";
      return;
    }

    $("#result-lives-total").textContent = formatNumber(results.livesTotal, 1);
    $("#result-benefit-monetary").textContent = formatCurrency(results.benefitMonetary, settings.currencyLabel);
    $("#result-cost-total").textContent = formatCurrency(results.costTotal, settings.currencyLabel);
    $("#result-net-benefit").textContent = formatCurrency(results.netBenefit, settings.currencyLabel);
    $("#result-bcr").textContent = results.bcr === null ? "–" : formatNumber(results.bcr, 2);
    $("#result-support").textContent = `${formatNumber(results.supportPct, 1)}%`;
    $("#result-hosp-averted").textContent = formatNumber(results.hosp, 1);
    $("#result-icu-averted").textContent = formatNumber(results.icu, 1);
    $("#result-workdays-saved").textContent = formatNumber(results.workdays, 0);

    $("#resultsNarrative").textContent = buildResultsNarrative(cfg, results, settings);
    updateEquityBadge();
    updateDeltaSummary();
    updateStatusChips(results);
    updateConfigSummary();
    updateCharts();
    updateMRSTableAndChart();
    updateScenarioBriefingTextFromCurrent();
    updateBriefingTemplate();
    updateAiPrompt();
  }

  function buildResultsNarrative(config, results, settings) {
    const countryLabels = { AU: "Australia", FR: "France", IT: "Italy" };
    const countryName = countryLabels[config.country] || config.country;
    const outbreakLabel = config.outbreak === "severe" ? "severe outbreak" : "mild / endemic scenario";
    const scopeText =
      config.scope === "all" ? "all occupations and public spaces" : "high-risk occupations only";

    let bcrText = "";
    if (results.bcr === null) {
      bcrText = "The benefit–cost ratio is not defined because total mandate implementation cost is currently set to zero.";
    } else if (results.bcr >= 1) {
      bcrText = `The benefit–cost ratio is ${formatNumber(
        results.bcr,
        2
      )}, indicating that, under these assumptions, the monetary value of lives saved exceeds estimated implementation costs.`;
    } else {
      bcrText = `The benefit–cost ratio is ${formatNumber(
        results.bcr,
        2
      )}, suggesting that, with the current assumptions, implementation costs exceed the monetary value of lives saved.`;
    }

    const supportLevel =
      results.supportPct >= 70
        ? "strong majority"
        : results.supportPct >= 50
        ? "narrow majority"
        : "minority";

    return `For ${countryName} in a ${outbreakLabel}, the current configuration covers ${scopeText}. Model-based public support is approximately ${formatNumber(
      results.supportPct,
      1
    )}%, which corresponds to a ${supportLevel} in favour of the mandate over no mandate. Over the specified population and analysis horizon, the mandate is expected to save about ${formatNumber(
      results.livesTotal,
      1
    )} lives, avert roughly ${formatNumber(
      results.hosp,
      1
    )} hospitalisations and ${formatNumber(
      results.icu,
      1
    )} ICU admissions, and preserve around ${formatNumber(
      results.workdays,
      0
    )} working days. The estimated net benefit is ${formatCurrency(
      results.netBenefit,
      settings.currencyLabel
    )}. ${bcrText}`;
  }

  function updateEquityBadge() {
    const badge = $("#equity-badge");
    const equityText = $("#dist-equity-concerns").value.trim();
    if (equityText.length > 0) {
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  }

  function updateDeltaSummary() {
    const el = $("#delta-summary");
    const prev = state.previousResults;
    const curr = state.currentResults;
    if (!curr || !prev) {
      el.textContent =
        "When you adjust parameters and click “Apply configuration”, this box will highlight how key metrics changed relative to the previous configuration.";
      return;
    }

    const dSupport = curr.supportPct - prev.supportPct;
    const dBcr = (curr.bcr || 0) - (prev.bcr || 0);
    const dLives = curr.livesTotal - prev.livesTotal;
    const dNet = curr.netBenefit - prev.netBenefit;

    const signText = (val, decimals, unit) => {
      if (Math.abs(val) < 1e-6) return `no notable change in ${unit}`;
      const sign = val > 0 ? "+" : "−";
      return `${sign}${formatNumber(Math.abs(val), decimals)} ${unit}`;
    };

    el.textContent = `Compared with the previous configuration, model-based public support changed by ${signText(
      dSupport,
      1,
      "percentage points"
    )}, the benefit–cost ratio changed by ${signText(dBcr, 2, "units")}, total lives saved changed by ${signText(
      dLives,
      1,
      "lives"
    )}, and net benefit changed by ${signText(dNet, 2, state.settings.currencyLabel)}.`;
  }

  function recalcCurrentResults(forceCreatePrev = false) {
    if (forceCreatePrev && state.currentResults) {
      state.previousResults = { ...state.currentResults };
    }
    computeResults();
    updateResultsUI();
    updateScenarioSummaryCosts();
    renderScenariosTable(); // to refresh BCR, support etc. if settings changed
    updatePinnedDashboard();
  }

  // -----------------------------
  // MRS (lives-saved equivalents)
  // -----------------------------

  function computeMRSForCurrentModel() {
    const cfg = state.currentConfig || getCurrentCountryConfig();
    const countryModel = preferenceModels[cfg.country] || preferenceModels.AU;
    const model = cfg.outbreak === "severe" ? countryModel.severe : countryModel.mild;

    const betaLives = model.lives || 0.05;
    if (!betaLives || Math.abs(betaLives) < 1e-6) return [];

    const entries = [];

    // Baselines: scope=highrisk, exemptions=medical, coverage=0.5 (50%).
    // Changes interpreted relative to something more permissive or strict.

    // Scope: all vs high-risk
    const deltaScopeAll = model.scopeAll; // utility of going from high-risk to all
    const mrsScope = -(deltaScopeAll / betaLives) * 10; // lives per 100k
    entries.push({
      label: "Expand scope from high-risk workers to all occupations and public spaces",
      value: mrsScope,
    });

    // Exemptions: medical + religious vs medical only
    const deltaMedRel = model.exemptionsMedRel; // relative to baseline medical-only
    const mrsMedRel = -(deltaMedRel / betaLives) * 10;
    entries.push({
      label: "Allow medical and religious exemptions instead of medical-only exemptions",
      value: mrsMedRel,
    });

    // Exemptions: add personal-belief exemptions
    const deltaMedRelPers = model.exemptionsMedRelPers; // relative to baseline
    const mrsMedRelPers = -(deltaMedRelPers / betaLives) * 10;
    entries.push({
      label: "Add personal-belief exemptions to medical and religious exemptions",
      value: mrsMedRelPers,
    });

    // Coverage: 70% vs 50%
    const deltaCov70 = model.coverage70; // 70 vs 50 (baseline)
    const mrsCov70 = -(deltaCov70 / betaLives) * 10;
    entries.push({
      label: "Increase coverage threshold from 50% to 70%",
      value: mrsCov70,
    });

    // Coverage: 90% vs 50%
    const deltaCov90 = model.coverage90; // 90 vs 50 (baseline)
    const mrsCov90 = -(deltaCov90 / betaLives) * 10;
    entries.push({
      label: "Increase coverage threshold from 50% to 90%",
      value: mrsCov90,
    });

    return entries;
  }

  function updateMRSTableAndChart() {
    const tableBody = $("#mrs-table tbody");
    const mrsNarrative = $("#mrsNarrative");
    tableBody.innerHTML = "";

    const entries = computeMRSForCurrentModel();
    if (!entries.length) {
      mrsNarrative.textContent =
        "Configure a mandate to see how changes in scope, exemptions or coverage compare to changes in expected lives saved. Lives-saved equivalents are not available for the current configuration.";
      if (state.charts.mrsChart) {
        state.charts.mrsChart.destroy();
        state.charts.mrsChart = null;
      }
      return;
    }

    entries.forEach((e) => {
      const tr = document.createElement("tr");
      const tdChange = document.createElement("td");
      const tdValue = document.createElement("td");
      const tdInterp = document.createElement("td");

      tdChange.textContent = e.label;
      tdValue.textContent = `${formatNumber(e.value, 1)} lives per 100,000`;

      let direction = "";
      if (e.value > 0) {
        direction =
          "This change is less acceptable: it would require additional expected lives saved per 100,000 people to keep overall support unchanged.";
      } else if (e.value < 0) {
        direction =
          "This change is more acceptable: people would tolerate fewer lives saved per 100,000 people and still regard the option similarly.";
      } else {
        direction = "This change has almost no effect on acceptability in the current model.";
      }

      tdInterp.textContent = direction;

      tr.appendChild(tdChange);
      tr.appendChild(tdValue);
      tr.appendChild(tdInterp);
      tableBody.appendChild(tr);
    });

    mrsNarrative.textContent =
      "Positive values indicate mandate changes that reduce acceptability and therefore require more expected lives saved per 100,000 people to compensate. Negative values indicate changes that increase acceptability and would be accepted even if expected lives saved per 100,000 people were smaller.";

    // Chart
    const ctx = $("#chart-mrs");
    if (!ctx) return;
    if (state.charts.mrsChart) {
      state.charts.mrsChart.destroy();
    }

    state.charts.mrsChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: entries.map((e) => e.label),
        datasets: [
          {
            label: "Lives-saved equivalent (per 100,000 people)",
            data: entries.map((e) => e.value),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${formatNumber(ctx.parsed.y || ctx.parsed.x, 1)} lives saved per 100,000`,
            },
          },
        },
        scales: {
          x: {
            ticks: { font: { size: 10 } },
          },
          y: {
            beginAtZero: false,
          },
        },
      },
    });
  }

  // -----------------------------
  // Charts
  // -----------------------------

  function updateCharts() {
    const results = state.currentResults;
    if (!results) {
      if (state.charts.bcrChart) {
        state.charts.bcrChart.destroy();
        state.charts.bcrChart = null;
      }
      if (state.charts.supportChart) {
        state.charts.supportChart.destroy();
        state.charts.supportChart = null;
      }
      return;
    }

    updateBcrChart(results);
    updateSupportChart(results);
  }

  function updateBcrChart(results) {
    const ctx = $("#chart-bcr");
    if (!ctx) return;
    if (state.charts.bcrChart) {
      state.charts.bcrChart.destroy();
    }

    const data = {
      labels: ["Benefit", "Cost", "Net benefit"],
      datasets: [
        {
          label: "Amount",
          data: [results.benefitMonetary, results.costTotal, results.netBenefit],
        },
      ],
    };

    state.charts.bcrChart = new Chart(ctx, {
      type: "bar",
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                formatCurrency(ctx.parsed.y || ctx.parsed.x, state.settings.currencyLabel),
            },
          },
        },
        scales: {
          x: {
            ticks: { font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (val) => formatNumber(val / 1_000_000, 1) + " M",
            },
          },
        },
      },
    });
  }

  function updateSupportChart(results) {
    const ctx = $("#chart-support");
    if (!ctx) return;
    if (state.charts.supportChart) {
      state.charts.supportChart.destroy();
    }

    const support = clamp(results.supportPct, 0, 100);
    const optOut = clamp(100 - support, 0, 100);

    state.charts.supportChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Support for mandate", "Prefer no mandate"],
        datasets: [
          {
            label: "Share of respondents",
            data: [support, optOut],
          },
          {
            type: "line",
            label: "Minimal majority (50%)",
            data: [50, 50],
            fill: false,
            borderDash: [6, 4],
          },
          {
            type: "line",
            label: "Strong support threshold (70%)",
            data: [70, 70],
            fill: false,
            borderDash: [4, 4],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: (ctx) => `${formatNumber(ctx.parsed.y || ctx.parsed.x, 1)}%`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (val) => `${val}%`,
            },
          },
        },
      },
    });
  }

  function updateScenarioSummaryCosts() {
    if (!state.currentResults) {
      $("#summary-cost-total").textContent = "–";
      $("#summary-cost-main").textContent = "–";
      return;
    }
    const costs = state.currentCosts || getCostsFromInputs();
    const settings = state.settings;
    const total =
      (costs.itSystems || 0) +
      (costs.communications || 0) +
      (costs.enforcement || 0) +
      (costs.compensation || 0) +
      (costs.admin || 0) +
      (costs.other || 0);

    $("#summary-cost-total").textContent = formatCurrency(total, settings.currencyLabel);

    const buckets = [
      { label: "Digital systems & infrastructure", value: costs.itSystems || 0 },
      { label: "Communications & public information", value: costs.communications || 0 },
      { label: "Enforcement & compliance", value: costs.enforcement || 0 },
      { label: "Adverse-event monitoring & compensation", value: costs.compensation || 0 },
      { label: "Administration & programme management", value: costs.admin || 0 },
      { label: "Other mandate-specific costs", value: costs.other || 0 },
    ];
    buckets.sort((a, b) => b.value - a.value);
    const main = buckets[0];
    $("#summary-cost-main").textContent =
      main && main.value > 0 ? `${main.label} (${formatCurrency(main.value, settings.currencyLabel)})` : "–";
  }

  // -----------------------------
  // Scenario storage & table
  // -----------------------------

  function loadScenariosFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_SCENARIOS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        state.scenarios = parsed;
      }
    } catch (e) {
      console.warn("Failed to load scenarios", e);
    }
  }

  function saveScenariosToStorage() {
    try {
      localStorage.setItem(STORAGE_SCENARIOS_KEY, JSON.stringify(state.scenarios));
    } catch (e) {
      console.warn("Failed to save scenarios", e);
    }
  }

  function buildScenarioFromState() {
    if (!state.currentConfig || !state.currentResults) {
      // Make sure we at least compute results
      computeResults();
    }
    const cfg = state.currentConfig || getCurrentCountryConfig();
    const results = state.currentResults;
    const settings = state.settings;
    const costs = state.currentCosts || getCostsFromInputs();

    const distribution = {
      groups: $("#dist-groups").value.trim(),
      sectors: $("#dist-sectors").value.trim(),
      equityConcerns: $("#dist-equity-concerns").value.trim(),
    };

    const hasCompleteCosts =
      (costs.itSystems || 0) +
        (costs.communications || 0) +
        (costs.enforcement || 0) +
        (costs.compensation || 0) +
        (costs.admin || 0) +
        (costs.other || 0) >
      0;

    return {
      id: `sc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      createdAt: new Date().toISOString(),
      settings: {
        horizon: settings.horizon,
        population: settings.population,
        currencyLabel: settings.currencyLabel,
        vslMetric: settings.vslMetric,
        vsl: settings.vsl,
        metrics: { ...settings.metrics },
      },
      config: { ...cfg },
      costs: { ...costs },
      results: { ...results },
      distribution,
      hasCompleteCosts,
    };
  }

  function saveCurrentScenario() {
    state.previousResults = state.currentResults ? { ...state.currentResults } : null;
    computeResults();
    const scenario = buildScenarioFromState();
    state.scenarios.push(scenario);
    saveScenariosToStorage();
    renderScenariosTable();
    updatePinnedDashboard();
    updateScenarioBriefingText(scenario);
    updateAiPrompt();
    showToast("Scenario saved", "success");
  }

  function renderScenariosTable() {
    const tbody = $("#scenarios-table tbody");
    tbody.innerHTML = "";

    state.scenarios.forEach((sc, index) => {
      const tr = document.createElement("tr");
      tr.dataset.id = sc.id;
      if (!sc.hasCompleteCosts) {
        tr.classList.add("incomplete-costs");
      }

      const cfg = sc.config;
      const res = sc.results;
      const settings = sc.settings;

      const countryLabels = { AU: "Australia", FR: "France", IT: "Italy" };
      const outbreakLabel = cfg.outbreak === "severe" ? "Severe" : "Mild";
      const scopeLabel =
        cfg.scope === "all" ? "All occupations & public spaces" : "High-risk occupations only";
      let excLabel = "";
      if (cfg.exemptions === "medical") excLabel = "Medical only";
      else if (cfg.exemptions === "medrel") excLabel = "Med + religious";
      else excLabel = "Med + rel + personal";
      const coverageLabel = `${formatNumber(cfg.coverage * 100, 0)}%`;
      const livesPer100k = formatNumber(cfg.livesPer100k, 1);
      const livesTotal = formatNumber(res.livesTotal, 1);
      const benefit = formatCurrency(res.benefitMonetary, settings.currencyLabel);
      const cost = formatCurrency(res.costTotal, settings.currencyLabel);
      const net = formatCurrency(res.netBenefit, settings.currencyLabel);
      const bcr = res.bcr === null ? "–" : formatNumber(res.bcr, 2);
      const support = `${formatNumber(res.supportPct, 1)}%`;
      const equityShort = sc.distribution.equityConcerns
        ? sc.distribution.equityConcerns.slice(0, 40) + (sc.distribution.equityConcerns.length > 40 ? "…" : "")
        : "";

      const isPinned = state.pinnedIds.includes(sc.id);

      const cells = [
        index + 1,
        countryLabels[cfg.country] || cfg.country,
        outbreakLabel,
        scopeLabel,
        excLabel,
        coverageLabel,
        livesPer100k,
        livesTotal,
        benefit,
        cost,
        net,
        bcr,
        support,
        equityShort,
      ];

      cells.forEach((val) => {
        const td = document.createElement("td");
        td.textContent = val;
        tr.appendChild(td);
      });

      // Pin column
      const tdPin = document.createElement("td");
      const btnPin = document.createElement("button");
      btnPin.type = "button";
      btnPin.className = "btn outline";
      btnPin.textContent = isPinned ? "Unpin" : "Pin";
      btnPin.dataset.id = sc.id;
      btnPin.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePinnedScenario(sc.id);
      });
      tdPin.appendChild(btnPin);
      tr.appendChild(tdPin);

      // Click row to populate briefing
      tr.addEventListener("click", (e) => {
        if (e.target === btnPin) return;
        updateScenarioBriefingText(sc);
        updateAiPrompt(sc);
      });

      tbody.appendChild(tr);
    });
  }

  function togglePinnedScenario(id) {
    const idx = state.pinnedIds.indexOf(id);
    if (idx >= 0) {
      state.pinnedIds.splice(idx, 1);
    } else {
      if (state.pinnedIds.length >= 3) {
        showToast("You can pin up to three scenarios at a time", "error");
        return;
      }
      state.pinnedIds.push(id);
    }
    renderScenariosTable();
    updatePinnedDashboard();
  }

  function updatePinnedDashboard() {
    const container = $("#pinned-scenarios-summary");
    const radarCanvas = $("#chart-scenario-radar");
    if (!container || !radarCanvas) return;

    container.innerHTML = "";

    const pinnedScs = state.scenarios.filter((s) => state.pinnedIds.includes(s.id));
    if (!pinnedScs.length) {
      if (state.charts.radarChart) {
        state.charts.radarChart.destroy();
        state.charts.radarChart = null;
      }
      const p = document.createElement("p");
      p.className = "small-note";
      p.textContent =
        "Pin scenarios from the table below to compare their support, benefit–cost ratio, total lives saved and implementation cost.";
      container.appendChild(p);
      return;
    }

    // Build radar chart data: normalise metrics to 0–100.
    const labels = ["Public support", "Benefit–cost ratio", "Total lives saved", "Total cost"];

    const supportVals = pinnedScs.map((s) => s.results.supportPct || 0);
    const bcrVals = pinnedScs.map((s) => (s.results.bcr === null ? 0 : s.results.bcr));
    const livesVals = pinnedScs.map((s) => s.results.livesTotal || 0);
    const costVals = pinnedScs.map((s) => s.results.costTotal || 0);

    const maxSupport = Math.max(...supportVals, 1);
    const maxBcr = Math.max(...bcrVals, 1);
    const maxLives = Math.max(...livesVals, 1);
    const maxCost = Math.max(...costVals, 1);

    const datasets = pinnedScs.map((s, idx) => ({
      label: `Scenario ${idx + 1}`,
      data: [
        (s.results.supportPct / maxSupport) * 100,
        (s.results.bcr === null ? 0 : s.results.bcr / maxBcr) * 100,
        (s.results.livesTotal / maxLives) * 100,
        (s.results.costTotal / maxCost) * 100,
      ],
    }));

    if (state.charts.radarChart) {
      state.charts.radarChart.destroy();
    }
    state.charts.radarChart = new Chart(radarCanvas, {
      type: "radar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: { r: { beginAtZero: true, max: 100 } },
      },
    });

    // Build text cards
    pinnedScs.forEach((sc, idx) => {
      const card = document.createElement("div");
      card.className = "pinned-scenario-card";

      const header = document.createElement("div");
      header.className = "pinned-scenario-header";

      const title = document.createElement("div");
      title.className = "pinned-scenario-title";
      const countryLabels = { AU: "Australia", FR: "France", IT: "Italy" };
      title.textContent = `Scenario ${idx + 1} – ${countryLabels[sc.config.country] || sc.config.country}`;

      const tag = document.createElement("div");
      tag.className = "pinned-scenario-tag";
      tag.textContent =
        sc.config.outbreak === "severe" ? "Severe outbreak, " : "Mild / endemic, ";
      tag.textContent += sc.config.scope === "all" ? "all occupations & public spaces" : "high-risk only";

      header.appendChild(title);
      header.appendChild(tag);
      card.appendChild(header);

      const support = sc.results.supportPct || 0;
      const bcr = sc.results.bcr;
      const lives = sc.results.livesTotal || 0;
      const cost = sc.results.costTotal || 0;

      const supportClass =
        support >= 70 ? "good" : support >= 50 ? "medium" : "poor";
      const bcrClass =
        bcr === null ? "medium" : bcr >= 1.5 ? "good" : bcr >= 1 ? "medium" : "poor";

      const p1 = document.createElement("div");
      p1.className = "pinned-delta";
      p1.textContent = `Support: ${formatNumber(
        support,
        1
      )}% (${supportClass === "good" ? "green" : supportClass === "medium" ? "amber" : "red"})`;

      const p2 = document.createElement("div");
      p2.className = "pinned-delta";
      p2.textContent =
        bcr === null
          ? "BCR: not defined (cost = 0)"
          : `BCR: ${formatNumber(
              bcr,
              2
            )} (${bcrClass === "good" ? "green" : bcrClass === "medium" ? "amber" : "red"})`;

      const p3 = document.createElement("div");
      p3.className = "pinned-delta";
      p3.textContent = `Total lives saved: ${formatNumber(lives, 1)}; total cost: ${formatCurrency(
        cost,
        sc.settings.currencyLabel
      )}.`;

      // Simple pairwise comparison if at least 2 pinned
      if (pinnedScs.length >= 2 && idx < pinnedScs.length - 1) {
        const next = pinnedScs[idx + 1];
        const dSup = next.results.supportPct - sc.results.supportPct;
        const dBcr = (next.results.bcr || 0) - (sc.results.bcr || 0);
        const cmp = document.createElement("div");
        cmp.className = "pinned-delta";
        cmp.textContent = `Compared with Scenario ${
          idx + 2
        }, this scenario has ${dSup >= 0 ? "+" : "−"}${formatNumber(
          Math.abs(dSup),
          1
        )} percentage points in support and ${dBcr >= 0 ? "+" : "−"}${formatNumber(
          Math.abs(dBcr),
          2
        )} in BCR.`;
        card.appendChild(cmp);
      }

      // Traffic stripes (visual only)
      const supportStripe = document.createElement("div");
      supportStripe.className = "traffic-stripe";
      ["poor", "medium", "good"].forEach((level) => {
        const seg = document.createElement("div");
        seg.className = "traffic-stripe-segment";
        if (level === "good") seg.classList.add("traffic-support-good");
        if (level === "medium") seg.classList.add("traffic-support-medium");
        if (level === "poor") seg.classList.add("traffic-support-poor");
        supportStripe.appendChild(seg);
      });

      const bcrStripe = document.createElement("div");
      bcrStripe.className = "traffic-stripe";
      ["poor", "medium", "good"].forEach((level) => {
        const seg = document.createElement("div");
        seg.className = "traffic-stripe-segment";
        if (level === "good") seg.classList.add("traffic-bcr-good");
        if (level === "medium") seg.classList.add("traffic-bcr-medium");
        if (level === "poor") seg.classList.add("traffic-bcr-poor");
        bcrStripe.appendChild(seg);
      });

      card.appendChild(supportStripe);
      card.appendChild(bcrStripe);
      card.appendChild(p1);
      card.appendChild(p2);
      card.appendChild(p3);

      container.appendChild(card);
    });
  }

  // -----------------------------
  // Briefings
  // -----------------------------

  function buildScenarioBriefing(sc) {
    const cfg = sc.config;
    const res = sc.results;
    const settings = sc.settings;
    const distr = sc.distribution;

    const countryLabels = { AU: "Australia", FR: "France", IT: "Italy" };
    const countryName = countryLabels[cfg.country] || cfg.country;
    const outbreakLabel = cfg.outbreak === "severe" ? "severe outbreak" : "mild / endemic scenario";
    const scopeText =
      cfg.scope === "all" ? "all occupations and public spaces" : "high-risk occupations only";

    let excText = "";
    if (cfg.exemptions === "medical") excText = "medical-only exemptions";
    else if (cfg.exemptions === "medrel") excText = "medical and religious exemptions";
    else excText = "medical, religious and personal-belief exemptions";

    const coveragePct = cfg.coverage * 100;
    const supportLevel =
      res.supportPct >= 70
        ? "strong majority"
        : res.supportPct >= 50
        ? "narrow majority"
        : "minority";
    const livesPer100k = formatNumber(cfg.livesPer100k, 1);

    const equityBlock =
      distr.equityConcerns || distr.groups || distr.sectors
        ? `\nEQUITY AND DISTRIBUTIONAL NOTES\n- Groups most affected: ${
            distr.groups || "not specified"
          }\n- Sectors most exposed: ${distr.sectors || "not specified"}\n- Equity concerns: ${
            distr.equityConcerns || "none recorded at this stage"
          }`
        : "\nEQUITY AND DISTRIBUTIONAL NOTES\n- No specific equity concerns recorded yet. Officials should consider whether any particular groups face disproportionate burdens or barriers under this configuration.";

    return `SCENARIO SUMMARY – POTENTIAL FUTURE VACCINE MANDATE

Country and context:
- Country: ${countryName}
- Outbreak scenario: ${outbreakLabel}
- Population covered: ${settings.population.toLocaleString()} people
- Analysis horizon: ${settings.horizon} year(s)

Mandate design:
- Scope of mandate: ${scopeText}
- Exemption policy: ${excText}
- Coverage threshold to lift mandate: ${formatNumber(coveragePct, 0)}% vaccinated
- Expected lives saved: ${livesPer100k} per 100,000 people

Preference-based support:
- Model-based public support: ${formatNumber(
      res.supportPct,
      1
    )}% (${supportLevel} in favour of the mandate over no mandate)

Cost–benefit summary (using ${settings.currencyLabel} as the currency label):
- Total implementation cost: ${formatCurrency(res.costTotal, settings.currencyLabel)}
- Monetary benefit of lives saved: ${formatCurrency(res.benefitMonetary, settings.currencyLabel)}
- Net benefit: ${formatCurrency(res.netBenefit, settings.currencyLabel)}
- Benefit–cost ratio (BCR): ${
      res.bcr === null ? "not defined (cost currently set to zero)" : formatNumber(res.bcr, 2)
    }

Additional non-monetary metrics:
- Approximate total lives saved: ${formatNumber(res.livesTotal, 1)}
- Hospitalisations averted (approx.): ${formatNumber(res.hosp, 1)}
- ICU admissions averted (approx.): ${formatNumber(res.icu, 1)}
- Working days saved (approx.): ${formatNumber(res.workdays, 0)}

Interpretation:
- These figures are indicative only and depend on the assumed value per life saved, epidemiological inputs and implementation costs.
- Public support estimates are derived from stated-preference data and summarise how acceptable this mandate is relative to no mandate.

${equityBlock}
`;
  }

  function updateScenarioBriefingText(sc) {
    const el = $("#scenario-briefing-text");
    if (!sc) {
      el.value =
        "Select or save a scenario to generate a concise briefing here. The text will summarise the mandate design, model-based public support, cost–benefit results and any equity notes.";
      return;
    }
    el.value = buildScenarioBriefing(sc);
  }

  function updateScenarioBriefingTextFromCurrent() {
    if (!state.currentConfig || !state.currentResults) {
      updateScenarioBriefingText(null);
      return;
    }
    const temp = buildScenarioFromState();
    updateScenarioBriefingText(temp);
  }

  function initBriefingActions() {
    $("#btn-copy-briefing").addEventListener("click", async () => {
      const text = $("#scenario-briefing-text").value;
      try {
        await navigator.clipboard.writeText(text);
        showToast("Scenario briefing copied", "success");
      } catch {
        showToast("Could not copy briefing", "error");
      }
    });
  }

  // -----------------------------
  // Briefing template (structured)
  // -----------------------------

  function buildBriefingTemplate() {
    const cfg = state.currentConfig || getCurrentCountryConfig();
    const res = state.currentResults || computeResults();
    const settings = state.settings;

    const countryLabels = { AU: "Australia", FR: "France", IT: "Italy" };
    const countryName = countryLabels[cfg.country] || cfg.country;
    const outbreakLabel = cfg.outbreak === "severe" ? "severe outbreak" : "mild / endemic scenario";
    const scopeText =
      cfg.scope === "all" ? "all occupations and public spaces" : "high-risk occupations only";

    let excText = "";
    if (cfg.exemptions === "medical") excText = "medical-only exemptions";
    else if (cfg.exemptions === "medrel") excText = "medical and religious exemptions";
    else excText = "medical, religious and personal-belief exemptions";

    const coveragePct = cfg.coverage * 100;
    const livesPer100k = formatNumber(cfg.livesPer100k, 1);
    const bcrText = res.bcr === null ? "not defined (cost currently set to zero)" : formatNumber(res.bcr, 2);

    return `POLICY BRIEFING – POTENTIAL FUTURE VACCINE MANDATE

1. Decision context and question
- Country: ${countryName}
- Epidemiological setting: ${outbreakLabel}
- Decision question: Should the ministry pursue, refine or discard this potential future vaccine mandate configuration, given public support, expected health gains and implementation costs?

2. Mandate configuration
- Scope of mandate: ${scopeText}
- Exemption policy: ${excText}
- Coverage threshold to lift mandate: ${formatNumber(coveragePct, 0)}% population vaccinated
- Expected lives saved: ${livesPer100k} per 100,000 people
- Population covered: ${settings.population.toLocaleString()} people
- Analysis horizon: ${settings.horizon} year(s)

3. Evidence on public support
- Model-based public support (mixed logit): ${formatNumber(
      res.supportPct,
      1
    )}% of respondents are predicted to support this mandate versus no mandate.
- Interpretation: briefly describe whether this represents a strong majority, narrow majority or minority support, and any political or communication implications.

4. Health outcomes and additional metrics
- Approximate total lives saved: ${formatNumber(res.livesTotal, 1)}
- Approximate hospitalisations averted: ${formatNumber(res.hosp, 1)}
- Approximate ICU admissions averted: ${formatNumber(res.icu, 1)}
- Approximate working days saved: ${formatNumber(res.workdays, 0)}
- Note: These quantities depend on the epidemiological assumptions used in the tool and should be checked against current modelling.

5. Cost–benefit results (using ${settings.currencyLabel} as the currency label)
- Total implementation cost: ${formatCurrency(res.costTotal, settings.currencyLabel)}
- Monetary benefit of lives saved: ${formatCurrency(res.benefitMonetary, settings.currencyLabel)}
- Net benefit: ${formatCurrency(res.netBenefit, settings.currencyLabel)}
- Benefit–cost ratio (BCR): ${bcrText}
- Interpretation: summarise whether benefits clearly exceed costs, clearly fall short of costs, or are close to 1, and comment on how sensitive this is to the assumed value per life saved.

6. Equity and distributional considerations
- Groups most affected: [summarise from tool notes]
- Sectors most exposed: [summarise from tool notes]
- Equity concerns: [summarise any disproportionate burdens or access issues]
- Reflection: Are any vulnerable groups disproportionately bearing mandate-related costs or facing barriers to compliance? Are there feasible design adjustments (for example targeted communication, support measures or alternative exemptions) that would reduce inequities?

7. Implementation and feasibility
- Key enablers: [for example digital infrastructure readiness, existing immunisation systems, communication capacity]
- Key risks: [for example enforcement challenges, risk of backlash, legal uncertainty]
- Timeline and sequencing: [sketch a plausible timeline for preparation, roll-out and review]

8. Recommended next steps
- Outline 2–3 concrete actions for decision-makers (for example, request updated epidemiological projections, consult with legal and ethical advisers, test alternative mandate designs with equity-focused tweaks, or commission further economic analysis).`;
  }

  function updateBriefingTemplate() {
    $("#briefing-template").value = buildBriefingTemplate();
  }

  function initBriefingTemplateActions() {
    $("#btn-copy-briefing-template").addEventListener("click", async () => {
      const text = $("#briefing-template").value;
      try {
        await navigator.clipboard.writeText(text);
        showToast("Briefing template copied", "success");
      } catch {
        showToast("Could not copy briefing template", "error");
      }
    });
  }

  // -----------------------------
  // AI prompts
  // -----------------------------

  function buildSingleScenarioPrompt(sc) {
    const briefing = buildScenarioBriefing(sc);
    return `You are a neutral public policy analyst writing for senior health and finance officials.

Below is a structured summary of a potential future vaccine mandate scenario generated from a decision-aid tool:

${briefing}

TASK:
Using this information, draft a short, neutral and clear policy brief (about 1–2 pages) that:
1. Summarises the mandate configuration, public support estimates, expected health gains and cost–benefit results.
2. Clearly states the main trade-offs between public support, health gains and implementation costs.
3. Includes a dedicated paragraph on equity and distributional considerations, based on the “Equity and distributional notes” section, and highlights where further analysis or targeted mitigation may be needed.
4. Avoids advocating for or against the mandate; instead, lay out options and considerations for decision-makers.
5. Uses accessible language suitable for ministers and senior officials, while keeping numerical results visible (for example benefit–cost ratio, net benefit, approximate lives saved).`;
  }

  function buildComparativePrompt(scenarios) {
    const blocks = scenarios
      .map((sc, idx) => {
        const cfg = sc.config;
        const res = sc.results;
        const settings = sc.settings;

        const countryLabels = { AU: "Australia", FR: "France", IT: "Italy" };
        const countryName = countryLabels[cfg.country] || cfg.country;
        const outbreakLabel = cfg.outbreak === "severe" ? "severe outbreak" : "mild / endemic scenario";
        const scopeText =
          cfg.scope === "all" ? "all occupations and public spaces" : "high-risk occupations only";
        let excText = "";
        if (cfg.exemptions === "medical") excText = "medical-only";
        else if (cfg.exemptions === "medrel") excText = "medical and religious";
        else excText = "medical, religious and personal-belief";

        return `Scenario ${idx + 1}:
- Country: ${countryName}
- Outbreak: ${outbreakLabel}
- Scope: ${scopeText}
- Exemptions: ${excText}
- Coverage threshold: ${formatNumber(cfg.coverage * 100, 0)}%
- Expected lives saved: ${formatNumber(cfg.livesPer100k, 1)} per 100,000
- Public support (model-based): ${formatNumber(res.supportPct, 1)}%
- Total lives saved: ${formatNumber(res.livesTotal, 1)}
- Total implementation cost: ${formatCurrency(res.costTotal, settings.currencyLabel)}
- Monetary benefit: ${formatCurrency(res.benefitMonetary, settings.currencyLabel)}
- Net benefit: ${formatCurrency(res.netBenefit, settings.currencyLabel)}
- Benefit–cost ratio: ${res.bcr === null ? "not defined" : formatNumber(res.bcr, 2)}
- Equity notes: ${sc.distribution.equityConcerns || "none recorded"}`;
      })
      .join("\n\n");

    return `You are a neutral public policy analyst writing for senior health and finance officials.

Below are multiple vaccine mandate scenarios exported from a decision-aid tool:

${blocks}

TASK:
Using this information, draft a comparative policy memo (about 2–3 pages) that:
1. Compares the scenarios in terms of:
   - Public support and political feasibility.
   - Expected health gains (lives saved, hospitalisations and ICU admissions averted).
   - Implementation costs, net benefits and benefit–cost ratios.
2. Highlights which scenarios appear more efficient (higher benefit–cost ratio), which appear more acceptable (higher support), and where there are clear tensions between efficiency and support.
3. Includes a separate section on equity and distributional impacts that:
   - Identifies which scenarios may place heavier burdens on specific groups or sectors.
   - Notes any scenarios that might reduce inequities.
   - Flags where further qualitative or quantitative equity analysis would be valuable.
4. Ends with 2–3 neutral options for decision-makers (for example “prioritise Scenario X but request further analysis on cost assumptions”, “focus on variants of Scenario Y that raise support without sacrificing too much efficiency”, etc.), without recommending a single course of action.

Please keep the tone neutral, concise and suitable for ministers and senior officials, and make sure that all numerical results (support, BCR, net benefit, lives saved) are clearly reported in the memo.`;
  }

  function updateAiPrompt(selectedScenario = null) {
    const modeSingle = $("#prompt-mode-single").checked;
    const promptBox = $("#ai-prompt");

    if (modeSingle) {
      const sc =
        selectedScenario ||
        (state.scenarios.length ? state.scenarios[state.scenarios.length - 1] : buildScenarioFromState());
      promptBox.value = buildSingleScenarioPrompt(sc);
    } else {
      let scenarios = [];
      const pinnedScs = state.scenarios.filter((s) => state.pinnedIds.includes(s.id));
      if (pinnedScs.length >= 2) scenarios = pinnedScs;
      else if (state.scenarios.length >= 2) scenarios = state.scenarios.slice(-3);
      else scenarios = [buildScenarioFromState()];

      if (scenarios.length < 2) {
        $("#prompt-mode-note").textContent =
          "Comparative policy memos require at least two saved scenarios. At present, the tool will fall back to a single-scenario brief.";
        promptBox.value = buildSingleScenarioPrompt(scenarios[0]);
      } else {
        $("#prompt-mode-note").textContent =
          "Comparative policy memos use the saved (or pinned) scenarios listed below. Ensure at least two scenarios are saved.";
        promptBox.value = buildComparativePrompt(scenarios);
      }
    }
  }

  function initAiPrompts() {
    $("#prompt-mode-single").addEventListener("change", () => updateAiPrompt());
    $("#prompt-mode-comparative").addEventListener("change", () => updateAiPrompt());

    $("#btn-copy-ai-prompt").addEventListener("click", async () => {
      const text = $("#ai-prompt").value;
      try {
        await navigator.clipboard.writeText(text);
        showToast("AI prompt copied", "success");
      } catch {
        showToast("Could not copy AI prompt", "error");
      }
    });

    $("#btn-open-ai").addEventListener("click", () => {
      window.open("https://chatgpt.com/", "_blank", "noopener");
    });
  }

  // -----------------------------
  // Exports
  // -----------------------------

  function scenariosToCSV() {
    const header = [
      "id",
      "createdAt",
      "country",
      "outbreak",
      "scope",
      "exemptions",
      "coverage",
      "livesPer100k",
      "population",
      "horizon",
      "currencyLabel",
      "vslMetric",
      "vsl",
      "benefitMonetary",
      "costTotal",
      "netBenefit",
      "bcr",
      "supportPct",
      "livesTotal",
      "hosp",
      "icu",
      "workdays",
      "groupsMostAffected",
      "sectorsMostExposed",
      "equityConcerns",
    ];

    const rows = state.scenarios.map((sc) => {
      const cfg = sc.config;
      const res = sc.results;
      const settings = sc.settings;
      const d = sc.distribution;
      return [
        sc.id,
        sc.createdAt,
        cfg.country,
        cfg.outbreak,
        cfg.scope,
        cfg.exemptions,
        cfg.coverage,
        cfg.livesPer100k,
        settings.population,
        settings.horizon,
        settings.currencyLabel,
        settings.vslMetric,
        settings.vsl,
        res.benefitMonetary,
        res.costTotal,
        res.netBenefit,
        res.bcr === null ? "" : res.bcr,
        res.supportPct,
        res.livesTotal,
        res.hosp,
        res.icu,
        res.workdays,
        d.groups,
        d.sectors,
        d.equityConcerns,
      ];
    });

    const all = [header, ...rows];
    return all
      .map((row) =>
        row
          .map((cell) => {
            if (cell === null || cell === undefined) return "";
            const str = String(cell);
            if (/[",\n]/.test(str)) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(",")
      )
      .join("\n");
  }

  function downloadFile(filename, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportWordBriefing() {
    if (!state.scenarios.length && !state.currentResults) {
      showToast("No scenarios available to export", "error");
      return;
    }

    const scs = state.scenarios.length
      ? state.scenarios
      : [buildScenarioFromState()];

    const htmlParts = scs
      .map((sc, idx) => {
        const text = buildScenarioBriefing(sc);
        return `<h2>Scenario ${idx + 1}</h2><pre>${text.replace(
          /</g,
          "&lt;"
        )}</pre>`;
      })
      .join("<hr/>");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>eMANDEVAL-Future Briefing</title></head><body><h1>eMANDEVAL-Future – Scenario Briefings</h1>${htmlParts}</body></html>`;

    downloadFile("eMANDEVAL_Future_Briefing.doc", "application/msword", html);
  }

  function initExports() {
    $("#btn-export-csv").addEventListener("click", () => {
      if (!state.scenarios.length) {
        showToast("No scenarios to export", "error");
        return;
      }
      const csv = scenariosToCSV();
      downloadFile("eMANDEVAL_Future_scenarios.csv", "text/csv;charset=utf-8", csv);
      showToast("Scenarios exported as CSV", "success");
    });

    $("#btn-export-excel").addEventListener("click", () => {
      if (!state.scenarios.length) {
        showToast("No scenarios to export", "error");
        return;
      }
      const csv = scenariosToCSV();
      downloadFile(
        "eMANDEVAL_Future_scenarios_excel.csv",
        "text/csv;charset=utf-8",
        csv
      );
      showToast("Excel-readable CSV exported", "success");
    });

    $("#btn-export-word").addEventListener("click", () => {
      exportWordBriefing();
    });

    $("#btn-export-pdf").addEventListener("click", () => {
      if (!state.scenarios.length) {
        showToast("No scenarios to export", "error");
        return;
      }
      const csv = scenariosToCSV();
      downloadFile(
        "eMANDEVAL_Future_for_PDF_tools.csv",
        "text/csv;charset=utf-8",
        csv
      );
      showToast("CSV exported for PDF tools", "success");
    });

    $("#btn-clear-storage").addEventListener("click", () => {
      const ok = window.confirm(
        "This will remove all saved scenarios from this browser. This cannot be undone. Continue?"
      );
      if (!ok) return;
      state.scenarios = [];
      state.pinnedIds = [];
      saveScenariosToStorage();
      renderScenariosTable();
      updatePinnedDashboard();
      showToast("All saved scenarios cleared", "success");
    });
  }

  // -----------------------------
  // Copy briefing / AI / etc – already wired above
  // -----------------------------

  // -----------------------------
  // App initialisation
  // -----------------------------

  function init() {
    initTabs();
    initTooltips();
    initPresentationMode();
    initSettings();
    initConfig();
    initCosts();
    initBriefingActions();
    initBriefingTemplateActions();
    initAiPrompts();
    initExports();

    // Load scenarios from storage
    loadScenariosFromStorage();
    renderScenariosTable();
    updatePinnedDashboard();

    // Compute initial results from default config/settings
    computeResults();
    updateResultsUI();
    updateBriefingTemplate();
    updateAiPrompt();

    // Ensure version is shown (if needed)
    console.log(`eMANDEVAL-Future ${APP_VERSION} initialised.`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
