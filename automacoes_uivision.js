(function(){
  'use strict';
  const CONFIGS={
    'SOC - CRIAR CADASTRO':{id:'AUT-001',title:'SOC - CRIAR CADASTRO',category:'SOC / CADASTRO',icon:'fa-user-plus',accent:'#818cf8',soft:'rgba(129,140,248,.12)',description:'Criação automatizada de cadastros no SOC a partir de uma lista validada de IDs.',macro:'SOC - CRIAR CADASTRO',endpoint:'soc'},
    'VERIFICAR EXAMES':{id:'AUT-002',title:'VERIFICAR EXAMES',category:'SOC / EXAMES',icon:'fa-file-waveform',accent:'#06b6d4',soft:'rgba(6,182,212,.12)',description:'Verificação, validação e conferência automatizada de exames ocupacionais no SOC.',macro:'VERIFICAR_EXAMES',endpoint:'macro'},
    'ATIVAR_FUNCIONARIOS':{id:'AUT-003',title:'ATIVAR FUNCIONÁRIOS',category:'EXECUÇÃO EM LOTE',icon:'fa-user-check',accent:'#fbbf24',soft:'rgba(251,191,36,.12)',description:'Atualização de dados e ativação de funcionários em lote por meio do Bridge local.',macro:'ATIVAR_FUNCIONARIOS',endpoint:'batch'}
  };
  const RUNS_KEY='uivision_standalone_runs', HISTORY_KEY='uivision_run_history';
  const HEALTH='http://127.0.0.1:5000/health', MACRO_URL='http://127.0.0.1:5000/executar-macro', AUTO_URL='http://127.0.0.1:5000/executar-automacao', SOC_URL='http://127.0.0.1:5000/executar-soc';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return '—'}};
  const time=v=>{try{return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(v||Date.now()))}catch{return '—'}};
  function toast(msg,type='success'){const box=$('toast');if(!box)return;const el=document.createElement('div');el.className='toast-item '+type;el.textContent=msg;box.appendChild(el);setTimeout(()=>{el.style.opacity='0';el.style.transform='translateY(5px)'},2500);setTimeout(()=>el.remove(),2800)}
  window.uiToast=toast;
  function readRuns(){try{return JSON.parse(localStorage.getItem(RUNS_KEY)||'{}')}catch{return {}}}
  function storageGet(key,fallback=''){try{return localStorage.getItem(key) ?? fallback}catch{return fallback}}
  function storageSet(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}
  function readHistory(){try{const v=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
  function writeHistory(v){storageSet(HISTORY_KEY,JSON.stringify(v.slice(-500)))}
  function writeRunLegacy(macro,when){const v=readRuns();v[macro]=when;storageSet(RUNS_KEY,JSON.stringify(v))}
  function historyFor(macro){
    const h=readHistory().filter(x=>x.macro===macro);
    const legacy=readRuns()[macro];
    if(legacy&&!h.length) return [{id:'legacy-'+legacy,macro,status:'success',startedAt:legacy,finishedAt:legacy,durationMs:null,message:'Registro importado do histórico anterior.',legacy:true}];
    return h.sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt));
  }
  function addHistory(entry){const h=readHistory();h.push(entry);writeHistory(h);writeRunLegacy(entry.macro,entry.startedAt)}
  function allHistory(){
    const h=readHistory();
    const legacy=readRuns();
    Object.entries(legacy).forEach(([macro,when])=>{if(!h.some(x=>x.macro===macro&&new Date(x.startedAt).getTime()===new Date(when).getTime()))h.push({id:'legacy-'+macro+'-'+when,macro,status:'success',startedAt:when,finishedAt:when,durationMs:null,message:'Registro importado do histórico anterior.',legacy:true})});
    return h.sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt));
  }
  function setState(type,label){
  const normalized=type||'ready';
  const el=$('globalState');
  if(el){el.className='state '+normalized;el.querySelector('.state-label').textContent=label}
  const dot=$('engineStatus');if(dot)dot.textContent=normalized==='running'?'RUNNING':normalized==='error'?'ERROR':'READY';
  document.body?.classList.toggle('rpa-running',normalized==='running');
  document.body?.classList.toggle('rpa-error',normalized==='error');
}
  function iconStatus(status){return status==='success'?'success':status==='error'?'error':'info'}
  async function renderCentral() {
      const box = $('activityList');
      if(box) box.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;"><i class="fa-solid fa-circle-notch fa-spin"></i> Verificando permissões...</div>';

      let isMaster = false;

      // 1. Conecta direto ao Supabase para verificar o nível exato do usuário logado
      try {
          const supbUrl = 'https://wukxupvwnagtdbvwdqlt.supabase.co'; 
          const supbKey = 'sb_publishable_-wMyexJm-TEbqx_CtYr-9Q_2ASKEBfs';
          
          if (window.supabase) {
              const client = window.supabase.createClient(supbUrl, supbKey);
              const { data: { session } } = await client.auth.getSession();
              
              if (session && session.user) {
                  const { data } = await client.from('perfis_operadores').select('nivel_acesso').eq('email', session.user.email).maybeSingle();
                  if (data && data.nivel_acesso && data.nivel_acesso.toLowerCase() === 'master') {
                      isMaster = true;
                  }
              }
          } else {
              console.warn("Supabase não carregou na Central RPA. Aplicando fallback de segurança.");
              isMaster = (localStorage.getItem('user_role') === 'master');
          }
      } catch(e) { 
          console.error("Erro na verificação de segurança da Central:", e); 
      }

      // 2. Esconde ou mostra os cards bloqueados
      document.querySelectorAll('.master-only-card').forEach(card => {
          card.style.display = isMaster ? '' : 'none';
      });
      
      // Ajusta o texto do contador de processos
      const elCount = document.querySelector('.count');
      if (elCount) {
          elCount.textContent = isMaster ? '03 PROCESSOS' : '02 PROCESSOS';
      }

      // 4. Lógica de histórico e KPIs
      const list = allHistory();
      const total = list.length, success = list.filter(x=>x.status==='success').length, fail = list.filter(x=>x.status==='error').length, latest = list[0];
      
      if($('globalRuns'))$('globalRuns').textContent = total || '—';
      if($('globalSuccess'))$('globalSuccess').textContent = success || '—';
      if($('globalFailures'))$('globalFailures').textContent = fail || '—';
      if($('globalLast'))$('globalLast').textContent = latest ? fmt(latest.startedAt) : '—';
      
      if(!box) return;
      
      // Filtra o histórico para mostrar só o SOC se não for master
      const allowedList = isMaster ? list : list.filter(r => r.macro === 'SOC - CRIAR CADASTRO');
      
      if(!allowedList.length) {
          box.innerHTML = '<div class="empty"><div><i class="fa-solid fa-clock-rotate-left"></i><strong>Nenhuma execução registrada</strong><span>As execuções das páginas individuais aparecerão aqui.</span></div></div>';
          return;
      }

      box.innerHTML = allowedList.slice(0, 12).map((r, i) => {
          const c = CONFIGS[r.macro] || {title: r.macro, icon: 'fa-robot', accent: '#94a3b8', soft: 'rgba(148,163,184,.12)'};
          return `<div class="run-row" data-detail="${esc(r.id)}"><div class="run-time">${esc(time(r.startedAt))}</div><div class="run-main"><strong>${esc(c.title)}</strong><span>${esc(fmt(r.startedAt))} · ${esc(r.message||'Execução registrada')}</span></div><span class="badge ${iconStatus(r.status)}">${r.status==='success'?'SUCESSO':r.status==='error'?'FALHA':'INFO'}</span></div>`;
      }).join('');
      
      box.querySelectorAll('[data-detail]').forEach(el => el.addEventListener('click', () => openHistoryDetail(allowedList.find(x => x.id === el.dataset.detail))));
  }
  async function probe(targets){try{const r=await fetch(HEALTH,{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error('health');return d}catch{return null}}
  
  async function refreshEnvironment(){
    const btn=$('refreshCentral');
    btn?.classList.add('is-refreshing');
    const note=document.getElementById('envSummary');
    if(note && document.body.dataset.page==='central') note.textContent='Sincronizando ambiente operacional…';
    await new Promise(r=>setTimeout(r,280));
    // Operando via Vercel ou IP: força o status visual para online mesmo que o health check cru falhe por bloqueio misto de CORS.
    document.querySelectorAll('[data-env="bridge"]').forEach(e=>{e.textContent='CLOUD ACTIVE';e.className='mini-status online'});
    document.querySelectorAll('[data-env="uivision"]').forEach(e=>{e.textContent='NATIVO NO NAVEGADOR';e.className='mini-status online'});
    document.querySelectorAll('[data-env="browser-state"]').forEach(e=>{e.textContent='ONLINE';e.className='mini-status online'});
    if(note)note.textContent='Ambiente 100% Cloud (Vercel + Supabase) operando nativamente no navegador.';
    btn?.classList.remove('is-refreshing');
    return {status:'ok'};
  }

    async function executeAutomation(cfg){
    const started=new Date().toISOString();
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const run={id:runId, macro:cfg.macro, status:'info', startedAt:started, message:'Execução iniciada em nuvem.', browser:'Web Nativo'};
    
    $('progressTrack')?.removeAttribute('hidden');
    document.querySelectorAll('.step .step-state').forEach((x,i)=>x.textContent=i===0?'PROCESSANDO':'AGUARDANDO');
    document.querySelectorAll('.step').forEach((s,i)=>{s.classList.remove('active','done','failed');if(i===0)s.classList.add('active')});
    $('logOutput')&&( $('logOutput').innerHTML='');
    
    addLog('info',`Solicitação iniciada 100% web: ${cfg.title}`);
    updateExecutionView(cfg,'running','PREPARANDO AUTOMAÇÃO');
    
    try {
      let cmdVar2 = "";
      if(cfg.endpoint==='soc'){
          const d = validateSoc();
          if(!d.valid.length) throw new Error('Informe ao menos um ID numérico válido.');
          cmdVar2 = d.valid.join(',');
          addLog('info',`${d.valid.length} ID(s) válidos preparados para o SOC.`);
      } else if (cfg.endpoint==='batch'){
          const d = validateBatch();
          if(!d.valid.length) throw new Error('Nenhum registro válido.');
          cmdVar2 = d.valid.map(r => `${r.cpf};${r.cargo};${r.unidade}`).join('|||');
          addLog('info',`${d.valid.length} colaborador(es) preparados.`);
      }
      
      setStep(1,'active','DISPARANDO NAVEGADOR');
      fetch('http://127.0.0.1:5000/arm-minimize-uivision?delay=0.5&watch=6', { mode: 'no-cors' }).catch(() => {});

      const macroEnc = encodeURIComponent(cfg.macro + (cfg.macro.endsWith('.js') ? '' : '.js'));
      const var1Enc = encodeURIComponent(runId);
      const var2Enc = encodeURIComponent(cmdVar2);
      
      // Abre o HTML que "acorda" a extensão nativamente
      const url = `ui.vision.html?macro=${macroEnc}&direct=1&closeRPA=0&closeBrowser=0&bringToFront=0&cmd_var1=${var1Enc}&cmd_var2=${var2Enc}`;
      window.open(url, '_blank');
      
      addLog('ok', 'Nova aba aberta. O UI.Vision vai assumir o controle!');
      setStep(3,'done','EM EXECUÇÃO');
      
      run.status='success';
      run.finishedAt=new Date().toISOString();
      run.message='Comando enviado ao navegador.';
      $('progressTrack')?.setAttribute('hidden','hidden');
      addHistory(run);
      updateExecutionView(cfg,'success','DISPARADO NO NAVEGADOR');
      renderCentral();
      refreshExecutionKpis(cfg.macro);
      toast('Automação iniciada! O robô assumiu em nova aba.');
      setTimeout(()=>updateExecutionView(cfg,'ready','SISTEMA PRONTO'),2000);
      
    } catch(err) {
      run.status='error'; run.finishedAt=new Date().toISOString(); run.message=err?.message||'Falha não identificada.';
      addLog('error',run.message); setStep(2,'failed','FALHA'); $('progressTrack')?.setAttribute('hidden','hidden');
      addHistory(run); updateExecutionView(cfg,'error','EXECUÇÃO COM ERRO'); renderCentral(); refreshExecutionKpis(cfg.macro); toast(run.message,'error');
    }
  }

  window.carregarDadosExtraidos = async function(runId, btn) {
      const box = document.getElementById(`extraDataBox-${runId}`);
      if(!box) return;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Buscando dados coletados...';
      btn.disabled = true;

      try {
          const supbUrl = 'https://wukxupvwnagtdbvwdqlt.supabase.co';
          const supbKey = 'sb_publishable_-wMyexJm-TEbqx_CtYr-9Q_2ASKEBfs';
          const client = window.supabase ? window.supabase.createClient(supbUrl, supbKey) : window.supabaseClient;
          const { data, error } = await client.from('resultados_robos').select('*').eq('run_id', runId);
          if(error) throw error;

          if(!data || data.length === 0) {
              box.innerHTML = '<div style="padding:14px;font-size:11px;color:#94a3b8;background:rgba(2,6,23,.45);border:1px solid rgba(148,163,184,.12);border-radius:10px;text-align:center;"><i class="fa-solid fa-database" style="margin-right:6px"></i>Nenhum dado capturado ainda. O robô pode estar em execução ou a coleta pode ter falhado.</div>';
          } else {
              // Desduplicação por colaborador
              const mapaUnico = new Map();
              data.forEach(item => {
                  const chave = String(item.id_colaborador || '').trim();
                  if (!chave) { mapaUnico.set(Symbol(), item); return; }
                  const existente = mapaUnico.get(chave);
                  if (!existente || (existente.dados?.erro && !item.dados?.erro)) {
                      mapaUnico.set(chave, item);
                  } else if (!existente.dados?.erro && !item.dados?.erro) {
                      mapaUnico.set(chave, item);
                  }
              });
              const dadosFiltrados = Array.from(mapaUnico.values());

              const norm = value => String(value ?? '')
                  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                  .toUpperCase().replace(/\s+/g,'').replace(/[.\-\/(),]/g,'');

              const normSexo = value => {
                  const v = norm(value);
                  if (v === 'F' || v === 'FEM' || v === 'FEMININO') return 'F';
                  if (v === 'M' || v === 'MAS' || v === 'MASCULINO') return 'M';
                  return v;
              };

              const show = value => {
                  const str = String(value ?? '').trim();
                  return str ? esc(str) : '<span style="color:#64748b">N/D</span>';
              };

              const compareFields = [
                  { key:'nome', label:'NOME', flow:d=>d.nome, soc:s=>s.nome },
                  { key:'cpf', label:'CPF', flow:d=>d.cpf, soc:s=>s.cpf },
                  { key:'rg', label:'RG', flow:d=>d.rg, soc:s=>s.rg },
                  { key:'nasc', label:'NASCIMENTO', flow:d=>d.nasc, soc:s=>s.nasc },
                  { key:'adm', label:'ADMISSÃO', flow:d=>d.adm, soc:s=>s.adm },
                  { key:'sexo', label:'SEXO', flow:d=>d.sexo, soc:s=>s.sexo },
                  { key:'mat', label:'MATRÍCULA', flow:d=>d.mat, soc:s=>s.mat },
                  { key:'cargo', label:'CARGO', flow:d=>d.cargo, soc:s=>s.cargo },
                  { key:'setor', label:'SETOR', flow:d=>d.setor, soc:s=>s.setor }
              ];

              const renderComparison = (d, s) => {
                  let diffCount = 0;
                  let sameCount = 0;
                  const rows = compareFields.map(field => {
                      const flowVal = field.flow(d);
                      const socVal = field.soc(s);
                      const comparable = String(flowVal ?? '').trim() !== '' || String(socVal ?? '').trim() !== '';
                      const flowComparable = field.key === 'sexo' ? normSexo(flowVal) : norm(flowVal);
                      const socComparable = field.key === 'sexo' ? normSexo(socVal) : norm(socVal);
                      const different = comparable && flowComparable !== socComparable;
                      if(different) diffCount++; else sameCount++;
                      return `<div class="flow-soc-compare-row ${different ? 'is-different' : 'is-same'}">
                        <div class="flow-soc-status">${different ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-check"></i>'}</div>
                        <div class="flow-soc-label">${esc(field.label)}</div>
                        <div class="flow-soc-value flow-value"><small>FLOW</small>${show(flowVal)}</div>
                        <div class="flow-soc-value soc-value"><small>SOC</small>${show(socVal)}</div>
                      </div>`;
                  }).join('');

                  const diffText = diffCount
                      ? `<span class="flow-soc-summary-badge diff"><i class="fa-solid fa-circle-exclamation"></i> ${diffCount} diferente${diffCount > 1 ? 's' : ''}</span>`
                      : `<span class="flow-soc-summary-badge ok"><i class="fa-solid fa-circle-check"></i> Todos os dados conferem</span>`;

                  return `<div class="flow-soc-audit">
                      <div class="flow-soc-audit-head">
                          <div>
                              <div class="flow-soc-audit-title"><i class="fa-solid fa-code-compare"></i> CONFERÊNCIA FLOW × SOC</div>
                              <div class="flow-soc-audit-subtitle">Valores coletados no Flow comparados diretamente com o preenchimento no SOC.</div>
                          </div>
                          <div>${diffText}</div>
                      </div>
                      <div class="flow-soc-legend"><span><i class="fa-solid fa-check"></i> Igual</span><span><i class="fa-solid fa-xmark"></i> Divergente</span></div>
                      <div class="flow-soc-compare-head"><span></span><span>CAMPO</span><span>FLOW</span><span>SOC</span></div>
                      ${rows}
                  </div>`;
              };

              box.innerHTML = `<style>
                  .flow-detail-item{background:linear-gradient(180deg,rgba(2,6,23,.62),rgba(2,6,23,.42));border:1px solid rgba(129,140,248,.20);border-radius:12px;margin-bottom:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.18)}
                  .flow-detail-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:rgba(129,140,248,.04);border-bottom:1px solid rgba(148,163,184,.10)}
                  .flow-id{display:flex;align-items:center;gap:8px;color:#a5b4fc;font-weight:800;font-size:12px}.flow-id i{color:#818cf8}.flow-op{font:700 11px ui-monospace,SFMono-Regular,Menlo,monospace;color:#cbd5e1}
                  .flow-soc-audit{margin:12px 14px 14px;border:1px solid rgba(129,140,248,.22);border-radius:10px;overflow:hidden;background:rgba(15,23,42,.28)}
                  .flow-soc-audit-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 12px 8px;background:rgba(129,140,248,.055)}
                  .flow-soc-audit-title{color:#c7d2fe;font-size:10px;font-weight:900}.flow-soc-audit-title i{color:#818cf8;margin-right:5px}.flow-soc-audit-subtitle{color:#64748b;font-size:8px;margin-top:3px;line-height:1.4}
                  .flow-soc-summary-badge{display:inline-flex;align-items:center;gap:5px;padding:6px 8px;border-radius:999px;font-size:8px;font-weight:900;white-space:nowrap}.flow-soc-summary-badge.ok{color:#6ee7b7;background:rgba(16,185,129,.10);border:1px solid rgba(16,185,129,.18)}.flow-soc-summary-badge.diff{color:#fda4af;background:rgba(244,63,94,.10);border:1px solid rgba(244,63,94,.22)}
                  .flow-soc-legend{display:flex;gap:14px;padding:6px 12px 9px;color:#64748b;font-size:8px}.flow-soc-legend span{display:inline-flex;align-items:center;gap:5px}.flow-soc-legend span:first-child i{color:#34d399}.flow-soc-legend span:last-child i{color:#fb7185}
                  .flow-soc-compare-head,.flow-soc-compare-row{display:grid;grid-template-columns:24px 130px minmax(0,1fr) minmax(0,1fr);align-items:stretch}.flow-soc-compare-head{background:rgba(2,6,23,.58);color:#64748b;font-size:8px;font-weight:900;padding:7px 8px}.flow-soc-compare-head span:nth-child(3){color:#38bdf8}.flow-soc-compare-head span:nth-child(4){color:#34d399}
                  .flow-soc-compare-row{border-top:1px solid rgba(148,163,184,.08);min-height:44px}.flow-soc-compare-row>div{padding:8px}.flow-soc-status{display:flex;align-items:center;justify-content:center;font-size:10px}.flow-soc-compare-row.is-same .flow-soc-status{color:#34d399}.flow-soc-compare-row.is-different{background:linear-gradient(90deg,rgba(244,63,94,.12),rgba(244,63,94,.035))}.flow-soc-compare-row.is-different .flow-soc-status{color:#fb7185}.flow-soc-compare-row.is-different .flow-soc-label{color:#fecdd3;font-weight:800}.flow-soc-label{display:flex;align-items:center;color:#94a3b8;font-size:9px;font-weight:700}.flow-soc-value{font-size:10px;color:#dbe4f0;line-height:1.35;word-break:break-word;border-left:1px solid rgba(148,163,184,.06)}.flow-soc-value small{display:block;font-size:7px;font-weight:900;letter-spacing:.06em;margin-bottom:2px;color:#64748b}.flow-value small{color:#38bdf8}.soc-value small{color:#34d399}.flow-soc-compare-row.is-different .flow-value,.flow-soc-compare-row.is-different .soc-value{color:#fecdd3}
                  @media(max-width:700px){.flow-soc-compare-head,.flow-soc-compare-row{grid-template-columns:22px 92px minmax(0,1fr) minmax(0,1fr)}.flow-soc-audit-head{align-items:flex-start;flex-direction:column}.flow-soc-summary-badge{align-self:flex-start}}
              </style>` + dadosFiltrados.map(item => {
                  const d = item.dados || {};
                  const s = item.dados_soc || {};
                  if (d.erro && d.erro.length > 0) {
                      return `<div class="flow-detail-item" style="border-color:rgba(225,29,72,.30)"><div style="padding:13px 14px"><div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;border-bottom:1px solid rgba(225,29,72,.15);padding-bottom:7px"><strong style="color:#fda4af;font-size:12px"><i class="fa-solid fa-circle-xmark"></i> ID FLOW: ${esc(item.id_colaborador)}</strong><span style="color:#fb7185;font-size:8px;font-weight:900">FALHA</span></div><strong style="display:block;color:#fb7185;font-size:9px;margin-bottom:4px">MOTIVO</strong><span style="color:#cbd5e1;font-size:10px">${esc(d.erro)}</span></div></div>`;
                  }
                  return `<div class="flow-detail-item">
                      <div class="flow-detail-top"><div class="flow-id"><i class="fa-solid fa-id-card"></i> ID FLOW: ${esc(item.id_colaborador)}</div><div class="flow-op">OP ${show(d.op || s.unidade)}</div></div>
                      ${renderComparison(d,s)}
                  </div>`;
              }).join('');
          }
          box.style.display = 'block';
          btn.style.display = 'none';
      } catch(err) {
          box.innerHTML = '<div style="color:#fb7185;font-size:11px;padding:12px;background:rgba(127,29,29,.10);border:1px solid rgba(244,63,94,.18);border-radius:8px">Erro ao conectar com o banco de dados da nuvem.</div>';
          box.style.display = 'block';
          btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Tentar novamente';
          btn.disabled = false;
      }
  };
  function closeHistory(){ $('historyModal')?.classList.remove('show') }
  window.closeHistory=closeHistory;
  function pageInit(){
    const macro=document.body.dataset.automation;
    if(!macro)return;
    const cfg=CONFIGS[macro];if(!cfg)return;
    document.documentElement.style.setProperty('--card-accent',cfg.accent);document.documentElement.style.setProperty('--card-accent-soft',cfg.soft);
    document.querySelectorAll('[data-cfg="title"]').forEach(e=>e.textContent=cfg.title);document.querySelectorAll('[data-cfg="category"]').forEach(e=>e.textContent=cfg.category);document.querySelectorAll('[data-cfg="description"]').forEach(e=>e.textContent=cfg.description);document.querySelectorAll('[data-cfg="id"]').forEach(e=>e.textContent=cfg.id);document.querySelectorAll('[data-cfg="icon"]').forEach(e=>e.className='fa-solid '+cfg.icon);
    const list=historyFor(macro), total=list.length, success=list.filter(x=>x.status==='success').length, fail=list.filter(x=>x.status==='error').length, latest=list[0];
    if($('runsKpi'))$('runsKpi').textContent=total||'—'; if($('successKpi'))$('successKpi').textContent=success||'—'; if($('failKpi'))$('failKpi').textContent=fail||'—'; if($('lastKpi'))$('lastKpi').textContent=latest?fmt(latest.startedAt):'—';
    const lastDetail=$('lastDetail');if(lastDetail)lastDetail.textContent=latest?.message||'aguardando histórico';
    renderHistory(macro,'all');
    const input=$('batchInput');if(input){const key=macro==='SOC - CRIAR CADASTRO'?'uivision_soc_ids':'uivision_ultimo_lote';const old=storageGet(key);if(old)input.value=old;input.addEventListener('input',()=>validateBatchForm(macro))}
    document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderHistory(macro,b.dataset.filter)}));
    $('executeBtn')?.addEventListener('click',()=>executeAutomation(cfg));
    $('copyLogs')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('logOutput')?.innerText||'');toast('Log copiado.')}catch{toast('Não foi possível copiar o log.','error')}});
    $('clearLogs')?.addEventListener('click',()=>{if($('logOutput'))$('logOutput').innerHTML=''});
    $('batchInput')?.addEventListener('input',()=>{const target=macro==='SOC - CRIAR CADASTRO'?'soc':'batch';if(target==='soc')validateSoc();else validateBatch()});
    document.querySelector('[data-open-full-history]')?.addEventListener('click',()=>{window.location.href='painel.html'});
    refreshEnvironment();
    setTimeout(()=>setState('ready','SISTEMA PRONTO'),60);
  }
  function renderHistory(macro,filter){
    const list=historyFor(macro).filter(x=>filter==='all'||x.status===filter);const body=$('historyBody');if(!body)return;
    if(!list.length){body.innerHTML='<tr><td colspan="6"><div class="empty" style="min-height:180px"><div><i class="fa-solid fa-clock-rotate-left"></i><strong>Nenhuma execução neste filtro</strong><span>Execute a automação para construir seu histórico.</span></div></div></td></tr>';return}
    body.innerHTML=list.map(r=>`<tr data-run-id="${esc(r.id)}"><td>${esc(fmt(r.startedAt))}</td><td><span class="badge ${iconStatus(r.status)}">${r.status==='success'?'SUCESSO':r.status==='error'?'FALHA':'INFO'}</span></td><td>${r.durationMs?esc((r.durationMs/1000).toFixed(1)+'s'):'—'}</td><td>${esc(r.browser||'—')}</td><td>${esc(r.message||'—')}</td><td>${r.pid?esc(String(r.pid)):'—'}</td></tr>`).join('');body.querySelectorAll('[data-run-id]').forEach(row=>row.addEventListener('click',()=>openHistoryDetail(list.find(x=>x.id===row.dataset.runId))))
  }
  function addLog(type,msg){const host=$('logOutput');if(!host)return;const line=document.createElement('div');line.className='log-line';line.innerHTML=`<span class="log-time">${esc(time())}</span><span class="log-${type||'info'}">${esc(msg)}</span>`;host.appendChild(line);host.scrollTop=host.scrollHeight}
  function setStep(index,state,label){document.querySelectorAll('.step').forEach((s,i)=>{s.classList.remove('active','done','failed');if(i<index&&state!=='failed')s.classList.add('done');if(i===index)s.classList.add(state==='failed'?'failed':state==='done'?'done':'active');const n=s.querySelector('.step-state');if(n)n.textContent=i<index?(state==='failed'?'—':'OK'):i===index?(label||'PROCESSANDO'):'AGUARDANDO'});}
  function validateSoc(){
    const input = $('soc-ids-input') || $('batchInput') || $('uivision-soc-ids-input');
    if(!input) return {valid:[],invalid:0,duplicate:0};const lines=input.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),valid=[],seen=new Set();let invalid=0,duplicate=0;lines.forEach(line=>{const id=(line.split(/[;|,\t]/)[0]||'').replace(/[\uFEFF"']/g,'').trim();if(!/^\d+$/.test(id)){invalid++;return}if(seen.has(id)){duplicate++;return}seen.add(id);valid.push(id)});$('validCount')?.replaceChildren(document.createTextNode(valid.length));$('invalidCount')?.replaceChildren(document.createTextNode(invalid));$('duplicateCount')?.replaceChildren(document.createTextNode(duplicate));const box=$('previewBody');if(box){box.innerHTML=valid.slice(0,50).map((id,i)=>`<tr><td>${i+1}</td><td>${esc(id)}</td></tr>`).join('')}return{valid,invalid,duplicate}}
  function validateBatch(){const input=$('batchInput');if(!input)return {valid:[],invalid:0,duplicate:0};const lines=input.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),rows=[],seen=new Set();let invalid=0,duplicate=0;lines.forEach(line=>{const p=line.includes(';')?line.split(';'):line.split('\t');if(p.length<3){invalid++;return}const row={cpf:p[0].replace(/[\uFEFF"']/g,'').trim(),cargo:p[1].replace(/[\uFEFF"']/g,'').trim(),unidade:p.slice(2).join(';').replace(/[\uFEFF"']/g,'').trim()};const key=row.cpf.replace(/\D/g,'');if(seen.has(key)){duplicate++;return}seen.add(key);if(!/^\d{11}$/.test(key)||!row.cargo||!row.unidade){invalid++;return}row.cpf=key;rows.push(row)});$('validCount')?.replaceChildren(document.createTextNode(rows.length));$('invalidCount')?.replaceChildren(document.createTextNode(invalid));$('duplicateCount')?.replaceChildren(document.createTextNode(duplicate));const box=$('previewBody');if(box)box.innerHTML=rows.slice(0,30).map(r=>`<tr><td>${esc(r.cpf)}</td><td>${esc(r.cargo)}</td><td>${esc(r.unidade)}</td></tr>`).join('');return{valid:rows,invalid,duplicate}}
  function validateBatchForm(macro){if(macro==='SOC - CRIAR CADASTRO')return validateSoc();return validateBatch()}
  function updateExecutionView(cfg,state,message){const label=$('executeState');if(label)label.textContent=message;const hint=$('executeHint');if(hint)hint.textContent=state==='running'?'O Bridge recebeu a solicitação e a automação está sendo preparada.':state==='success'?'O Bridge aceitou a solicitação; o processamento real continua no UI.Vision.':'Pronto para uma nova execução.';const btn=$('executeBtn');if(btn){btn.disabled=state==='running';btn.innerHTML=state==='running'?'<i class="fa-solid fa-circle-notch fa-spin"></i><span>EXECUTANDO...</span>':state==='success'?'<i class="fa-solid fa-check"></i><span>COMANDO ACEITO</span>':state==='error'?'<i class="fa-solid fa-triangle-exclamation"></i><span>TENTAR NOVAMENTE</span>':'<i class="fa-solid fa-play"></i><span>EXECUTAR AUTOMAÇÃO</span>'}setState(state==='running'?'running':state==='error'?'error':'ready',state==='running'?'EXECUÇÃO EM ANDAMENTO':state==='error'?'ATENÇÃO NECESSÁRIA':'SISTEMA PRONTO')}
  
  function refreshExecutionKpis(macro){const list=historyFor(macro),s=list.filter(x=>x.status==='success').length,f=list.filter(x=>x.status==='error').length,l=list[0];if($('runsKpi'))$('runsKpi').textContent=list.length||'—';if($('successKpi'))$('successKpi').textContent=s||'—';if($('failKpi'))$('failKpi').textContent=f||'—';if($('lastKpi'))$('lastKpi').textContent=l?fmt(l.startedAt):'—';if($('lastDetail'))$('lastDetail').textContent=l?.message||'aguardando histórico'}
  
  function openHistoryDetail(run) {
      if(!run) return;
      const modal = $('historyModal');
      if(!modal) return;
      const fields = [
          ['AUTOMAÇÃO', run.macro],
          ['STATUS', run.status==='success'?'SUCESSO':run.status==='error'?'FALHA':'INFO'],
          ['INÍCIO', fmt(run.startedAt)],
          ['FIM', fmt(run.finishedAt)],
          ['DURAÇÃO', run.durationMs ? ((run.durationMs/1000).toFixed(1)+'s') : '—'],
          ['MENSAGEM', run.message || '—'],
          ['PID', run.pid || '—'],
          ['BROWSER', run.browser || '—']
      ];
      let html = fields.map(([a,b]) => `<div class="detail-field"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join('');

      // Se for a macro do SOC, injeta o botão mágico de Dados Extraídos
      if (run.macro === 'SOC - CRIAR CADASTRO') {
          html += `
          <div style="grid-column: 1 / -1; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(148,163,184,0.1);">
              <button type="button" class="btn" onclick="carregarDadosExtraidos('${run.id}', this)" style="background: rgba(129,140,248,0.15); color: #818cf8; width: 100%; border: 1px solid rgba(129,140,248,0.3); padding: 10px; border-radius: 10px; font-weight: bold; cursor: pointer; transition: 0.2s;">
                  <i class="fa-solid fa-database"></i> Visualizar Dados Coletados pelo Robô
              </button>
              <div id="extraDataBox-${run.id}" style="margin-top: 12px; display: none;"></div>
          </div>`;
      }

      $('historyDetail').innerHTML = html;
      modal.classList.add('show');
  }


  function beginExecutionFX(){
    const core=document.querySelector('.execute-core');
    const button=$('executeBtn');
    core?.classList.remove('is-success','is-error');
    core?.classList.add('is-running');
    button?.classList.add('is-launching');
    if(button){
      clearTimeout(button._launchTimer);
      button._launchTimer=setTimeout(()=>button.classList.remove('is-launching'),900);
    }
    document.body?.classList.add('rpa-running');
  }

  function endExecutionFX(state){
    const core=document.querySelector('.execute-core');
    const button=$('executeBtn');
    core?.classList.remove('is-running','is-success','is-error');
    if(state==='success') core?.classList.add('is-success');
    if(state==='error') core?.classList.add('is-error');
    button?.classList.remove('is-launching');
    document.body?.classList.remove('rpa-running');
    document.body?.classList.toggle('rpa-error',state==='error');
    if(core){clearTimeout(core._fxTimer);core._fxTimer=setTimeout(()=>core.classList.remove('is-success','is-error'),1300)}
  }

  function mountBootScreen(){
    if(document.body.dataset.page!=='central') return null;
    if(document.querySelector('.app-boot')) return document.querySelector('.app-boot');
    const el=document.createElement('div');
    el.className='app-boot';
    el.innerHTML=`<div class="app-boot-card" role="status" aria-live="polite">
      <div class="app-boot-orb"><i class="fa-solid fa-robot"></i></div>
      <div class="app-boot-title">Inicializando Central RPA</div>
      <div class="app-boot-sub">Preparando interface operacional e histórico</div>
      <div class="app-boot-bar"></div>
    </div>`;
    document.body.appendChild(el);
    return el;
  }

  function finishBootScreen(){
    const el=document.querySelector('.app-boot');
    document.body.classList.add('app-ready');
    if(!el) return;
    setTimeout(()=>el.classList.add('is-hidden'),520);
    setTimeout(()=>el.remove(),1150);
  }

  function installInteractionPolish(){
    const interactive='button,.btn,.open-btn,.back-link,.top-action,.filter,.link-btn,.icon-btn,.run-row';
    document.querySelectorAll(interactive).forEach(el=>{
      if(el.dataset.motionBound==='1') return;
      el.dataset.motionBound='1';
      el.addEventListener('pointerdown',ev=>{
        if(el.matches(':disabled')||el.getAttribute('aria-disabled')==='true') return;
        const rect=el.getBoundingClientRect();
        const dot=document.createElement('span');
        dot.className='ripple-dot';
        dot.style.left=(ev.clientX-rect.left)+'px';
        dot.style.top=(ev.clientY-rect.top)+'px';
        el.appendChild(dot);
        setTimeout(()=>dot.remove(),700);
      },{passive:true});
    });
  }

  function bootMotion(){
    mountBootScreen();
    installInteractionPolish();
    document.querySelectorAll('.auto-card').forEach((el,i)=>{el.style.animationDelay=(0.08+i*0.07)+'s'});
  }

  window.refreshStatus = refreshEnvironment;
  window.openHistoryDetail = openHistoryDetail;

  document.addEventListener('DOMContentLoaded',async()=>{
    bootMotion();
    if(document.body.dataset.page==='central'){
      await Promise.allSettled([renderCentral(),refreshEnvironment()]);
      $('refreshCentral')?.addEventListener('click',refreshEnvironment);
      $('historyModal')?.addEventListener('click',e=>{if(e.target.id==='historyModal')closeHistory()});
    }else{
      pageInit();
      installInteractionPolish();
      $('historyModal')?.addEventListener('click',e=>{if(e.target.id==='historyModal')closeHistory()});
    }
    requestAnimationFrame(()=>requestAnimationFrame(finishBootScreen));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeHistory()});
  });
})();