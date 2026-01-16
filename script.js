(function(){
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    config: null,
    costs: null,
    benefits: null,
    scenarios: []
  };

  // Mixed logit (MXL) mean coefficients from MandEval DCE
  // Coefficients are country- and outbreak-specific.
  // Lives-saved term is per 100,000 people.
  const mxlCoefs = {
    AU: {
      mild: {
        ascPolicy: 0.464,
        ascOptout: -0.572,
        scopeAll: -0.319,
        exMedRel: -0.157,
        exMedRelPers: -0.267,
        cov70: 0.171,
        cov90: 0.158,
        lives: 0.072
      },
      severe: {
        ascPolicy: 0.535,
        ascOptout: -0.694,
        scopeAll: 0.190,
        exMedRel: -0.181,
        exMedRelPers: -0.305,
        cov70: 0.371,
        cov90: 0.398,
        lives: 0.079
      }
    },
    IT: {
      mild: {
        ascPolicy: 0.625,
        ascOptout: -0.238,
        scopeAll: -0.276,
        exMedRel: -0.176,
        exMedRelPers: -0.289,
        cov70: 0.185,
        cov90: 0.148,
        lives: 0.039
      },
      severe: {
        ascPolicy: 0.799,
        ascOptout: -0.463,
        scopeAll: 0.174,
        exMedRel: -0.178,
        exMedRelPers: -0.207,
        cov70: 0.305,
        cov90: 0.515,
        lives: 0.045
      }
    },
    FR: {
      mild: {
        ascPolicy: 0.899,
        ascOptout: 0.307,
        scopeAll: -0.160,
        exMedRel: -0.121,
        exMedRelPers: -0.124,
        cov70: 0.232,
        cov90: 0.264,
        lives: 0.049
      },
      severe: {
        ascPolicy: 0.884,
        ascOptout: 0.083,
        scopeAll: -0.019,
        exMedRel: -0.192,
        exMedRelPers: -0.247,
        cov70: 0.267,
        cov90: 0.398,
        lives: 0.052
      }
    }
  };

  /**
   * Compute model-based public support (%) for the current configuration
   * using the MXL mean coefficients, treating the problem as a binary
   * choice between "mandate as configured" and "no mandate".
   */
  function computeSupportFromMXL(){
    const cfg = state.config;
    const ben = state.benefits;
    if (!cfg || !ben) return null;

    const cc = mxlCoefs[cfg.country];
    if (!cc) return null;
    const frame = cfg.outbreak === 'severe' ? 'severe' : 'mild';
    const cf = cc[frame];
    if (!cf) return null;

    // Attribute coding relative to MandEval DCE structure
    const scopeAll = cfg.scope === 'all' ? 1 : 0;

    let exMedRel = 0;
    let exMedRelPers = 0;
    if (cfg.exemptions === 'medrel') {
      exMedRel = 1;
    } else if (cfg.exemptions === 'medrelpers') {
      exMedRelPers = 1;
    }

    let cov70 = 0;
    let cov90 = 0;
    if (cfg.coverage === 70) {
      cov70 = 1;
    } else if (cfg.coverage === 90) {
      cov90 = 1;
    }
    const lives = ben.livesPer100k || 0;

    // Utility of mandate vs no mandate
    const U_mand = cf.ascPolicy
      + cf.scopeAll * scopeAll
      + cf.exMedRel * exMedRel
      + cf.exMedRelPers * exMedRelPers
      + cf.cov70 * cov70
      + cf.cov90 * cov90
      + cf.lives * lives;

    const U_no = cf.ascOptout;

    const expMand = Math.exp(Math.max(Math.min(U_mand, 40), -40));
    const expNo = Math.exp(Math.max(Math.min(U_no, 40), -40));

    const pMand = expMand / (expMand + expNo);
    if (!isFinite(pMand)) return null;
    return pMand * 100;
  }

  function formatMoney(value){
    if (value == null || isNaN(value)) return '–';
    const v = Number(value);
    if (Math.abs(v) >= 1_000_000_000) {
      return (v/1_000_000_000).toFixed(2) + ' B';
    }
    if (Math.abs(v) >= 1_000_000) {
      return (v/1_000_000).toFixed(2) + ' M';
    }
    if (Math.abs(v) >= 1_000) {
      return (v/1_000).toFixed(2) + ' K';
    }
    return v.toFixed(0);
  }

  function formatPercent(value){
    if (value == null || isNaN(value)) return '–';
    return value.toFixed(0) + '%';
  }

  function showToast(message, type){
    const container = $('#toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    if (type === 'success') toast.classList.add('toast-success');
    else if (type === 'warning') toast.classList.add('toast-warning');
    else if (type === 'error') toast.classList.add('toast-error');
    else toast.classList.add('toast-warning');

    const msg = document.createElement('div');
    msg.className = 'toast-message';
    msg.textContent = message;

    toast.appendChild(msg);
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => container.removeChild(toast), 300);
    }, 2800);
  }

  function switchTab(tabId){
    $$('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === tabId);
    });
    $$('.tab-link').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });
  }

  function countryLabel(code){
    if (code === 'AU') return 'Australia';
    if (code === 'FR') return 'France';
    if (code === 'IT') return 'Italy';
    return code;
  }

  function outbreakLabel(code){
    if (code === 'mild') return 'Mild outbreak';
    if (code === 'severe') return 'Severe outbreak';
    return code;
  }

  function scopeLabel(code){
    if (code === 'highrisk') return 'High-risk only';
    if (code === 'all') return 'All occupations and public spaces';
    return code;
  }

  function exemptionsLabel(code){
    if (code === 'medical') return 'Medical only';
    if (code === 'medrel') return 'Medical + religious';
    if (code === 'medrelpers') return 'Medical + religious + personal';
    return code;
  }

  function defaultScenarioLabel(cfg){
    return [
      countryLabel(cfg.country),
      outbreakLabel(cfg.outbreak).toLowerCase(),
      scopeLabel(cfg.scope).toLowerCase(),
      exemptionsLabel(cfg.exemptions).toLowerCase(),
      `${cfg.coverage}% threshold`
    ].join(' – ');
  }

  // CONFIGURATION

  function applyConfig(){
    const country = $('#cfg-country').value;
    const outbreak = $('#cfg-outbreak').value;
    const scope = $('#cfg-scope').value;
    const exemptions = $('#cfg-exemptions').value;
    const coverage = parseFloat($('#cfg-coverage').value || '0');
    const popMillions = parseFloat($('#cfg-pop').value || '0');
    const label = ($('#cfg-label').value || '').trim();

    if (!country || !outbreak || !scope || !exemptions || !coverage || !popMillions){
      showToast('Please complete all configuration fields before applying.', 'warning');
      return;
    }

    state.config = {
      country,
      outbreak,
      scope,
      exemptions,
      coverage,
      popMillions,
      label
    };

    updateConfigSummary();
    updateDerivedAndBriefing();
    showToast('Configuration applied.', 'success');
  }

  function updateConfigSummary(){
    const empty = $('#config-summary-empty');
    const panel = $('#config-summary');
    if (!state.config){
      if (empty) empty.classList.remove('hidden');
      if (panel) panel.classList.add('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    if (panel) panel.classList.remove('hidden');

    $('#summary-country').textContent = countryLabel(state.config.country);
    $('#summary-outbreak').textContent = outbreakLabel(state.config.outbreak);
    $('#summary-scope').textContent = scopeLabel(state.config.scope);
    $('#summary-exemptions').textContent = exemptionsLabel(state.config.exemptions);
    $('#summary-coverage').textContent = `${state.config.coverage}%`;
    $('#summary-pop').textContent = `${state.config.popMillions.toFixed(1)} M`;
  }

  // COSTS

  function applyCosts(){
    if (!state.config){
      showToast('Apply a configuration first.', 'warning');
      switchTab('configTab');
      return;
    }
    const admin = parseFloat($('#cost-admin').value || '0');
    const comm = parseFloat($('#cost-comm').value || '0');
    const enforce = parseFloat($('#cost-enforce').value || '0');
    const comp = parseFloat($('#cost-comp').value || '0');
    const notes = ($('#cost-notes').value || '').trim();
    const total = admin + comm + enforce + comp;

    state.costs = { admin, comm, enforce, comp, total, notes };
    updateCostsSummary();
    updateDerivedAndBriefing();
    showToast('Costs applied.', 'success');
  }

  function updateCostsSummary(){
    const empty = $('#costs-summary-empty');
    const panel = $('#costs-summary');

    if (!state.costs){
      if (empty) empty.classList.remove('hidden');
      if (panel) panel.classList.add('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    if (panel) panel.classList.remove('hidden');

    $('#costs-admin').textContent = formatMoney(state.costs.admin);
    $('#costs-comm').textContent = formatMoney(state.costs.comm);
    $('#costs-enforce').textContent = formatMoney(state.costs.enforce);
    $('#costs-comp').textContent = formatMoney(state.costs.comp);
    $('#costs-total').textContent = formatMoney(state.costs.total);
  }

  // BENEFITS AND SUPPORT

  function applyBenefits(){
    if (!state.config){
      showToast('Apply a configuration first.', 'warning');
      switchTab('configTab');
      return;
    }
    const livesPer100k = parseFloat($('#benefit-lives').value || '0');
    const valuePerLife = parseFloat($('#benefit-value-per-life').value || '0');
    const notes = ($('#benefit-notes').value || '').trim();

    const pop = state.config.popMillions * 1_000_000;
    const livesTotal = livesPer100k * (pop / 100_000);
    const monetary = livesTotal * valuePerLife;

    state.benefits = { livesPer100k, valuePerLife, livesTotal, monetary, notes, support: null };

    const modelSupport = computeSupportFromMXL();
    if (modelSupport != null){
      state.benefits.support = modelSupport;
      const supportInput = $('#benefit-support');
      if (supportInput){
        supportInput.value = modelSupport.toFixed(1);
      }
    }

    updateBenefitsSummary();
    updateDerivedAndBriefing();
    showToast('Benefits applied.', 'success');
  }

  function updateBenefitsSummary(){
    const empty = $('#benefits-summary-empty');
    const panel = $('#benefits-summary');

    if (!state.benefits){
      if (empty) empty.classList.remove('hidden');
      if (panel) panel.classList.add('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    if (panel) panel.classList.remove('hidden');

    $('#benefits-lives-per-100k').textContent =
      isNaN(state.benefits.livesPer100k) ? '–' : state.benefits.livesPer100k.toFixed(1);
    $('#benefits-lives-total').textContent =
      isNaN(state.benefits.livesTotal) ? '–' : state.benefits.livesTotal.toFixed(0);
    $('#benefits-monetary').textContent = formatMoney(state.benefits.monetary);

    const s = state.benefits.support;
    $('#benefits-support').textContent = (s == null || isNaN(s)) ? '–' : formatPercent(s);
  }

  // BCR AND HEADLINE

  function computeBCR(){
    if (!state.costs || !state.benefits) return null;
    if (!state.costs.total || state.costs.total <= 0) return null;
    return state.benefits.monetary / state.costs.total;
  }

  function updateDerivedAndBriefing(){
    const headline = $('#headline-recommendation');
    const briefing = $('#briefing-text');

    if (!headline || !briefing){
      return;
    }

    if (!state.config){
      headline.innerHTML = '<p class="placeholder">No assessment yet. Apply a configuration and benefits.</p>';
      briefing.value = '';
      return;
    }

    const bcr = computeBCR();
    const cfg = state.config;
    const costs = state.costs;
    const ben = state.benefits;

    const parts = [];
    parts.push(
      `${countryLabel(cfg.country)} – ${outbreakLabel(cfg.outbreak)}: ` +
      `${scopeLabel(cfg.scope).toLowerCase()} with ${exemptionsLabel(cfg.exemptions).toLowerCase()} ` +
      `and a ${cfg.coverage}% coverage threshold, applied to about ${cfg.popMillions.toFixed(1)} million people.`
    );

    if (costs){
      parts.push(
        `Estimated total programme cost is about ${formatMoney(costs.total)} in direct ` +
        `administration, communication, enforcement and compensation.`
      );
    }

    if (ben){
      parts.push(
        `Under current assumptions, the mandate is expected to avoid around ` +
        `${ben.livesTotal.toFixed(0)} deaths over the period considered ` +
        `(about ${ben.livesPer100k.toFixed(1)} lives saved per 100,000 people), ` +
        `with a monetary benefit of roughly ${formatMoney(ben.monetary)}.`
      );

      if (ben.support != null && !isNaN(ben.support)){
        parts.push(
          `Model-based public support for this mandate design is approximately ` +
          `${formatPercent(ben.support)}, based on the MandEval mixed logit estimates.`
        );
      }
    }

    if (bcr != null){
      parts.push(
        `This implies a benefit–cost ratio (BCR) of about ${bcr.toFixed(2)}.`
      );
    }

    const bcrText = (bcr == null)
      ? 'Insufficient information to compute BCR.'
      : (bcr >= 1.5
        ? 'Strong net benefit under current assumptions.'
        : (bcr >= 1.0
          ? 'Modest net benefit; sensitive to assumptions.'
          : 'Net benefits are uncertain or low under current assumptions.'));

    let supportText = '';
    if (state.benefits && state.benefits.support != null && !isNaN(state.benefits.support)){
      const s = state.benefits.support;
      if (s >= 70){
        supportText = 'Public support is expected to be relatively high.';
      } else if (s >= 50){
        supportText = 'Public support is expected to be moderate and potentially contested.';
      } else {
        supportText = 'Public support is expected to be limited; careful risk communication is needed.';
      }
    }

    headline.innerHTML =
      '<p>' + bcrText + '</p>' +
      (supportText ? ('<p>' + supportText + '</p>') : '');

    briefing.value = parts.join(' ');
  }

  // SCENARIOS

  function feasibilityFlag(support){
    if (support == null || isNaN(support)) return 'Unknown';
    if (support >= 70) return 'Favourable';
    if (support >= 50) return 'Mixed';
    return 'Challenging';
  }

  function saveScenario(){
    if (!state.config){
      showToast('Apply configuration before saving a scenario.', 'warning');
      switchTab('configTab');
      return;
    }

    // If costs or benefits have not yet been applied, try to apply them
    if (!state.costs){
      applyCosts();
    }
    if (!state.benefits){
      applyBenefits();
    }

    if (!state.costs || !state.benefits){
      showToast('Please review costs and benefits – some required values are still missing.', 'warning');
      return;
    }

    const bcr = computeBCR();
    const s = {
      id: Date.now(),
      label: state.config.label || defaultScenarioLabel(state.config),
      country: state.config.country,
      outbreak: state.config.outbreak,
      scope: state.config.scope,
      exemptions: state.config.exemptions,
      coverage: state.config.coverage,
      popMillions: state.config.popMillions,
      totalCost: state.costs.total,
      totalBenefit: state.benefits.monetary,
      support: state.benefits.support,
      bcr: bcr
    };
    state.scenarios.push(s);
    rebuildScenariosTable();
    rebuildResultsTable(state.scenarios);
    showToast('Scenario saved.', 'success');
  }

  function rebuildScenariosTable(){
    const tbody = $('#scenarios-table-body');
    const emptyRow = $('#scenarios-empty-row');
    if (!tbody) return;

    if (!state.scenarios.length){
      if (emptyRow) emptyRow.style.display = '';
      tbody.querySelectorAll('tr').forEach(tr => {
        if (tr !== emptyRow) tr.remove();
      });
      return;
    }

    if (emptyRow) emptyRow.style.display = 'none';
    tbody.querySelectorAll('tr').forEach(tr => {
      if (tr !== emptyRow) tr.remove();
    });

    state.scenarios.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.label}</td>
        <td>${countryLabel(s.country)}</td>
        <td>${outbreakLabel(s.outbreak)}</td>
        <td>${scopeLabel(s.scope)}</td>
        <td>${exemptionsLabel(s.exemptions)}</td>
        <td>${s.coverage}%</td>
        <td>${formatMoney(s.totalCost)}</td>
        <td>${formatMoney(s.totalBenefit)}</td>
        <td>${s.bcr == null ? '–' : s.bcr.toFixed(2)}</td>
        <td>${s.support == null ? '–' : formatPercent(s.support)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function rebuildResultsTable(scenarios){
    const tbody = $('#results-table-body');
    const emptyRow = $('#results-empty-row');
    if (!tbody) return;

    if (!scenarios || !scenarios.length){
      if (emptyRow) emptyRow.style.display = '';
      tbody.querySelectorAll('tr').forEach(tr => {
        if (tr !== emptyRow) tr.remove();
      });
      return;
    }

    if (emptyRow) emptyRow.style.display = 'none';
    tbody.querySelectorAll('tr').forEach(tr => {
      if (tr !== emptyRow) tr.remove();
    });

    const sorted = [...scenarios].sort((a, b) => {
      const aBcr = a.bcr ?? -Infinity;
      const bBcr = b.bcr ?? -Infinity;
      if (bBcr !== aBcr) return bBcr - aBcr;
      const aSup = a.support ?? -Infinity;
      const bSup = b.support ?? -Infinity;
      return bSup - aSup;
    });

    sorted.forEach((s, idx) => {
      const tr = document.createElement('tr');
      const feas = feasibilityFlag(s.support);
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${s.label}</td>
        <td>${countryLabel(s.country)}</td>
        <td>${outbreakLabel(s.outbreak)}</td>
        <td>${scopeLabel(s.scope)}</td>
        <td>${exemptionsLabel(s.exemptions)}</td>
        <td>${s.coverage}%</td>
        <td>${formatMoney(s.totalCost)}</td>
        <td>${formatMoney(s.totalBenefit)}</td>
        <td>${s.bcr == null ? '–' : s.bcr.toFixed(2)}</td>
        <td>${s.support == null ? '–' : formatPercent(s.support)}</td>
        <td>${feas}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // EXPORTS

  function exportScenariosCSV(){
    if (!state.scenarios.length){
      showToast('No scenarios to export.', 'warning');
      return;
    }
    const rows = [
      [
        'Label','Country','Outbreak','Scope','Exemptions','Coverage',
        'Population (M)','Total cost','Total benefit','BCR','Support'
      ]
    ];
    state.scenarios.forEach(s => {
      rows.push([
        s.label,
        countryLabel(s.country),
        outbreakLabel(s.outbreak),
        scopeLabel(s.scope),
        exemptionsLabel(s.exemptions),
        s.coverage,
        s.popMillions,
        s.totalCost,
        s.totalBenefit,
        s.bcr == null ? '' : s.bcr.toFixed(3),
        s.support == null ? '' : s.support.toFixed(1)
      ]);
    });

    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'mandeval_scenarios.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Scenarios exported as CSV.', 'success');
  }

  function exportSummaryPDF(){
    if (!state.scenarios.length){
      showToast('No scenarios to export.', 'warning');
      return;
    }
    if (typeof window.jspdf === 'undefined' && typeof window.jspdf === 'undefined'){
      showToast('PDF library not loaded.', 'warning');
      return;
    }
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text('MANDEVAL – Top policy options', 10, 12);

    let y = 20;
    const sorted = [...state.scenarios].sort((a, b) => {
      const aBcr = a.bcr ?? -Infinity;
      const bBcr = b.bcr ?? -Infinity;
      if (bBcr !== aBcr) return bBcr - aBcr;
      const aSup = a.support ?? -Infinity;
      const bSup = b.support ?? -Infinity;
      return bSup - aSup;
    }).slice(0, 10);

    sorted.forEach((s, idx) => {
      if (y > 270){
        doc.addPage();
        y = 15;
      }
      const line = `${idx + 1}. ${s.label} | ${countryLabel(s.country)}, ${outbreakLabel(s.outbreak)}, ` +
        `${scopeLabel(s.scope)}, ${exemptionsLabel(s.exemptions)}, ${s.coverage}% coverage | ` +
        `Cost ${formatMoney(s.totalCost)}, Benefit ${formatMoney(s.totalBenefit)}, ` +
        `BCR ${s.bcr == null ? '–' : s.bcr.toFixed(2)}, Support ${s.support == null ? '–' : s.support.toFixed(1) + '%'}`;
      doc.text(line, 10, y);
      y += 7;
    });

    doc.save('mandeval_top_policy_options.pdf');
    showToast('Summary PDF exported.', 'success');
  }

  // AI BRIEFINGS

  function buildAIPrompt(){
    if (!state.config || !state.costs || !state.benefits){
      showToast('Apply configuration, costs and benefits before generating a prompt.', 'warning');
      return '';
    }
    const cfg = state.config;
    const costs = state.costs;
    const ben = state.benefits;
    const bcr = computeBCR();
    const support = ben.support;

    const lines = [];
    lines.push('You are drafting a short, neutral policy briefing on a COVID-19 vaccine mandate.');
    lines.push('');
    lines.push('Context and setting:');
    lines.push(`- Country: ${countryLabel(cfg.country)}`);
    lines.push(`- Outbreak scenario: ${outbreakLabel(cfg.outbreak)}`);
    lines.push('');
    lines.push('Mandate design:');
    lines.push(`- Scope: ${scopeLabel(cfg.scope)}`);
    lines.push(`- Exemptions: ${exemptionsLabel(cfg.exemptions)}`);
    lines.push(`- Coverage threshold: ${cfg.coverage}%`);
    lines.push(`- Population directly exposed: ${cfg.popMillions.toFixed(1)} million people.`);
    lines.push('');
    lines.push('Costs (programme perspective):');
    lines.push(`- Government administration and IT: ${formatMoney(costs.admin)}`);
    lines.push(`- Communication and outreach: ${formatMoney(costs.comm)}`);
    lines.push(`- Enforcement and compliance: ${formatMoney(costs.enforce)}`);
    lines.push(`- Compensation and support: ${formatMoney(costs.comp)}`);
    lines.push(`- Total cost: ${formatMoney(costs.total)}`);
    lines.push('');
    lines.push('Benefits:');
    lines.push(`- Expected lives saved per 100,000 people: ${ben.livesPer100k.toFixed(1)}`);
    lines.push(`- Approximate total lives saved: ${ben.livesTotal.toFixed(0)}`);
    lines.push(`- Monetary value per life saved: ${formatMoney(ben.valuePerLife)}`);
    lines.push(`- Total monetary benefit: ${formatMoney(ben.monetary)}`);
    if (bcr != null){
      lines.push(`- Benefit–cost ratio (BCR): ${bcr.toFixed(2)}`);
    }
    if (support != null && !isNaN(support)){
      lines.push(`- Model-based public support: about ${support.toFixed(1)}% (MandEval mixed logit).`);
    }
    lines.push('');
    lines.push('Task:');
    lines.push(
      'Write a concise briefing (1–2 pages) for senior decision makers that summarises ' +
      'the rationale, expected health impact, costs, social acceptability and key ' +
      'trade-offs of this mandate option. Use clear, non-technical language, avoid ' +
      'jargon, and present uncertainties and limitations transparently.'
    );

    return lines.join('\n');
  }

  function copyToClipboard(text){
    if (!navigator.clipboard){
      showToast('Clipboard not available in this browser.', 'warning');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast('Text copied to clipboard.', 'success');
    }).catch(() => {
      showToast('Unable to copy to clipboard.', 'error');
    });
  }

  // INIT

  function initTabs(){
    $$('.tab-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        if (tabId) switchTab(tabId);
      });
    });
  }

  function initButtons(){
    const applyConfigBtn = $('#btn-apply-config');
    if (applyConfigBtn){
      applyConfigBtn.addEventListener('click', applyConfig);
    }
    const viewSummaryBtn = $('#btn-view-summary');
    if (viewSummaryBtn){
      viewSummaryBtn.addEventListener('click', () => {
        if (!state.config){
          showToast('Apply a configuration first.', 'warning');
          return;
        }
        switchTab('resultsTab');
      });
    }

    const applyCostsBtn = $('#btn-apply-costs');
    if (applyCostsBtn){
      applyCostsBtn.addEventListener('click', applyCosts);
    }

    const applyBenefitsBtn = $('#btn-apply-benefits');
    if (applyBenefitsBtn){
      applyBenefitsBtn.addEventListener('click', applyBenefits);
    }

    const saveScenarioBtn = $('#btn-save-scenario');
    if (saveScenarioBtn){
      saveScenarioBtn.addEventListener('click', saveScenario);
    }

    const clearScenariosBtn = $('#btn-clear-scenarios');
    if (clearScenariosBtn){
      clearScenariosBtn.addEventListener('click', () => {
        state.scenarios = [];
        rebuildScenariosTable();
        rebuildResultsTable(state.scenarios);
        showToast('All scenarios cleared.', 'success');
      });
    }

    const exportCsvBtn = $('#btn-export-csv');
    if (exportCsvBtn){
      exportCsvBtn.addEventListener('click', exportScenariosCSV);
    }

    const exportPdfBtn = $('#btn-export-pdf');
    if (exportPdfBtn){
      exportPdfBtn.addEventListener('click', exportSummaryPDF);
    }

    const genCopilotBtn = $('#btn-generate-copilot');
    if (genCopilotBtn){
      genCopilotBtn.addEventListener('click', () => {
        const prompt = buildAIPrompt();
        if (!prompt) return;
        const box = $('#ai-briefing-text');
        box.value = prompt;
        copyToClipboard(prompt);
        window.open('https://copilot.microsoft.com/', '_blank');
        showToast('Copilot prompt generated and copied.', 'success');
      });
    }

    const genChatgptBtn = $('#btn-generate-chatgpt');
    if (genChatgptBtn){
      genChatgptBtn.addEventListener('click', () => {
        const prompt = buildAIPrompt();
        if (!prompt) return;
        const box = $('#ai-briefing-text');
        box.value = prompt;
        copyToClipboard(prompt);
        showToast('ChatGPT prompt generated and copied.', 'success');
      });
    }

    const copyBriefingBtn = $('#btn-copy-briefing');
    if (copyBriefingBtn){
      copyBriefingBtn.addEventListener('click', () => {
        const text = $('#ai-briefing-text').value || '';
        if (!text.trim()){
          showToast('No prompt to copy yet.', 'warning');
          return;
        }
        copyToClipboard(text);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initButtons();
  });

})();
