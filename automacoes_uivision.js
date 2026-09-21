(function(){
  'use strict';

  const CONFIGS = {
    'SOC - CRIAR CADASTRO': {
      id: 'AUT-001',
      title: 'SOC - CRIAR CADASTRO',
      category: 'SOC / CADASTRO',
      icon: 'fa-user-plus',
      accent: '#818cf8',
      soft: 'rgba(129,140,248,.12)',
      description: 'Criação automatizada de cadastros no SOC a partir de uma lista validada de IDs.',
      macro: 'SOC - CRIAR CADASTRO',
      endpoint: 'soc'
    },
    'VERIFICAR EXAMES': {
      id: 'AUT-002',
      title: 'VERIFICAR EXAMES',
      category: 'SOC / EXAMES',
      icon: 'fa-file-waveform',
      accent: '#06b6d4',
      soft: 'rgba(6,182,212,.12)',
      description: 'Consulta, verificação e associação automatizada de exames ocupacionais no SOC.',
      macro: 'BUSCAR_EXAMES',
      endpoint: 'exames'
    },
    'ATIVAR_FUNCIONARIOS': {
      id: 'AUT-003',
      title: 'ATIVAR FUNCIONÁRIOS',
      category: 'EXECUÇÃO EM LOTE',
      icon: 'fa-user-check',
      accent: '#fbbf24',
      soft: 'rgba(251,191,36,.12)',
      description: 'Atualização de dados e ativação de colaboradores em lote via Bridge local.',
      macro: 'ATIVAR_FUNCIONARIOS',
      endpoint: 'batch'
    }
  };

  const RUNS_KEY = 'uivision_standalone_runs', HISTORY_KEY = 'uivision_run_history';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmt = v => { if (!v) return '—'; try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)); } catch { return '—'; } };
  const time = v => { try { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(v || Date.now())); } catch { return '—'; } };

  function toast(msg, type = 'success') {
    const box = $('toast');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast-item ' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(5px)'; }, 2500);
    setTimeout(() => el.remove(), 2800);
  }
  window.uiToast = toast;

  function storageGet(key, fallback = '') { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
  function readRuns() { try { return JSON.parse(localStorage.getItem(RUNS_KEY) || '{}'); } catch { return {}; } }
  function readHistory() { try { const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
  function writeHistory(v) { storageSet(HISTORY_KEY, JSON.stringify(v.slice(-500))); }
  function writeRunLegacy(macro, when) { const v = readRuns(); v[macro] = when; storageSet(RUNS_KEY, JSON.stringify(v)); }

  function historyFor(macro) {
    const h = readHistory().filter(x => x.macro === macro);
    const legacy = readRuns()[macro];
    if (legacy && !h.length) return [{ id: 'legacy-' + legacy, macro, status: 'success', startedAt: legacy, finishedAt: legacy, durationMs: null, message: 'Registro importado do histórico anterior.', legacy: true }];
    return h.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }

  function addHistory(entry) {
    const h = readHistory();
    h.push(entry);
    writeHistory(h);
    writeRunLegacy(entry.macro, entry.startedAt);
  }

  function allHistory() {
    const h = readHistory();
    const legacy = readRuns();
    Object.entries(legacy).forEach(([macro, when]) => {
      if (!h.some(x => x.macro === macro && new Date(x.startedAt).getTime() === new Date(when).getTime())) {
        h.push({ id: 'legacy-' + macro + '-' + when, macro, status: 'success', startedAt: when, finishedAt: when, durationMs: null, message: 'Registro importado.', legacy: true });
      }
    });
    return h.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }

  function setState(type, label) {
    const el = $('globalState');
    if (el) {
      el.className = 'state ' + (type || 'ready');
      const lbl = el.querySelector('.state-label');
      if (lbl) lbl.textContent = label;
    }
  }

  function iconStatus(status) { return status === 'success' ? 'success' : status === 'error' ? 'error' : 'info'; }

  // =========================================================================
  // RENDERIZADOR DOS RESULTADOS DO SOC (PERSISTENTE NA PÁGINA)
  // =========================================================================
  // =========================================================================
  // RENDERIZADOR DOS RESULTADOS DO SOC COM TABELA COMPARATIVA (FLOW × SOC)
  // =========================================================================
  window.renderSocNaPagina = function(report, runId, dateStr) {
    const section = $('relatorioSocSection');
    const container = $('relatorioSocCards');
    const badgesBox = $('relatorioSocBadges');
    const meta = $('relatorioSocMeta');
    if (!section || !container || !Array.isArray(report)) return;

    // Desduplica registros por colaborador
    const mapaUnico = new Map();
    report.forEach(item => {
      const chave = String(item.id_colaborador || item.id || '').trim();
      if (!chave) return;
      mapaUnico.set(chave, item);
    });
    const dadosFiltrados = Array.from(mapaUnico.values());

    const totalOk = dadosFiltrados.filter(r => !(r.dados?.erro || r.erro)).length;
    const totalFalhas = dadosFiltrados.filter(r => (r.dados?.erro || r.erro)).length;

    if (meta) meta.textContent = `Processamento em ${dateStr || new Date().toLocaleString('pt-BR')} (Execução: ${runId || 'Local'})`;

    if (badgesBox) {
      badgesBox.innerHTML = `
        <span style="padding:5px 10px;border-radius:20px;font-size:10px;font-weight:900;background:rgba(16,185,129,0.15);color:#6ee7b7;border:1px solid rgba(16,185,129,0.25);">${totalOk} CONCLUÍDO(S)</span>
        ${totalFalhas > 0 ? `<span style="padding:5px 10px;border-radius:20px;font-size:10px;font-weight:900;background:rgba(244,63,94,0.15);color:#fda4af;border:1px solid rgba(244,63,94,0.25);">${totalFalhas} FALHA(S)</span>` : ''}
      `;
    }

    // Funções auxiliares de normalização
    const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '').replace(/[.\-\/(),]/g, '');
    const normSexo = value => {
      const v = norm(value);
      if (['F', 'FEM', 'FEMININO'].includes(v)) return 'F';
      if (['M', 'MAS', 'MASCULINO'].includes(v)) return 'M';
      return v;
    };
    const show = value => {
      const str = String(value ?? '').trim();
      return str ? esc(str) : '<span style="color:#64748b">N/D</span>';
    };

    // Campos comparados entre Flow e SOC
    const compareFields = [
      { key: 'nome', label: 'NOME', flow: d => d.nome, soc: s => s.nome },
      { key: 'cpf', label: 'CPF', flow: d => d.cpf, soc: s => s.cpf },
      { key: 'rg', label: 'RG', flow: d => d.rg, soc: s => s.rg },
      { key: 'nasc', label: 'NASCIMENTO', flow: d => d.nasc, soc: s => s.nasc },
      { key: 'adm', label: 'ADMISSÃO', flow: d => d.adm, soc: s => s.adm },
      { key: 'sexo', label: 'SEXO', flow: d => d.sexo, soc: s => s.sexo },
      { key: 'mat', label: 'MATRÍCULA', flow: d => d.mat, soc: s => s.mat },
      { key: 'unidade', label: 'UNIDADE / OP', flow: d => (d.op ? 'OP ' + d.op : ''), soc: s => s.unidade },
      { key: 'cargo', label: 'CARGO', flow: d => d.cargo, soc: s => s.cargo },
      { key: 'setor', label: 'SETOR', flow: d => d.setor, soc: s => s.setor }
    ];

    container.innerHTML = dadosFiltrados.map(item => {
      const d = item.dados || {};
      const s = item.dados_soc || {};
      const idColab = item.id_colaborador || item.id;
      const falha = d.erro || item.erro;

      if (falha) {
        return `
          <div class="soc-result-card failed">
            <div class="soc-result-top" style="background:rgba(225,29,72,0.12);">
              <strong style="color:#fda4af;font-size:12px;"><i class="fa-solid fa-circle-xmark"></i> ID FLOW: ${esc(idColab)}</strong>
              <span style="font-size:9px;font-weight:900;color:#fb7185;background:rgba(225,29,72,0.2);padding:2px 8px;border-radius:6px;">FALHA</span>
            </div>
            <div style="padding:10px 14px;color:#cbd5e1;font-size:11px;">${esc(falha)}</div>
          </div>
        `;
      }

      // Renderiza as linhas comparativas Flow x SOC
      let diffCount = 0;
      const rowsHtml = compareFields.map(field => {
        const flowVal = field.flow(d);
        const socVal = field.soc(s);
        const comparable = String(flowVal ?? '').trim() !== '' || String(socVal ?? '').trim() !== '';
        
        let different = false;
        if (comparable) {
          if (field.key === 'sexo') {
            different = normSexo(flowVal) !== normSexo(socVal);
          } else if (field.key === 'unidade') {
            const opNum = String(flowVal || '').replace(/\D/g, '');
            different = opNum ? !norm(socVal).includes(opNum) : (norm(flowVal) !== norm(socVal));
          } else {
            different = norm(flowVal) !== norm(socVal);
          }
        }
        if (different) diffCount++;

        return `
          <div class="flow-soc-compare-row ${different ? 'is-different' : 'is-same'}">
            <div class="flow-soc-status">${different ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-check"></i>'}</div>
            <div class="flow-soc-label">${esc(field.label)}</div>
            <div class="flow-soc-value flow-value"><small>FLOW</small>${show(flowVal)}</div>
            <div class="flow-soc-value soc-value"><small>SOC</small>${show(socVal)}</div>
          </div>
        `;
      }).join('');

      const diffBadge = diffCount > 0
        ? `<span class="flow-soc-summary-badge diff"><i class="fa-solid fa-circle-exclamation"></i> ${diffCount} divergência${diffCount > 1 ? 's' : ''}</span>`
        : `<span class="flow-soc-summary-badge ok"><i class="fa-solid fa-circle-check"></i> Todos os dados conferem</span>`;

      return `
        <div class="soc-result-card">
          <div class="soc-result-top">
            <strong style="color:#e2e8f0;font-size:12px;"><i class="fa-solid fa-user-check" style="color:#818cf8;margin-right:6px;"></i>${esc(d.nome || s.nome || 'COLABORADOR')}</strong>
            <span style="font-size:9px;font-weight:800;color:#a5b4fc;padding:2px 8px;border-radius:6px;background:rgba(129,140,248,0.15);border:1px solid rgba(129,140,248,0.3);">MATRÍCULA: ${esc(s.mat || d.mat || 'GERADA')}</span>
          </div>

          <div class="flow-soc-audit">
            <div class="flow-soc-audit-head">
              <div>
                <div class="flow-soc-audit-title"><i class="fa-solid fa-code-compare"></i> CONFERÊNCIA FLOW × SOC (ID: ${esc(idColab)})</div>
                <div class="flow-soc-audit-subtitle">Valores capturados no Flow comparados diretamente com o formulário do SOC.</div>
              </div>
              <div>${diffBadge}</div>
            </div>
            <div class="flow-soc-legend">
              <span><i class="fa-solid fa-check"></i> Igual</span>
              <span><i class="fa-solid fa-xmark"></i> Divergente</span>
            </div>
            <div class="flow-soc-compare-head">
              <span></span>
              <span>CAMPO</span>
              <span>FLOW</span>
              <span>SOC</span>
            </div>
            ${rowsHtml}
          </div>
        </div>
      `;
    }).join('');

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // =========================================================================
  // RENDERIZADOR DOS CARDS DE EXAMES (PERSISTENTE NA PÁGINA)
  // =========================================================================
  window.renderExamesNaPagina = function(report, runId, dateStr) {
    const section = $('relatorioExamesSection');
    const container = $('relatorioExamesCards');
    const badgesBox = $('relatorioExamesBadges');
    const meta = $('relatorioExamesMeta');
    if (!section || !container || !Array.isArray(report)) return;

    const mapaUnico = new Map();
    report.forEach(item => {
      const chave = String(item.nome || item.id_colaborador || '').trim().toUpperCase();
      if (!chave) return;
      const existente = mapaUnico.get(chave);
      if (!existente || (!existente.sucesso && item.sucesso) || ((item.exames?.length || 0) > (existente.exames?.length || 0))) {
        mapaUnico.set(chave, item);
      }
    });
    const dadosFiltrados = Array.from(mapaUnico.values());

    const totalOk = dadosFiltrados.filter(r => r.sucesso).length;
    const totalFalhas = dadosFiltrados.filter(r => !r.sucesso).length;

    if (meta) meta.textContent = `Consulta em ${dateStr || new Date().toLocaleString('pt-BR')} (Execução: ${runId || 'Local'})`;

    if (badgesBox) {
      badgesBox.innerHTML = `
        <span style="padding:5px 10px;border-radius:20px;font-size:10px;font-weight:900;background:rgba(16,185,129,0.15);color:#6ee7b7;border:1px solid rgba(16,185,129,0.25);">${totalOk} CONSULTADO(S)</span>
        ${totalFalhas > 0 ? `<span style="padding:5px 10px;border-radius:20px;font-size:10px;font-weight:900;background:rgba(244,63,94,0.15);color:#fda4af;border:1px solid rgba(244,63,94,0.25);">${totalFalhas} FALHA(S)</span>` : ''}
      `;
    }

    container.innerHTML = dadosFiltrados.map(item => {
      if (!item.sucesso) {
        return `
          <div class="exam-result-item failed">
            <div class="exam-result-top" style="background:rgba(225,29,72,0.12);">
              <strong style="color:#fda4af;font-size:12px;"><i class="fa-solid fa-circle-xmark"></i> ${esc(item.nome || item.id_colaborador)}</strong>
              <span style="font-size:9px;font-weight:900;color:#fb7185;background:rgba(225,29,72,0.2);padding:2px 8px;border-radius:6px;">FALHA</span>
            </div>
            <div style="padding:10px 14px;color:#cbd5e1;font-size:11px;">${esc(item.erro || 'Falha não especificada')}</div>
          </div>
        `;
      }

      const tags = (item.exames && item.exames.length > 0)
        ? item.exames.map(e => `<span class="exam-pill">${esc(e)}</span>`).join('')
        : '<span style="color:#64748b;font-size:10px;">Nenhum exame vinculado automaticamente para esta ficha.</span>';

      return `
        <div class="exam-result-item">
          <div class="exam-result-top">
            <strong style="color:#e2e8f0;font-size:12px;"><i class="fa-solid fa-user-check" style="color:#22d3ee;margin-right:6px;"></i>${esc(item.nome || item.id_colaborador)}</strong>
            <span style="font-size:9px;font-weight:800;color:#67e8f9;padding:2px 8px;border-radius:6px;background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);">${esc(item.tipoFicha || 'Admissional')}</span>
          </div>
          <div style="padding:12px 14px;">
            <div style="font-size:9px;font-weight:900;color:#94a3b8;margin-bottom:6px;letter-spacing:0.04em;">EXAMES IDENTIFICADOS (${item.exames ? item.exames.length : 0}):</div>
            <div>${tags}</div>
          </div>
        </div>
      `;
    }).join('');

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function renderCentral() {
    const box = $('activityList');
    if (box) box.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;"><i class="fa-solid fa-circle-notch fa-spin"></i> Verificando permissões...</div>';

    let isMaster = false;
    try {
      const supbUrl = 'https://wukxupvwnagtdbvwdqlt.supabase.co';
      const supbKey = 'sb_publishable_-wMyexJm-TEbqx_CtYr-9Q_2ASKEBfs';
      if (window.supabase) {
        const client = window.supabase.createClient(supbUrl, supbKey);
        const { data: { session } } = await client.auth.getSession();
        if (session && session.user) {
          const { data } = await client.from('perfis_operadores').select('nivel_acesso').eq('email', session.user.email).maybeSingle();
          if (data && data.nivel_acesso && data.nivel_acesso.toLowerCase() === 'master') isMaster = true;
        }
      } else {
        isMaster = (localStorage.getItem('user_role') === 'master');
      }
    } catch (e) {
      console.error('Erro na verificação de segurança:', e);
    }

    document.querySelectorAll('.master-only-card').forEach(card => {
      card.style.display = isMaster ? '' : 'none';
    });

    const elCount = document.querySelector('.count');
    if (elCount) elCount.textContent = isMaster ? '03 PROCESSOS' : '02 PROCESSOS';

    const list = allHistory();
    const total = list.length,
      success = list.filter(x => x.status === 'success').length,
      fail = list.filter(x => x.status === 'error').length,
      latest = list[0];

    if ($('globalRuns')) $('globalRuns').textContent = total || '—';
    if ($('globalSuccess')) $('globalSuccess').textContent = success || '—';
    if ($('globalFailures')) $('globalFailures').textContent = fail || '—';
    if ($('globalLast')) $('globalLast').textContent = latest ? fmt(latest.startedAt) : '—';

    if (!box) return;

    const allowedList = isMaster ? list : list.filter(r => r.macro === 'SOC - CRIAR CADASTRO' || r.macro === 'BUSCAR_EXAMES');

    if (!allowedList.length) {
      box.innerHTML = '<div class="empty"><div><i class="fa-solid fa-clock-rotate-left"></i><strong>Nenhuma execução registrada</strong><span>As execuções das rotinas aparecerão aqui.</span></div></div>';
      return;
    }

    box.innerHTML = allowedList.slice(0, 12).map(r => {
      const c = Object.values(CONFIGS).find(cfg => cfg.macro === r.macro || cfg.title === r.macro) || { title: r.macro };
      return `<div class="run-row" data-detail="${esc(r.id)}"><div class="run-time">${esc(time(r.startedAt))}</div><div class="run-main"><strong>${esc(c.title)}</strong><span>${esc(fmt(r.startedAt))} · ${esc(r.message || 'Execução registrada')}</span></div><span class="badge ${iconStatus(r.status)}">${r.status === 'success' ? 'SUCESSO' : r.status === 'error' ? 'FALHA' : 'INFO'}</span></div>`;
    }).join('');

    box.querySelectorAll('[data-detail]').forEach(el => {
      el.addEventListener('click', () => openHistoryDetail(allowedList.find(x => x.id === el.dataset.detail)));
    });
  }

  async function refreshEnvironment() {
    document.querySelectorAll('[data-env="bridge"]').forEach(e => { e.textContent = 'CLOUD NATIVO'; e.className = 'mini-status online'; });
    document.querySelectorAll('[data-env="uivision"]').forEach(e => { e.textContent = 'NATIVO NO NAVEGADOR'; e.className = 'mini-status online'; });
    document.querySelectorAll('[data-env="browser-state"]').forEach(e => { e.textContent = 'ONLINE'; e.className = 'mini-status online'; });
    const note = document.getElementById('envSummary');
    if (note) note.textContent = 'Ambiente 100% Cloud (Vercel + Supabase) operando nativamente no navegador.';
    return { status: 'ok' };
  }

  function validateSoc() {
    const input = $('soc-ids-input') || $('batchInput') || $('uivision-soc-ids-input');
    if (!input) return { valid: [], invalid: 0, duplicate: 0 };
    const lines = input.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean), valid = [], seen = new Set();
    let invalid = 0, duplicate = 0;
    lines.forEach(line => {
      const id = (line.split(/[;|,\t]/)[0] || '').replace(/[\uFEFF"']/g, '').trim();
      if (!/^\d+$/.test(id)) { invalid++; return; }
      if (seen.has(id)) { duplicate++; return; }
      seen.add(id);
      valid.push(id);
    });
    $('validCount')?.replaceChildren(document.createTextNode(valid.length));
    $('invalidCount')?.replaceChildren(document.createTextNode(invalid));
    $('duplicateCount')?.replaceChildren(document.createTextNode(duplicate));
    const box = $('previewBody');
    if (box) {
      box.innerHTML = !valid.length
        ? '<tr><td colspan="2" style="text-align:center;color:#64748b;">Nenhum ID inserido.</td></tr>'
        : valid.slice(0, 50).map((id, i) => `<tr><td>${i + 1}</td><td style="font-weight:700;color:#cbd5e1;">${esc(id)}</td></tr>`).join('');
    }
    return { valid, invalid, duplicate };
  }

  function validateExames() {
    const input = $('batchInput');
    const tipoSelect = $('tipoExameSelect');
    const tipoPadrao = tipoSelect ? tipoSelect.value : 'Admissional';
    if (!input) return { valid: [], invalid: 0, duplicate: 0 };

    const lines = input.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const valid = [], seen = new Set();
    let invalid = 0, duplicate = 0;

    lines.forEach(line => {
      let p = [];
      if (line.includes('\t')) p = line.split('\t').map(s => s.trim()).filter(Boolean);
      else if (line.includes(';')) p = line.split(';').map(s => s.trim()).filter(Boolean);
      else if (line.includes('|')) p = line.split('|').map(s => s.trim()).filter(Boolean);
      else if (/\s{2,}/.test(line)) p = line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
      else p = [line.trim()];

      const nome = (p[0] || '').replace(/[\uFEFF"']/g, '').trim();
      const tipo = (p.length > 1 && p[1]) ? p[1].replace(/[\uFEFF"']/g, '').trim() : tipoPadrao;

      if (!nome) { invalid++; return; }
      const chave = nome.toUpperCase();
      if (seen.has(chave)) { duplicate++; return; }
      seen.add(chave);

      valid.push({ nome, tipo });
    });

    $('validCount')?.replaceChildren(document.createTextNode(valid.length));
    $('invalidCount')?.replaceChildren(document.createTextNode(invalid));
    $('duplicateCount')?.replaceChildren(document.createTextNode(duplicate));

    const box = $('previewBody');
    if (box) {
      if (!valid.length) {
        box.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;">Nenhum colaborador inserido.</td></tr>';
      } else {
        box.innerHTML = valid.slice(0, 50).map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td style="font-weight:700;color:#f1f5f9;">${esc(r.nome)}</td>
            <td><span style="display:inline-block;padding:2px 8px;border-radius:6px;background:rgba(6,182,212,.15);border:1px solid rgba(6,182,212,.3);color:#67e8f9;font-size:9px;font-weight:800;">${esc(r.tipo)}</span></td>
          </tr>
        `).join('');
      }
    }
    return { valid, invalid, duplicate };
  }

  function validateBatch() {
    const input = $('batchInput');
    if (!input) return { valid: [], invalid: 0, duplicate: 0 };
    const lines = input.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean), rows = [], seen = new Set();
    let invalid = 0, duplicate = 0;
    lines.forEach(line => {
      const p = line.includes(';') ? line.split(';') : line.split('\t');
      if (p.length < 3) { invalid++; return; }
      const row = { cpf: p[0].replace(/[\uFEFF"']/g, '').trim(), cargo: p[1].replace(/[\uFEFF"']/g, '').trim(), unidade: p.slice(2).join(';').replace(/[\uFEFF"']/g, '').trim() };
      const key = row.cpf.replace(/\D/g, '');
      if (seen.has(key)) { duplicate++; return; }
      seen.add(key);
      if (!/^\d{11}$/.test(key) || !row.cargo || !row.unidade) { invalid++; return; }
      row.cpf = key;
      rows.push(row);
    });
    $('validCount')?.replaceChildren(document.createTextNode(rows.length));
    $('invalidCount')?.replaceChildren(document.createTextNode(invalid));
    $('duplicateCount')?.replaceChildren(document.createTextNode(duplicate));
    const box = $('previewBody');
    if (box) {
      box.innerHTML = !rows.length
        ? '<tr><td colspan="3" style="text-align:center;color:#64748b;">Nenhum colaborador inserido.</td></tr>'
        : rows.slice(0, 30).map(r => `<tr><td>${esc(r.cpf)}</td><td>${esc(r.cargo)}</td><td>${esc(r.unidade)}</td></tr>`).join('');
    }
    return { valid: rows, invalid, duplicate };
  }

  function validateBatchForm(macro) {
    if (macro === 'SOC - CRIAR CADASTRO') return validateSoc();
    if (macro === 'VERIFICAR EXAMES' || macro === 'BUSCAR_EXAMES') return validateExames();
    return validateBatch();
  }

  function setStep(index, state, label) {
    document.querySelectorAll('.step').forEach((s, i) => {
      s.classList.remove('active', 'done', 'failed');
      if (i < index && state !== 'failed') s.classList.add('done');
      if (i === index) s.classList.add(state === 'failed' ? 'failed' : state === 'done' ? 'done' : 'active');
      const n = s.querySelector('.step-state');
      if (n) n.textContent = i < index ? (state === 'failed' ? '—' : 'OK') : i === index ? (label || 'PROCESSANDO') : 'AGUARDANDO';
    });
  }

  function addLog(type, msg) {
    const host = $('logOutput');
    if (!host) return;
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="log-time">${esc(time())}</span><span class="log-${type || 'info'}">${esc(msg)}</span>`;
    host.appendChild(line);
    host.scrollTop = host.scrollHeight;
  }

  function updateExecutionView(cfg, state, message) {
    const label = $('executeState');
    if (label) label.textContent = message;
    const hint = $('executeHint');
    if (hint) {
      hint.textContent = state === 'running'
        ? 'Robô em operação. Monitorando resultados...'
        : state === 'success'
          ? 'Comando aceito. Aguardando conclusão dos registros...'
          : 'Pronto para uma nova execução.';
    }
    const btn = $('executeBtn');
    if (btn) {
      btn.disabled = state === 'running';
      btn.innerHTML = state === 'running'
        ? '<i class="fa-solid fa-circle-notch fa-spin"></i><span>PROCESSANDO NO SOC...</span>'
        : state === 'success'
          ? '<i class="fa-solid fa-check"></i><span>COMANDO ACEITO</span>'
          : state === 'error'
            ? '<i class="fa-solid fa-triangle-exclamation"></i><span>TENTAR NOVAMENTE</span>'
            : '<i class="fa-solid fa-play"></i><span>EXECUTAR AUTOMAÇÃO</span>';
    }
    setState(state === 'running' ? 'running' : state === 'error' ? 'error' : 'ready', state === 'running' ? 'EXECUÇÃO EM ANDAMENTO' : state === 'error' ? 'ATENÇÃO NECESSÁRIA' : 'SISTEMA PRONTO');
  }

  function refreshExecutionKpis(macro) {
    const list = historyFor(macro),
      s = list.filter(x => x.status === 'success').length,
      f = list.filter(x => x.status === 'error').length,
      l = list[0];
    if ($('runsKpi')) $('runsKpi').textContent = list.length || '—';
    if ($('successKpi')) $('successKpi').textContent = s || '—';
    if ($('failKpi')) $('failKpi').textContent = f || '—';
    if ($('lastKpi')) $('lastKpi').textContent = l ? fmt(l.startedAt) : '—';
  }

  // =========================================================================
  // EXECUÇÃO 100% NUVEM / NAVEGADOR COM LIVE POLLING
  // =========================================================================
  async function executeAutomation(cfg) {
    const started = new Date().toISOString();
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const run = { id: runId, macro: cfg.macro, status: 'info', startedAt: started, message: 'Execução iniciada.', browser: 'Web Nativo' };

    $('progressTrack')?.removeAttribute('hidden');
    document.querySelectorAll('.step .step-state').forEach((x, i) => x.textContent = i === 0 ? 'PROCESSANDO' : 'AGUARDANDO');
    document.querySelectorAll('.step').forEach((s, i) => { s.classList.remove('active', 'done', 'failed'); if (i === 0) s.classList.add('active'); });
    if ($('logOutput')) $('logOutput').innerHTML = '';

    addLog('info', `Solicitação iniciada: ${cfg.title}`);
    updateExecutionView(cfg, 'running', 'PREPARANDO AUTOMAÇÃO');

    try {
      let cmdVar2 = '';
      let totalEsperado = 0;

      if (cfg.endpoint === 'soc') {
        const d = validateSoc();
        if (!d.valid.length) throw new Error('Informe ao menos um ID numérico válido.');
        cmdVar2 = d.valid.join(',');
        totalEsperado = d.valid.length;
        storageSet('uivision_soc_ids', $('batchInput')?.value || '');
        addLog('info', `${d.valid.length} ID(s) válidos preparados para o SOC.`);
      } else if (cfg.endpoint === 'exames' || cfg.macro === 'BUSCAR_EXAMES') {
        const d = validateExames();
        if (!d.valid.length) throw new Error('Informe ao menos um colaborador válido.');
        cmdVar2 = d.valid.map(r => `${r.nome};${r.tipo}`).join('|||');
        totalEsperado = d.valid.length;
        storageSet('uivision_exames_input', $('batchInput')?.value || '');
        addLog('info', `${d.valid.length} colaborador(es) preparados.`);
      } else if (cfg.endpoint === 'batch') {
        const d = validateBatch();
        if (!d.valid.length) throw new Error('Nenhum colaborador válido.');
        cmdVar2 = d.valid.map(r => `${r.cpf};${r.cargo};${r.unidade}`).join('|||');
        storageSet('uivision_ultimo_lote', $('batchInput')?.value || '');
        addLog('info', `${d.valid.length} colaborador(es) preparados.`);
      }

      setStep(1, 'active', 'DISPARANDO NAVEGADOR');

      const macroEnc = encodeURIComponent(cfg.macro + (cfg.macro.endsWith('.js') ? '' : '.js'));
      const var1Enc = encodeURIComponent(runId);
      const var2Enc = encodeURIComponent(cmdVar2);

      const url = `ui.vision.html?macro=${macroEnc}&direct=1&closeRPA=0&closeBrowser=0&bringToFront=0&cmd_var1=${var1Enc}&cmd_var2=${var2Enc}`;
      window.open(url, '_blank');

      addLog('ok', 'Aba disparada. O robô assumiu o controle!');
      setStep(3, 'done', 'EM EXECUÇÃO');

      run.status = 'success';
      run.finishedAt = new Date().toISOString();
      run.message = 'Comando enviado ao navegador.';
      addHistory(run);
      refreshExecutionKpis(cfg.macro);

      // --- LIVE POLLING NATIVO VIA SUPABASE ---
      if (cfg.endpoint === 'soc' || cfg.endpoint === 'exames') {
        let pollAttempts = 0;
        const supbUrl = 'https://wukxupvwnagtdbvwdqlt.supabase.co';
        const supbKey = 'sb_publishable_-wMyexJm-TEbqx_CtYr-9Q_2ASKEBfs';
        const client = window.supabase ? window.supabase.createClient(supbUrl, supbKey) : window.supabaseClient;

        const pollTimer = setInterval(async () => {
          pollAttempts++;
          if (pollAttempts > 120) { clearInterval(pollTimer); return; }

          try {
            if (client) {
              const { data } = await client.from('resultados_robos').select('*').eq('run_id', runId);
              if (data && data.length > 0) {
                if (cfg.endpoint === 'soc') {
                  window.renderSocNaPagina(data, runId, new Date().toLocaleString('pt-BR'));
                } else {
                  const mapa = new Map();
                  data.forEach(item => {
                    const nome = String(item.id_colaborador || '').trim().toUpperCase();
                    if (!mapa.has(nome)) {
                      mapa.set(nome, {
                        nome: item.id_colaborador,
                        tipoFicha: item.dados?.tipoFicha || 'Admissional',
                        sucesso: item.dados?.sucesso ?? true,
                        exames: item.dados?.exames || [],
                        erro: item.dados?.erro
                      });
                    }
                  });
                  window.renderExamesNaPagina(Array.from(mapa.values()), runId, new Date().toLocaleString('pt-BR'));
                }

                if (data.length >= totalEsperado) {
                  clearInterval(pollTimer);
                  $('progressTrack')?.setAttribute('hidden', 'hidden');
                  updateExecutionView(cfg, 'ready', 'SISTEMA PRONTO');
                  toast('Processamento concluído e salvo!');
                }
              }
            }
          } catch(e) {}
        }, 2000);
      } else {
        setTimeout(() => updateExecutionView(cfg, 'ready', 'SISTEMA PRONTO'), 2500);
      }

    } catch (err) {
      run.status = 'error';
      run.finishedAt = new Date().toISOString();
      run.message = err?.message || 'Falha não identificada.';
      addLog('error', run.message);
      setStep(2, 'failed', 'FALHA');
      $('progressTrack')?.setAttribute('hidden', 'hidden');
      addHistory(run);
      updateExecutionView(cfg, 'error', 'EXECUÇÃO COM ERRO');
      refreshExecutionKpis(cfg.macro);
      toast(run.message, 'error');
    }
  }

  // =========================================================================
  // AUDITORIA DO SOC (HISTÓRICO)
  // =========================================================================
  // =========================================================================
  // AUDITORIA DO SOC NO HISTÓRICO COM TABELA COMPARATIVA (FLOW × SOC)
  // =========================================================================
  window.carregarDadosExtraidos = async function(runId, btn) {
    const box = document.getElementById(`extraDataBox-${runId}`);
    if (!box) return;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Buscando auditoria comparativa...';
    btn.disabled = true;

    try {
      const supbUrl = 'https://wukxupvwnagtdbvwdqlt.supabase.co';
      const supbKey = 'sb_publishable_-wMyexJm-TEbqx_CtYr-9Q_2ASKEBfs';
      const client = window.supabase ? window.supabase.createClient(supbUrl, supbKey) : window.supabaseClient;
      const { data, error } = await client.from('resultados_robos').select('*').eq('run_id', runId);
      if (error) throw error;

      if (!data || data.length === 0) {
        box.innerHTML = '<div style="padding:14px;font-size:11px;color:#94a3b8;background:rgba(2,6,23,.45);border:1px solid rgba(148,163,184,.12);border-radius:10px;text-align:center;"><i class="fa-solid fa-database" style="margin-right:6px"></i>Nenhum dado capturado ainda para esta execução.</div>';
      } else {
        // Desduplica colaboradores se houver retentativa
        const mapaUnico = new Map();
        data.forEach(item => {
          const chave = String(item.id_colaborador || '').trim();
          if (!chave) return;
          mapaUnico.set(chave, item);
        });
        const dadosFiltrados = Array.from(mapaUnico.values());

        // Auxiliares de normalização para comparação exata
        const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '').replace(/[.\-\/(),]/g, '');
        const normSexo = value => {
          const v = norm(value);
          if (['F', 'FEM', 'FEMININO'].includes(v)) return 'F';
          if (['M', 'MAS', 'MASCULINO'].includes(v)) return 'M';
          return v;
        };
        const show = value => {
          const str = String(value ?? '').trim();
          return str ? esc(str) : '<span style="color:#64748b">N/D</span>';
        };

        const compareFields = [
          { key: 'nome', label: 'NOME', flow: d => d.nome, soc: s => s.nome },
          { key: 'cpf', label: 'CPF', flow: d => d.cpf, soc: s => s.cpf },
          { key: 'rg', label: 'RG', flow: d => d.rg, soc: s => s.rg },
          { key: 'nasc', label: 'NASCIMENTO', flow: d => d.nasc, soc: s => s.nasc },
          { key: 'adm', label: 'ADMISSÃO', flow: d => d.adm, soc: s => s.adm },
          { key: 'sexo', label: 'SEXO', flow: d => d.sexo, soc: s => s.sexo },
          { key: 'mat', label: 'MATRÍCULA', flow: d => d.mat, soc: s => s.mat },
          { key: 'unidade', label: 'UNIDADE / OP', flow: d => (d.op ? 'OP ' + d.op : ''), soc: s => s.unidade },
          { key: 'cargo', label: 'CARGO', flow: d => d.cargo, soc: s => s.cargo },
          { key: 'setor', label: 'SETOR', flow: d => d.setor, soc: s => s.setor }
        ];

        box.innerHTML = dadosFiltrados.map(item => {
          const d = item.dados || {};
          const s = item.dados_soc || {};
          const idColab = item.id_colaborador;

          if (d.erro && d.erro.length > 0) {
            return `
              <div style="background:rgba(225,29,72,.08);border:1px solid rgba(225,29,72,.30);border-radius:12px;margin-bottom:12px;padding:12px 14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                  <strong style="color:#fda4af;font-size:12px;"><i class="fa-solid fa-circle-xmark"></i> ID FLOW: ${esc(idColab)}</strong>
                  <span style="font-size:9px;font-weight:900;color:#fb7185;background:rgba(225,29,72,0.2);padding:2px 8px;border-radius:6px;">FALHA</span>
                </div>
                <div style="color:#cbd5e1;font-size:10px;">${esc(d.erro)}</div>
              </div>
            `;
          }

          let diffCount = 0;
          const rowsHtml = compareFields.map(field => {
            const flowVal = field.flow(d);
            const socVal = field.soc(s);
            const comparable = String(flowVal ?? '').trim() !== '' || String(socVal ?? '').trim() !== '';

            let different = false;
            if (comparable) {
              if (field.key === 'sexo') {
                different = normSexo(flowVal) !== normSexo(socVal);
              } else if (field.key === 'unidade') {
                const opNum = String(flowVal || '').replace(/\D/g, '');
                different = opNum ? !norm(socVal).includes(opNum) : (norm(flowVal) !== norm(socVal));
              } else {
                different = norm(flowVal) !== norm(socVal);
              }
            }
            if (different) diffCount++;

            return `
              <div class="flow-soc-compare-row ${different ? 'is-different' : 'is-same'}">
                <div class="flow-soc-status">${different ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-check"></i>'}</div>
                <div class="flow-soc-label">${esc(field.label)}</div>
                <div class="flow-soc-value flow-value"><small>FLOW</small>${show(flowVal)}</div>
                <div class="flow-soc-value soc-value"><small>SOC</small>${show(socVal)}</div>
              </div>
            `;
          }).join('');

          const diffBadge = diffCount > 0
            ? `<span class="flow-soc-summary-badge diff"><i class="fa-solid fa-circle-exclamation"></i> ${diffCount} divergência${diffCount > 1 ? 's' : ''}</span>`
            : `<span class="flow-soc-summary-badge ok"><i class="fa-solid fa-circle-check"></i> Todos os dados conferem</span>`;

          return `
            <div class="soc-result-card" style="margin-bottom:12px;background:rgba(15,23,42,.65);border:1px solid rgba(129,140,248,.25);border-radius:12px;overflow:hidden;">
              <div class="soc-result-top" style="padding:10px 14px;background:rgba(129,140,248,.08);border-bottom:1px solid rgba(148,163,184,.1);display:flex;justify-content:space-between;align-items:center;">
                <strong style="color:#e2e8f0;font-size:12px;"><i class="fa-solid fa-user-check" style="color:#818cf8;margin-right:6px;"></i>${esc(d.nome || s.nome || 'COLABORADOR')}</strong>
                <span style="font-size:9px;font-weight:800;color:#a5b4fc;padding:2px 8px;border-radius:6px;background:rgba(129,140,248,.15);border:1px solid rgba(129,140,248,.3);">MATRÍCULA: ${esc(s.mat || d.mat || 'GERADA')}</span>
              </div>

              <div class="flow-soc-audit" style="margin:10px 12px 12px;border:1px solid rgba(129,140,248,.22);border-radius:10px;overflow:hidden;background:rgba(15,23,42,.35);">
                <div class="flow-soc-audit-head" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(129,140,248,.06);">
                  <div>
                    <div class="flow-soc-audit-title" style="color:#c7d2fe;font-size:10px;font-weight:900;"><i class="fa-solid fa-code-compare" style="color:#818cf8;margin-right:5px;"></i>CONFERÊNCIA FLOW × SOC (ID: ${esc(idColab)})</div>
                    <div class="flow-soc-audit-subtitle" style="color:#64748b;font-size:8px;margin-top:2px;">Auditoria salva no banco em nuvem para este registro.</div>
                  </div>
                  <div>${diffBadge}</div>
                </div>
                <div class="flow-soc-legend" style="display:flex;gap:12px;padding:6px 12px;color:#64748b;font-size:8px;">
                  <span><i class="fa-solid fa-check" style="color:#34d399;"></i> Igual</span>
                  <span><i class="fa-solid fa-xmark" style="color:#fb7185;"></i> Divergente</span>
                </div>
                <div class="flow-soc-compare-head">
                  <span></span>
                  <span>CAMPO</span>
                  <span>FLOW</span>
                  <span>SOC</span>
                </div>
                ${rowsHtml}
              </div>
            </div>
          `;
        }).join('');
      }

      box.style.display = 'block';
      btn.style.display = 'none';
    } catch (err) {
      box.innerHTML = '<div style="color:#fb7185;font-size:11px;padding:12px;border-radius:8px;background:rgba(225,29,72,.08);border:1px solid rgba(225,29,72,.25);">Erro ao buscar os dados comparativos na nuvem.</div>';
      box.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Tentar novamente';
    }
  };

  // =========================================================================
  // AUDITORIA DOS EXAMES (HISTÓRICO)
  // =========================================================================
  window.carregarExamesHistorico = async function(runId, btn) {
    const box = document.getElementById(`extraDataBox-${runId}`);
    if (!box) return;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Buscando exames salvos...';
    btn.disabled = true;

    try {
      const supbUrl = 'https://wukxupvwnagtdbvwdqlt.supabase.co';
      const supbKey = 'sb_publishable_-wMyexJm-TEbqx_CtYr-9Q_2ASKEBfs';
      const client = window.supabase ? window.supabase.createClient(supbUrl, supbKey) : window.supabaseClient;
      const { data, error } = await client.from('resultados_robos').select('*').eq('run_id', runId);
      if (error) throw error;

      if (!data || data.length === 0) {
        box.innerHTML = '<div style="padding:14px;font-size:11px;color:#94a3b8;background:rgba(2,6,23,.45);border:1px solid rgba(148,163,184,.12);border-radius:10px;text-align:center;">Nenhum exame encontrado para esta execução.</div>';
      } else {
        const mapaUnico = new Map();
        data.forEach(item => {
          const chave = String(item.id_colaborador || '').trim().toUpperCase();
          if (!chave) return;
          const existente = mapaUnico.get(chave);
          if (!existente || (!existente.dados?.sucesso && item.dados?.sucesso) || ((item.dados?.exames?.length || 0) > (existente.dados?.exames?.length || 0))) {
            mapaUnico.set(chave, item);
          }
        });
        const dadosUnicos = Array.from(mapaUnico.values());

        box.innerHTML = dadosUnicos.map(item => {
          const d = item.dados || {};
          const tags = (d.exames && d.exames.length > 0)
            ? d.exames.map(e => `<span style="display:inline-block;padding:2px 8px;background:rgba(6,182,212,.12);border:1px solid rgba(6,182,212,.25);border-radius:6px;color:#a5f3fc;font-size:9px;margin:2px;">${esc(e)}</span>`).join('')
            : '<span style="color:#64748b;font-size:10px;">Nenhum exame identificado.</span>';

          return `
            <div style="background:rgba(15,23,42,0.55);border:1px solid rgba(6,182,212,0.22);border-radius:10px;padding:10px 12px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <strong style="color:#e2e8f0;font-size:11px;">${esc(item.id_colaborador)}</strong>
                <span style="font-size:9px;font-weight:800;color:#67e8f9;padding:2px 6px;border-radius:4px;background:rgba(6,182,212,0.15);">${esc(d.tipoFicha || 'Admissional')}</span>
              </div>
              <div>${tags}</div>
            </div>
          `;
        }).join('');
      }
      box.style.display = 'block';
      btn.style.display = 'none';
    } catch (e) {
      box.innerHTML = '<div style="color:#fb7185;font-size:11px;padding:10px;">Erro ao buscar exames na nuvem.</div>';
      box.style.display = 'block';
      btn.disabled = false;
    }
  };

  function closeHistory() { $('historyModal')?.classList.remove('show'); }
  window.closeHistory = closeHistory;

  function renderHistory(macro, filter) {
    const list = historyFor(macro).filter(x => filter === 'all' || x.status === filter);
    const body = $('historyBody');
    if (!body) return;
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty" style="min-height:160px"><div><i class="fa-solid fa-clock-rotate-left"></i><strong>Nenhuma execução neste filtro</strong><span>Execute a automação para construir o histórico.</span></div></div></td></tr>';
      return;
    }
    body.innerHTML = list.map(r => `<tr data-run-id="${esc(r.id)}"><td>${esc(fmt(r.startedAt))}</td><td><span class="badge ${iconStatus(r.status)}">${r.status === 'success' ? 'SUCESSO' : r.status === 'error' ? 'FALHA' : 'INFO'}</span></td><td>${r.durationMs ? esc((r.durationMs / 1000).toFixed(1) + 's') : '—'}</td><td>${esc(r.browser || '—')}</td><td>${esc(r.message || '—')}</td><td>${r.pid ? esc(String(r.pid)) : '—'}</td></tr>`).join('');
    body.querySelectorAll('[data-run-id]').forEach(row => {
      row.addEventListener('click', () => openHistoryDetail(list.find(x => x.id === row.dataset.runId)));
    });
  }

  function openHistoryDetail(run) {
    if (!run) return;
    const modal = $('historyModal');
    if (!modal) return;
    const fields = [
      ['AUTOMAÇÃO', run.macro],
      ['STATUS', run.status === 'success' ? 'SUCESSO' : run.status === 'error' ? 'FALHA' : 'INFO'],
      ['INÍCIO', fmt(run.startedAt)],
      ['FIM', fmt(run.finishedAt)],
      ['DURAÇÃO', run.durationMs ? ((run.durationMs / 1000).toFixed(1) + 's') : '—'],
      ['MENSAGEM', run.message || '—'],
      ['PID', run.pid || '—'],
      ['BROWSER', run.browser || '—']
    ];
    let html = fields.map(([a, b]) => `<div class="detail-field"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join('');

    if (run.macro === 'SOC - CRIAR CADASTRO') {
      html += `
      <div style="grid-column: 1 / -1; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(148,163,184,0.1);">
          <button type="button" class="btn" onclick="carregarDadosExtraidos('${run.id}', this)" style="background: rgba(129,140,248,0.15); color: #818cf8; width: 100%; border: 1px solid rgba(129,140,248,0.3); padding: 10px; border-radius: 10px; font-weight: bold; cursor: pointer;">
              <i class="fa-solid fa-database"></i> Visualizar Dados Coletados pelo Robô
          </button>
          <div id="extraDataBox-${run.id}" style="margin-top: 12px; display: none;"></div>
      </div>`;
    } else if (run.macro === 'BUSCAR_EXAMES') {
      html += `
      <div style="grid-column: 1 / -1; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(148,163,184,0.1);">
          <button type="button" class="btn" onclick="carregarExamesHistorico('${run.id}', this)" style="background: rgba(6,182,212,0.15); color: #22d3ee; width: 100%; border: 1px solid rgba(6,182,212,0.3); padding: 10px; border-radius: 10px; font-weight: bold; cursor: pointer;">
              <i class="fa-solid fa-file-waveform"></i> Visualizar Exames Desta Execução
          </button>
          <div id="extraDataBox-${run.id}" style="margin-top: 12px; display: none;"></div>
      </div>`;
    }

    $('historyDetail').innerHTML = html;
    modal.classList.add('show');
  }

  // =========================================================================
  // INICIALIZAÇÃO DA PÁGINA (RECUPERA RESULTADOS SALVOS)
  // =========================================================================
  function pageInit() {
    const macroName = document.body.dataset.automation;
    if (!macroName) return;

    const cfg = CONFIGS[macroName] || Object.values(CONFIGS).find(c => c.macro === macroName || c.title === macroName);
    if (!cfg) return;

    document.documentElement.style.setProperty('--card-accent', cfg.accent);
    document.documentElement.style.setProperty('--card-accent-soft', cfg.soft);
    document.querySelectorAll('[data-cfg="title"]').forEach(e => e.textContent = cfg.title);
    document.querySelectorAll('[data-cfg="category"]').forEach(e => e.textContent = cfg.category);
    document.querySelectorAll('[data-cfg="description"]').forEach(e => e.textContent = cfg.description);
    document.querySelectorAll('[data-cfg="id"]').forEach(e => e.textContent = cfg.id);
    document.querySelectorAll('[data-cfg="icon"]').forEach(e => e.className = 'fa-solid ' + cfg.icon);

    renderHistory(cfg.macro, 'all');
    refreshExecutionKpis(cfg.macro);

    const input = $('batchInput');
    if (input) {
      const key = cfg.endpoint === 'soc'
        ? 'uivision_soc_ids'
        : (cfg.endpoint === 'exames' ? 'uivision_exames_input' : 'uivision_ultimo_lote');
      const old = storageGet(key);
      if (old) input.value = old;
      input.addEventListener('input', () => validateBatchForm(cfg.title));
      validateBatchForm(cfg.title);
    }

    // Recupera resultados anteriores salvos no navegador ao carregar a página
    if (cfg.endpoint === 'soc') {
      try {
        const salvo = JSON.parse(storageGet('uivision_ultimo_relatorio_soc') || 'null');
        if (salvo && Array.isArray(salvo.report) && salvo.report.length > 0) {
          window.renderSocNaPagina(salvo.report, salvo.runId, salvo.dateStr);
        }
      } catch (e) {}

      window.addEventListener('storage', (e) => {
        if (e.key === 'uivision_ultimo_relatorio_soc' && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            if (data && Array.isArray(data.report)) {
              window.renderSocNaPagina(data.report, data.runId, data.dateStr);
            }
          } catch(err) {}
        }
      });
    } else if (cfg.endpoint === 'exames') {
      try {
        const salvo = JSON.parse(storageGet('uivision_ultimo_relatorio_exames') || 'null');
        if (salvo && Array.isArray(salvo.report) && salvo.report.length > 0) {
          window.renderExamesNaPagina(salvo.report, salvo.runId, salvo.dateStr);
        }
      } catch (e) {}

      window.addEventListener('storage', (e) => {
        if (e.key === 'uivision_ultimo_relatorio_exames' && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            if (data && Array.isArray(data.report)) {
              window.renderExamesNaPagina(data.report, data.runId, data.dateStr);
            }
          } catch(err) {}
        }
      });
    }

    $('tipoExameSelect')?.addEventListener('change', () => validateExames());

    document.querySelectorAll('[data-filter]').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderHistory(cfg.macro, b.dataset.filter);
      });
    });

    $('executeBtn')?.addEventListener('click', () => executeAutomation(cfg));
    $('copyLogs')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('logOutput')?.innerText || '');
        toast('Log copiado com sucesso.');
      } catch {
        toast('Não foi possível copiar o log.', 'error');
      }
    });
    $('clearLogs')?.addEventListener('click', () => { if ($('logOutput')) $('logOutput').innerHTML = ''; });
    document.querySelector('[data-open-full-history]')?.addEventListener('click', () => { window.location.href = 'painel.html'; });

    refreshEnvironment();
    setTimeout(() => setState('ready', 'SISTEMA PRONTO'), 60);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page === 'central') {
      renderCentral();
      refreshEnvironment();
      $('refreshCentral')?.addEventListener('click', refreshEnvironment);
      $('historyModal')?.addEventListener('click', e => { if (e.target.id === 'historyModal') closeHistory(); });
    } else {
      pageInit();
      $('historyModal')?.addEventListener('click', e => { if (e.target.id === 'historyModal') closeHistory(); });
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHistory(); });
  });
})();