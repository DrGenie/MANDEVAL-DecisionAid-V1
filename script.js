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

  function formatMoney(value){
    if (value == null || isNaN(value)) return '–';
    const v = Number(value);
    if (!isFinite(v)) return '–';
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

    const div = document.createElement('div');
    div.className = 'toast';

    if (type === 'success') div.classList.add('toast-success');
    else if (type === 'warning') div.classList.add('toast-warning');
    else if (type === 'error') div.classList.add('toast-error');

    const span = document.createElement('span');
    span.className = 'toast-message';
    span.textContent = message;

    const btn = document.createElement('button');
    btn.className = 'toast-close';
    btn.type = 'button';
    btn.textContent = '×';
    btn.addEventListener('click', () => {
      container.removeChild(div);
    });

    div.appendChild(span);
    div.appendChild(btn);
    container.appendChild(div);

    setTimeout(() => {
      if (container.contains(div)) {
        container.removeChild(div);
      }
    }, 4500);
  }

  function switchTab(tabId){
    $$('.tab-link').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    $$('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === tabId);
    });
  }

  function initTabs(){
    $$('.tab-link').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });
  }

  function readConfigForm(){
    const country = $('#cfg-country').value;
    const outbreak = $('#cfg-outbreak').value;
    const scope = $('#cfg-scope').value;
    const exemptions = $('#cfg-exemptions').value;
    const coverage = parseFloat($('#cfg-coverage').value || '0');
    const popMillions = parseFloat($('#cfg-pop').value || '0');
    const label = ($('#cfg-notes').value || '').trim();

    return { country, outbreak, scope, exemptions, coverage, popMillions, label };
  }

  function applyConfig(){
    const cfg = readConfigForm();
    if (!cfg.country){
      showToast('Please select a country before applying the configuration.', 'warning');
      switchTab('configTab');
      return;
    }
    if (!cfg.popMillions || cfg.popMillions <= 0){
      showToast('Please set the population covered (Step 1).', 'warning');
      switchTab('configTab');
      return;
    }
    state.config = cfg;
    updateConfigSummary();
    updateDerivedAndBriefing();
    showToast('Configuration applied.', 'success');
  }

  function updateConfigSummary(){
    const empty = $('#cfg-summary-empty');
    const panel = $('#cfg-summary');
    if (!state.config){
      empty.hidden = false;
      panel.hidden = true;
      return;
    }
    const c = state.config;
    empty.hidden = true;
    panel.hidden = false;
    $('#cfg-summary-country').textContent = countryLabel(c.country);
    $('#cfg-summary-outbreak').textContent = c.outbreak === 'severe' ? 'Severe outbreak' : 'Mild outbreak';
    $('#cfg-summary-scope').textContent = scopeLabel(c.scope);
    $('#cfg-summary-exemptions').textContent = exemptionsLabel(c.exemptions);
    $('#cfg-summary-coverage').textContent = (c.coverage * 100).toFixed(0) + '%';
    $('#cfg-summary-pop').textContent = c.popMillions.toFixed(1) + ' million';
  }

  function countryLabel(code){
    if (code === 'AU') return 'Australia';
    if (code === 'FR') return 'France';
    if (code === 'IT') return 'Italy';
    return code || 'Not set';
  }

  function scopeLabel(code){
    if (code === 'all') return 'All occupations and public spaces';
    return 'High-risk occupations only';
  }

  function exemptionsLabel(code){
    if (code === 'medrel') return 'Medical + religious';
    if (code === 'medrelpers') return 'Medical + religious + personal';
    return 'Medical only';
  }

  function applyCosts(){
    if (!state.config){
      showToast('Apply a configuration first (Step 1).', 'warning');
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
      empty.hidden = false;
      panel.hidden = true;
      return;
    }
    empty.hidden = true;
    panel.hidden = false;
    $('#costs-total').textContent = formatMoney(state.costs.total);
    $('#costs-admin').textContent = formatMoney(state.costs.admin);
    $('#costs-comm').textContent = formatMoney(state.costs.comm);
    $('#costs-enforce').textContent = formatMoney(state.costs.enforce);
    $('#costs-comp').textContent = formatMoney(state.costs.comp);
  }

  function applyBenefits(){
    if (!state.config){
      showToast('Apply a configuration first (Step 1).', 'warning');
      switchTab('configTab');
      return;
    }
    const livesPer100k = parseFloat($('#benefit-lives').value || '0');
    const valuePerLife = parseFloat($('#benefit-value-per-life').value || '0');
    const support = parseFloat($('#benefit-support').value || '0');
    const notes = ($('#benefit-notes').value || '').trim();

    const pop = state.config.popMillions * 1_000_000;
    const livesTotal = livesPer100k * (pop / 100_000);
    const monetary = livesTotal * valuePerLife;

    state.benefits = { livesPer100k, valuePerLife, support, livesTotal, monetary, notes };
    updateBenefitsSummary();
    updateDerivedAndBriefing();
    showToast('Benefits applied.', 'success');
  }

  function updateBenefitsSummary(){
    const empty = $('#benefits-summary-empty');
    const panel = $('#benefits-summary');
    if (!state.benefits || !state.config){
      empty.hidden = false;
      panel.hidden = true;
      return;
    }
    empty.hidden = true;
    panel.hidden = false;
    $('#benefits-lives').textContent = state.benefits.livesPer100k.toFixed(2);
    $('#benefits-lives-total').textContent = state.benefits.livesTotal.toFixed(0);
    $('#benefits-monetary').textContent = formatMoney(state.benefits.monetary);
    $('#benefits-support').textContent = formatPercent(state.benefits.support);
  }

  function computeBCR(){
    if (!state.costs || !state.benefits) return null;
    if (!state.costs.total || state.costs.total <= 0) return null;
    return state.benefits.monetary / state.costs.total;
  }

  function updateDerivedAndBriefing(){
    const bcr = computeBCR();
    if (!state.config) return;

    const c = state.config;
    const costs = state.costs;
    const ben = state.benefits;

    const parts = [];
    parts.push(`Country: ${countryLabel(c.country)}; outbreak scenario: ${c.outbreak === 'severe' ? 'severe' : 'mild'}.`);
    parts.push(`Mandate scope: ${scopeLabel(c.scope)}, exemptions: ${exemptionsLabel(c.exemptions)}, target coverage ${ (c.coverage * 100).toFixed(0) }% of about ${c.popMillions.toFixed(1)} million people.`);
    if (costs){
      parts.push(`Estimated total implementation cost is about ${formatMoney(costs.total)} (administration ${formatMoney(costs.admin)}, communication ${formatMoney(costs.comm)}, enforcement ${formatMoney(costs.enforce)}, compensation and support ${formatMoney(costs.comp)}).`);
    }
    if (ben){
      parts.push(`Under current assumptions, the mandate is expected to save about ${ben.livesTotal.toFixed(0)} lives in the covered population ( ${ben.livesPer100k.toFixed(2)} per 100,000 ), valued at roughly ${formatMoney(ben.monetary)} in monetary terms.`);
      parts.push(`Indicative public support is set at ${formatPercent(ben.support)} based on available evidence or judgement.`);
    }
    if (bcr != null){
      parts.push(`This implies a benefit–cost ratio of approximately ${bcr.toFixed(2)} under the current assumptions.`);
    } else {
      parts.push('A benefit–cost ratio cannot yet be calculated because costs or benefits are missing.');
    }

    $('#briefing-text').value = parts.join('\n\n');

    rebuildResultsTable();
  }

  function viewSummary(){
    if (!state.config){
      showToast('Apply a configuration first (Step 1).', 'warning');
      switchTab('configTab');
      return;
    }
    switchTab('resultsTab');
    showToast('Showing results and ranking.', 'success');
  }

  function saveScenario(){
    if (!state.config || !state.costs || !state.benefits){
      showToast('Apply configuration, costs and benefits before saving a scenario.', 'warning');
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
    rebuildResultsTable();
    showToast('Scenario saved for comparison.', 'success');
  }

  function defaultScenarioLabel(cfg){
    return `${countryLabel(cfg.country)}, ${cfg.outbreak === 'severe' ? 'severe' : 'mild'}, ${scopeLabel(cfg.scope)}, ${ (cfg.coverage * 100).toFixed(0) }%`;
  }

  function rebuildScenariosTable(){
    const tbody = $('#scenarios-table tbody');
    tbody.innerHTML = '';
    state.scenarios.forEach((s, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${escapeHtml(s.label)}</td>
        <td>${countryLabel(s.country)}</td>
        <td>${s.outbreak === 'severe' ? 'Severe' : 'Mild'}</td>
        <td>${scopeLabel(s.scope)}</td>
        <td>${exemptionsLabel(s.exemptions)}</td>
        <td>${(s.coverage * 100).toFixed(0)}%</td>
        <td>${formatMoney(s.totalCost)}</td>
        <td>${formatMoney(s.totalBenefit)}</td>
        <td>${s.bcr != null ? s.bcr.toFixed(2) : '–'}</td>
        <td>${formatPercent(s.support)}</td>
        <td><button type="button" data-id="${s.id}" class="btn-ghost btn-remove-scenario">Remove</button></td>
      `;
      tbody.appendChild(tr);
    });

    $$('.btn-remove-scenario').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        state.scenarios = state.scenarios.filter(s => s.id !== id);
        rebuildScenariosTable();
        rebuildResultsTable();
        showToast('Scenario removed.', 'success');
      });
    });
  }

  function rebuildResultsTable(){
    const tbody = $('#results-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!state.scenarios.length) return;
    const sorted = [...state.scenarios].sort((a,b) => {
      const aBCR = a.bcr ?? -Infinity;
      const bBCR = b.bcr ?? -Infinity;
      return bBCR - aBCR;
    });

    sorted.forEach((s, idx) => {
      const tr = document.createElement('tr');
      const bcrClass = s.bcr != null && s.bcr >= 1 ? 'bcr-good' : 'bcr-low';
      const supportClass = s.support >= 60 ? 'support-good' : (s.support >= 40 ? 'support-mid' : 'support-low');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${escapeHtml(s.label)}</td>
        <td>${countryLabel(s.country)}</td>
        <td>${s.outbreak === 'severe' ? 'Severe' : 'Mild'}</td>
        <td>${scopeLabel(s.scope)}</td>
        <td>${(s.coverage * 100).toFixed(0)}%</td>
        <td>${formatMoney(s.totalCost)}</td>
        <td>${formatMoney(s.totalBenefit)}</td>
        <td class="${bcrClass}">${s.bcr != null ? s.bcr.toFixed(2) : '–'}</td>
        <td class="${supportClass}">${formatPercent(s.support)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(str){
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m){
      switch(m){
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return m;
      }
    });
  }

  

  function exportScenariosToExcel(){
    if (!state.scenarios || !state.scenarios.length){
      showToast('There are no saved scenarios to export.', 'warning');
      return;
    }
    if (typeof XLSX === 'undefined'){
      showToast('Excel library not available in this browser session.', 'error');
      return;
    }
    const rows = state.scenarios.map((s, idx) => ({
      Rank: idx + 1,
      Label: s.label,
      Country: countryLabel(s.country),
      Outbreak: s.outbreak === 'severe' ? 'Severe' : 'Mild',
      Scope: scopeLabel(s.scope),
      Coverage: (s.coverage * 100).toFixed(0) + '%',
      Population_millions: s.popMillions,
      Total_cost: s.totalCost,
      Total_benefit: s.totalBenefit,
      BCR: s.bcr,
      Support_percent: s.support
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Scenarios');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mandeval_scenarios.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Excel file downloaded.', 'success');
  }

  function exportSummaryPdf(){
    if (!state.scenarios || !state.scenarios.length){
      showToast('Save at least one scenario before exporting a PDF.', 'warning');
      return;
    }
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined'){
      showToast('PDF export library not available in this browser session.', 'error');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text('Vaccine Mandate Evaluation (MANDEVAL)', 14, 18);
    doc.setFontSize(11);
    doc.text('Summary of saved scenarios', 14, 26);

    const sorted = [...state.scenarios].sort((a,b) => {
      const aBCR = a.bcr ?? -Infinity;
      const bBCR = b.bcr ?? -Infinity;
      return bBCR - aBCR;
    }).slice(0, 5);

    let y = 38;
    sorted.forEach((s, idx) => {
      if (y > 270){
        doc.addPage();
        y = 20;
      }
      doc.setFont(undefined, 'bold');
      doc.text(`${idx + 1}. ${s.label}`, 14, y);
      doc.setFont(undefined, 'normal');
      y += 6;
      doc.text(`Country: ${countryLabel(s.country)}  |  Outbreak: ${s.outbreak === 'severe' ? 'Severe' : 'Mild'}`, 14, y);
      y += 6;
      doc.text(`Scope: ${scopeLabel(s.scope)}  |  Coverage: ${(s.coverage * 100).toFixed(0)}%`, 14, y);
      y += 6;
      doc.text(`Total cost: ${formatMoney(s.totalCost)}  |  Total benefit: ${formatMoney(s.totalBenefit)}`, 14, y);
      y += 6;
      const bcrText = s.bcr != null ? s.bcr.toFixed(2) : 'n/a';
      doc.text(`BCR: ${bcrText}  |  Predicted support: ${formatPercent(s.support)}`, 14, y);
      y += 8;
    });

    doc.save('mandeval_summary.pdf');
    showToast('Technical PDF exported.', 'success');
  }

  function clearStorage(){
    try{
      localStorage.removeItem('mandeval_state');
      state.scenarios = [];
      rebuildScenariosTable();
      rebuildResultsTable();
      showToast('Saved scenarios cleared from this browser.', 'success');
    }catch(e){
      showToast('Unable to clear browser storage.', 'error');
    }
  }

function copyBriefing(){
    const text = $('#briefing-text').value || '';
    if (!text.trim()){
      showToast('There is no briefing text to copy yet.', 'warning');
      return;
    }
    if (!navigator.clipboard){
      showToast('Clipboard access is not available in this browser.', 'error');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast('Briefing text copied to clipboard.', 'success');
    }).catch(() => {
      showToast('Unable to copy briefing text.', 'error');
    });
  }

  function buildAiPrompt(){
    if (!state.config){
      return 'No configuration has been applied yet. Please set a vaccine mandate scenario, including country, outbreak conditions, scope, exemptions, coverage, costs and benefits.';
    }
    const c = state.config;
    const costs = state.costs;
    const ben = state.benefits;
    const bcr = computeBCR();

    const lines = [];
    lines.push('You are assisting a government team that is designing a COVID-19 vaccine mandate in Australia, France or Italy.');
    lines.push('');
    lines.push('Scenario summary (from the MANDEVAL decision aid):');
    lines.push(`- Country: ${countryLabel(c.country)}.`);
    lines.push(`- Outbreak scenario: ${c.outbreak === 'severe' ? 'severe outbreak' : 'mild outbreak / endemic conditions'}.`);
    lines.push(`- Mandate scope: ${scopeLabel(c.scope)}.`);
    lines.push(`- Exemptions: ${exemptionsLabel(c.exemptions)}.`);
    lines.push(`- Target coverage: ${(c.coverage * 100).toFixed(0)}% of about ${c.popMillions.toFixed(1)} million people.`);
    if (costs){
      lines.push(`- Total implementation cost (all items combined): around ${formatMoney(costs.total)} (administration ${formatMoney(costs.admin)}, communication ${formatMoney(costs.comm)}, enforcement ${formatMoney(costs.enforce)}, compensation/support ${formatMoney(costs.comp)}).`);
    }
    if (ben){
      lines.push(`- Expected lives saved: about ${ben.livesTotal.toFixed(0)} in the covered population (${ben.livesPer100k.toFixed(2)} per 100,000).`);
      lines.push(`- Monetary valuation of lives saved (if used): about ${formatMoney(ben.monetary)}.`);
      lines.push(`- Indicative public support: ${formatPercent(ben.support)}.`);
    }
    if (bcr != null){
      lines.push(`- Approximate benefit–cost ratio: ${bcr.toFixed(2)} (benefits divided by total costs).`);
    } else {
      lines.push('- Benefit–cost ratio: cannot be calculated yet because costs or benefits are missing.');
    }
    lines.push('');
    lines.push('Please draft a short, neutral and clear policy briefing that:');
    lines.push('1. Summarises this mandate option in plain language;');
    lines.push('2. Highlights the trade-offs between public health impact, costs and public support;');
    lines.push('3. Flags any key uncertainties or assumptions that should be made explicit; and');
    lines.push('4. Suggests up to three points for ministers or senior officials to consider when comparing this option with alternatives.');

    return lines.join('\n');
  }

  function copyPromptAndOpen(target){
    const prompt = buildAiPrompt();
    if (!navigator.clipboard){
      showToast('Clipboard access is not available in this browser.', 'error');
      return;
    }
    navigator.clipboard.writeText(prompt).then(() => {
      if (target === 'copilot'){
        window.open('https://copilot.microsoft.com/', '_blank');
        showToast('Prompt copied. Copilot opened in a new tab.', 'success');
      } else if (target === 'chatgpt'){
        window.open('https://chat.openai.com/', '_blank');
        showToast('Prompt copied. ChatGPT opened in a new tab.', 'success');
      } else {
        showToast('Prompt copied to clipboard.', 'success');
      }
    }).catch(() => {
      showToast('Unable to copy AI prompt.', 'error');
    });
  }

  function init(){
    initTabs();

    const btnApplyConfig = $('#btn-apply-config');
    const btnViewSummary = $('#btn-view-summary');
    const btnSaveScenario = $('#btn-save-scenario');
    const btnApplyCosts = $('#btn-apply-costs');
    const btnApplyBenefits = $('#btn-apply-benefits');
    const btnCopyBriefing = $('#btn-copy-briefing');
    const btnCopilot = $('#btn-open-copilot');
    const btnChatGPT = $('#btn-open-chatgpt');
    const btnExportExcel = $('#btnExportExcel');
    const btnExportPdf = $('#btnExportPdf');
    const btnClearStorage = $('#btnClearStorage');

    if (btnApplyConfig) btnApplyConfig.addEventListener('click', applyConfig);
    if (btnViewSummary) btnViewSummary.addEventListener('click', viewSummary);
    if (btnSaveScenario) btnSaveScenario.addEventListener('click', saveScenario);
    if (btnApplyCosts) btnApplyCosts.addEventListener('click', applyCosts);
    if (btnApplyBenefits) btnApplyBenefits.addEventListener('click', applyBenefits);
    if (btnCopyBriefing) btnCopyBriefing.addEventListener('click', copyBriefing);
    if (btnCopilot) btnCopilot.addEventListener('click', () => copyPromptAndOpen('copilot'));
    if (btnChatGPT) btnChatGPT.addEventListener('click', () => copyPromptAndOpen('chatgpt'));
    if (btnExportExcel) btnExportExcel.addEventListener('click', exportScenariosToExcel);
    if (btnExportPdf) btnExportPdf.addEventListener('click', exportSummaryPdf);
    if (btnClearStorage) btnClearStorage.addEventListener('click', clearStorage);

    switchTab('introTab');
  }

  document.addEventListener('DOMContentLoaded', init);
})();