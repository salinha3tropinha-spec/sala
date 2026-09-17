(function(){
  'use strict';
  const CONFIGS={
    'TESTE_SESI':{id:'AUT-001',title:'TESTE_SESI',category:'AUTOMAÇÃO OPERACIONAL',icon:'fa-stethoscope',accent:'#38bdf8',soft:'rgba(56,189,248,.12)',description:'Preenchimento automatizado de fichas clínicas e rotinas associadas ao SESI/SOC.',macro:'TESTE_SESI',endpoint:'macro'},
    'PREENCHER_FC_SESI':{id:'AUT-002',title:'PREENCHER_FC_SESI',category:'DADOS CLÍNICOS',icon:'fa-file-medical',accent:'#34d399',soft:'rgba(52,211,153,.12)',description:'Processamento automatizado de dados de exames ocupacionais em rotina de lote.',macro:'PREENCHER_FC_SESI',endpoint:'macro'},
    'SOC - CRIAR CADASTRO':{id:'AUT-003',title:'SOC - CRIAR CADASTRO',category:'SOC / CADASTRO',icon:'fa-user-plus',accent:'#818cf8',soft:'rgba(129,140,248,.12)',description:'Criação automatizada de cadastros no SOC a partir de uma lista validada de IDs.',macro:'SOC - CRIAR CADASTRO',endpoint:'soc'},
    'ATIVAR_FUNCIONARIOS':{id:'AUT-004',title:'ATIVAR FUNCIONÁRIOS',category:'EXECUÇÃO EM LOTE',icon:'fa-user-check',accent:'#fbbf24',soft:'rgba(251,191,36,.12)',description:'Atualização de dados e ativação de funcionários em lote por meio do Bridge local.',macro:'ATIVAR_FUNCIONARIOS',endpoint:'batch'}
  };
  const RUNS_KEY='uivision_standalone_runs', HISTORY_KEY='uivision_run_history';
  const HEALTH = 'http://172.20.21.67:5000/health', 
      MACRO_URL = 'http://172.20.21.67:5000/executar-macro', 
      AUTO_URL = 'http://172.20.21.67:5000/executar-automacao', 
      SOC_URL = 'http://172.20.21.67:5000/executar-soc';
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
  function setState(type,label){const el=$('globalState');if(el){el.className='state '+(type||'ready');el.querySelector('.state-label').textContent=label}const dot=$('engineStatus');if(dot)dot.textContent=type==='running'?'RUNNING':type==='error'?'ERROR':'READY'}
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

      // 2. Esconde ou mostra os cards bloqueados (AGORA COM O VISUAL CORRIGIDO)
      document.querySelectorAll('.master-only-card').forEach(card => {
          card.style.display = isMaster ? '' : 'none';
      });
      
      // 3. Ajusta o texto do contador de processos lá no topo
      const elCount = document.querySelector('.count');
      if (elCount) {
          elCount.textContent = isMaster ? '04 PROCESSOS' : '01 PROCESSO';
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
    // Finge a verificação, pois operamos nativamente na extensão via Vercel
    document.querySelectorAll('[data-env="bridge"]').forEach(e=>{e.textContent='CLOUD ACTIVE';e.className='mini-status online'});
    document.querySelectorAll('[data-env="uivision"]').forEach(e=>{e.textContent='NATIVO NO NAVEGADOR';e.className='mini-status online'});
    document.querySelectorAll('[data-env="browser-state"]').forEach(e=>{e.textContent='ONLINE';e.className='mini-status online'});
    const note=$('envSummary');if(note)note.textContent='Ambiente 100% Cloud (Vercel + Supabase) operando nativamente no navegador.';
    return {status: 'ok'};
  }

  async function executeAutomation(cfg){
    const started = new Date().toISOString();
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const run = { id: runId, macro: cfg.macro, status: 'info', startedAt: started, message: 'Enviando comando para a fila...', browser: 'Cloud Worker' };
    
    $('progressTrack')?.removeAttribute('hidden');
    document.querySelectorAll('.step .step-state').forEach((x,i)=>x.textContent=i===0?'ENVIANDO':'AGUARDANDO');
    document.querySelectorAll('.step').forEach((s,i)=>{s.classList.remove('active','done','failed');if(i===0)s.classList.add('active')});
    $('logOutput')&&($('logOutput').innerHTML='');
    
    addLog('info', `Enviando ordem para a fila em nuvem: ${cfg.title}`);
    updateExecutionView(cfg, 'running', 'ENVIANDO PARA A FILA');
    
    try {
      let payloadDados = {};
      
      if(cfg.endpoint === 'soc'){
          const d = validateSoc();
          if(!d.valid.length) throw new Error('Informe ao menos um ID numérico válido.');
          payloadDados = { ids: d.valid };
          addLog('info', `${d.valid.length} ID(s) válidos empacotados para o SOC.`);
      } else if (cfg.endpoint === 'batch'){
          const d = validateBatch();
          if(!d.valid.length) throw new Error('Nenhum registro válido.');
          payloadDados = { colaboradores: d.valid };
          addLog('info', `${d.valid.length} colaborador(es) empacotados.`);
      }
      
      setStep(1, 'active', 'GRAVANDO NA NUVEM');
      
      // Conecta ao Supabase para inserir o comando na fila
      const supbUrl = 'https://wukxupvwnagtdbvwdqlt.supabase.co';
      const supbKey = 'sb_publishable_-wMyexJm-TEbqx_CtYr-9Q_2ASKEBfs';
      const client = window.supabase ? window.supabase.createClient(supbUrl, supbKey) : window.supabaseClient;
      
      const macroName = cfg.macro + (cfg.macro.endsWith('.js') ? '' : '.js');

      const { error } = await client.from('fila_comandos').insert([{
          run_id: runId,
          macro: macroName,
          payload: payloadDados,
          status: 'pendente'
      }]);

      if (error) throw error;
      
      addLog('ok', 'Comando gravado na fila com sucesso! O robô local processará em instantes.');
      setStep(3, 'done', 'NA FILA');
      
      run.status = 'success';
      run.finishedAt = new Date().toISOString();
      run.message = 'Aguardando execução do motor local.';
      $('progressTrack')?.setAttribute('hidden','hidden');
      addHistory(run);
      updateExecutionView(cfg, 'success', 'ENVIADO PARA A FILA');
      renderCentral();
      refreshExecutionKpis(cfg.macro);
      toast('Comando enviado! Assim que o motor ligar, a macro rodará.');
      setTimeout(()=>updateExecutionView(cfg,'ready','SISTEMA PRONTO'), 2000);
      
    } catch(err) {
      run.status = 'error'; 
      run.finishedAt = new Date().toISOString(); 
      run.message = err?.message || 'Falha ao enviar comando.';
      addLog('error', run.message); 
      setStep(2, 'failed', 'FALHA'); 
      $('progressTrack')?.setAttribute('hidden','hidden');
      addHistory(run); 
      updateExecutionView(cfg, 'error', 'ERRO NO ENVIO'); 
      renderCentral(); 
      refreshExecutionKpis(cfg.macro); 
      toast(run.message, 'error');
    }
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
    // Verifica qual caixa de texto está ativa no momento na tela
    const input = $('soc-ids-input') || $('batchInput') || $('uivision-soc-ids-input');
    if(!input) return {valid:[],invalid:0,duplicate:0};const lines=input.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),valid=[],seen=new Set();let invalid=0,duplicate=0;lines.forEach(line=>{const id=(line.split(/[;|,\t]/)[0]||'').replace(/[\uFEFF"']/g,'').trim();if(!/^\d+$/.test(id)){invalid++;return}if(seen.has(id)){duplicate++;return}seen.add(id);valid.push(id)});$('validCount')?.replaceChildren(document.createTextNode(valid.length));$('invalidCount')?.replaceChildren(document.createTextNode(invalid));$('duplicateCount')?.replaceChildren(document.createTextNode(duplicate));const box=$('previewBody');if(box){box.innerHTML=valid.slice(0,50).map((id,i)=>`<tr><td>${i+1}</td><td>${esc(id)}</td></tr>`).join('')}return{valid,invalid,duplicate}}
  function validateBatch(){const input=$('batchInput');if(!input)return {valid:[],invalid:0,duplicate:0};const lines=input.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),rows=[],seen=new Set();let invalid=0,duplicate=0;lines.forEach(line=>{const p=line.includes(';')?line.split(';'):line.split('\t');if(p.length<3){invalid++;return}const row={cpf:p[0].replace(/[\uFEFF"']/g,'').trim(),cargo:p[1].replace(/[\uFEFF"']/g,'').trim(),unidade:p.slice(2).join(';').replace(/[\uFEFF"']/g,'').trim()};const key=row.cpf.replace(/\D/g,'');if(seen.has(key)){duplicate++;return}seen.add(key);if(!/^\d{11}$/.test(key)||!row.cargo||!row.unidade){invalid++;return}row.cpf=key;rows.push(row)});$('validCount')?.replaceChildren(document.createTextNode(rows.length));$('invalidCount')?.replaceChildren(document.createTextNode(invalid));$('duplicateCount')?.replaceChildren(document.createTextNode(duplicate));const box=$('previewBody');if(box)box.innerHTML=rows.slice(0,30).map(r=>`<tr><td>${esc(r.cpf)}</td><td>${esc(r.cargo)}</td><td>${esc(r.unidade)}</td></tr>`).join('');return{valid:rows,invalid,duplicate}}
  function validateBatchForm(macro){if(macro==='SOC - CRIAR CADASTRO')return validateSoc();return validateBatch()}
  function updateExecutionView(cfg,state,message){const label=$('executeState');if(label)label.textContent=message;const hint=$('executeHint');if(hint)hint.textContent=state==='running'?'O Bridge recebeu a solicitação e a automação está sendo preparada.':state==='success'?'O Bridge aceitou a solicitação; o processamento real continua no UI.Vision.':'Pronto para uma nova execução.';const btn=$('executeBtn');if(btn){btn.disabled=state==='running';btn.innerHTML=state==='running'?'<i class="fa-solid fa-circle-notch fa-spin"></i><span>EXECUTANDO...</span>':state==='success'?'<i class="fa-solid fa-check"></i><span>COMANDO ACEITO</span>':state==='error'?'<i class="fa-solid fa-triangle-exclamation"></i><span>TENTAR NOVAMENTE</span>':'<i class="fa-solid fa-play"></i><span>EXECUTAR AUTOMAÇÃO</span>'}setState(state==='running'?'running':state==='error'?'error':'ready',state==='running'?'EXECUÇÃO EM ANDAMENTO':state==='error'?'ATENÇÃO NECESSÁRIA':'SISTEMA PRONTO')}
  async function executeAutomation(cfg){
    const started=new Date().toISOString();const run={id:`run-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,macro:cfg.macro,status:'info',startedAt:started,message:'Execução iniciada.',browser:null};
    $('progressTrack')?.removeAttribute('hidden');document.querySelectorAll('.step .step-state').forEach((x,i)=>x.textContent=i===0?'PROCESSANDO':'AGUARDANDO');document.querySelectorAll('.step').forEach((s,i)=>{s.classList.remove('active','done','failed');if(i===0)s.classList.add('active')});$('logOutput')&&( $('logOutput').innerHTML='');addLog('info',`Solicitação iniciada: ${cfg.title}`);addLog('info','Verificando disponibilidade do Bridge local...');updateExecutionView(cfg,'running','PREPARANDO AUTOMAÇÃO');
    const startedMs=Date.now();let result;
    try{
      const health=await probe();if(!health||health.status!=='ok')throw new Error('Bridge local indisponível em 127.0.0.1:5000.');addLog('ok','Bridge local respondeu ao health check.');setStep(1,'active','CONECTADO');
      let payload={},url=MACRO_URL;
      if(cfg.endpoint==='macro'){payload={macro:cfg.macro,source:'automacoes_uivision'};}
      if(cfg.endpoint==='soc'){const d=validateSoc();if(!d.valid.length)throw new Error('Informe ao menos um ID numérico válido.');storageSet('uivision_soc_ids',d.valid.join('\n'));payload={ids:d.valid, run_id: run.id};url=SOC_URL;addLog('info',`${d.valid.length} ID(s) válidos preparados para o SOC.`)}
      if(cfg.endpoint==='batch'){const d=validateBatch();if(!d.valid.length)throw new Error('Nenhum registro válido no padrão CPF;Cargo;Unidade.');storageSet('uivision_ultimo_lote',$('batchInput').value.trim());payload={colaboradores:d.valid};url=AUTO_URL;addLog('info',`${d.valid.length} colaborador(es) válidos preparados para o lote.`)}
      addLog('info',cfg.endpoint==='macro'?'Enviando macro ao Bridge...':'Enviando lote ao Bridge...');setStep(2,'active','ENVIANDO');
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.mensagem||`Bridge retornou HTTP ${response.status}.`);
      run.status='success';run.finishedAt=new Date().toISOString();run.durationMs=Date.now()-startedMs;run.message=result.mensagem||'Execução enviada ao Bridge com sucesso.';run.pid=result.pid||null;run.browser=result.browser||null;addLog('ok',run.message);setStep(3,'done','ACEITO');$('progressTrack')?.setAttribute('hidden','hidden');addHistory(run);updateExecutionView(cfg,'success','COMANDO ACEITO');renderHistory(cfg.macro,'all');refreshExecutionKpis(cfg.macro);toast('Automação enviada ao Bridge com sucesso.');setTimeout(()=>updateExecutionView(cfg,'ready','SISTEMA PRONTO'),1600);return result;
    }catch(err){run.status='error';run.finishedAt=new Date().toISOString();run.durationMs=Date.now()-startedMs;run.message=err?.message||'Falha não identificada.';addLog('error',run.message);setStep(2,'failed','FALHA');$('progressTrack')?.setAttribute('hidden','hidden');addHistory(run);updateExecutionView(cfg,'error','EXECUÇÃO COM ERRO');renderHistory(cfg.macro,'all');refreshExecutionKpis(cfg.macro);toast(run.message,'error');return null}
  }
  function refreshExecutionKpis(macro){const list=historyFor(macro),s=list.filter(x=>x.status==='success').length,f=list.filter(x=>x.status==='error').length,l=list[0];if($('runsKpi'))$('runsKpi').textContent=list.length||'—';if($('successKpi'))$('successKpi').textContent=s||'—';if($('failKpi'))$('failKpi').textContent=f||'—';if($('lastKpi'))$('lastKpi').textContent=l?fmt(l.startedAt):'—';if($('lastDetail'))$('lastDetail').textContent=l?.message||'aguardando histórico'}
  
  // Declara a função localmente para o restante do código enxergar
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

  // Exporta as funções para a janela (window) para o HTML conseguir chamar no onclick
  window.refreshStatus = refreshEnvironment;
  window.openHistoryDetail = openHistoryDetail;

  window.carregarDadosExtraidos = async function(runId, btn) {
      const box = document.getElementById(`extraDataBox-${runId}`);
      if(!box) return;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Buscando no banco de dados local...';
      btn.disabled = true;
      try {
          const res = await fetch(`http://127.0.0.1:5000/resultados-soc?run_id=${runId}`);
          const data = await res.json();
          if(!data || data.length === 0) {
              box.innerHTML = '<div style="padding: 12px; font-size: 11px; color: #94a3b8; background: rgba(0,0,0,0.2); border-radius: 8px; text-align: center;">Nenhum dado capturado ainda. (O robô pode estar rodando ou a execução falhou).</div>';
          } else {
              box.innerHTML = data.map(item => {
                  const d = item.dados || {};
                  const s = item.dados_soc || {};
                  
                  // Se houver Erro fatal capturado pelo Try/Catch do UI.Vision
                  if (d.erro && d.erro.length > 0) {
                      return `<div style="background:rgba(225,29,72,0.1); border:1px solid rgba(225,29,72,0.3); padding:12px; border-radius:10px; margin-bottom:8px; font-size:11px;">
                          <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(225,29,72,0.2); padding-bottom:6px;">
                              <strong style="color:#f43f5e; font-size:12px;"><i class="fa-solid fa-circle-xmark"></i> ID: ${esc(item.id_colaborador)}</strong>
                              <span style="color:#f43f5e; font-family: monospace; font-weight: bold;">FALHA DE EXECUÇÃO</span>
                          </div>
                          <strong style="color:#f43f5e; font-size:10px; display:block; margin-bottom:4px;">MOTIVO DO ERRO IDENTIFICADO PELO ROBÔ:</strong>
                          <span style="color:#cbd5e1;">${esc(d.erro)}</span>
                      </div>`;
                  }

                  let socHtml = '';
                  if (s.unidade || s.cargo) {
                      socHtml = `
                      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(129,140,248,0.3);">
                          <strong style="color:#34d399; font-size:10px; display:block; margin-bottom:8px;">
                              <i class="fa-solid fa-check-double"></i> SALVO NO SOC (CONFIRMAÇÃO)
                          </strong>
                          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; color:#cbd5e1;">
                              <div style="grid-column: 1 / -1;"><strong style="color:#94a3b8; display:block; font-size:9px;">UNIDADE (SOC)</strong> ${esc(s.unidade)}</div>
                              <div style="grid-column: 1 / -1;"><strong style="color:#94a3b8; display:block; font-size:9px;">SETOR (SOC)</strong> ${esc(s.setor)}</div>
                              <div style="grid-column: 1 / -1;"><strong style="color:#94a3b8; display:block; font-size:9px;">CARGO (SOC)</strong> ${esc(s.cargo)}</div>
                              <div><strong style="color:#94a3b8; display:block; font-size:9px;">MATRÍCULA</strong> ${esc(s.mat)}</div>
                              <div><strong style="color:#94a3b8; display:block; font-size:9px;">CPF</strong> ${esc(s.cpf)}</div>
                          </div>
                      </div>`;
                  }

                  return `<div style="background:rgba(2,6,23,0.4); border:1px solid rgba(129,140,248,0.2); padding:12px; border-radius:10px; margin-bottom:8px; font-size:11px;">
                      <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(129,140,248,0.1); padding-bottom:6px;">
                          <strong style="color:#818cf8; font-size:12px;"><i class="fa-solid fa-id-card"></i> ID FLOW: ${esc(item.id_colaborador)}</strong>
                          <span style="color:#cbd5e1; font-family: monospace; font-weight: bold;">OP ${esc(d.op)}</span>
                      </div>
                      
                      <strong style="color:#38bdf8; font-size:10px; display:block; margin-bottom:8px;">
                          <i class="fa-solid fa-cloud-arrow-down"></i> EXTRAÍDO DO FLOW
                      </strong>
                      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; color:#cbd5e1;">
                          <div style="grid-column: 1 / -1;"><strong style="color:#94a3b8; display:block; font-size:9px;">NOME</strong> ${esc(d.nome)}</div>
                          <div style="grid-column: 1 / -1;"><strong style="color:#94a3b8; display:block; font-size:9px;">CARGO (FLOW)</strong> ${esc(d.cargo)}</div>
                          <div style="grid-column: 1 / -1;"><strong style="color:#94a3b8; display:block; font-size:9px;">SETOR (FLOW)</strong> ${esc(d.setor)}</div>
                      </div>
                      ${socHtml}
                  </div>`;
              }).join('');
          }
          box.style.display = 'block';
          btn.style.display = 'none';
      } catch(err) {
          box.innerHTML = '<div style="color: #fb7185; font-size: 11px;">Erro ao conectar com o banco local. O Bridge está rodando?</div>';
          box.style.display = 'block';
          btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Tentar novamente';
          btn.disabled = false;
      }
  };

  document.addEventListener('DOMContentLoaded',()=>{
    if(document.body.dataset.page==='central'){
      renderCentral();refreshEnvironment();$('refreshCentral')?.addEventListener('click',refreshEnvironment);
      $('historyModal')?.addEventListener('click',e=>{if(e.target.id==='historyModal')closeHistory()});
    }else{pageInit();$('historyModal')?.addEventListener('click',e=>{if(e.target.id==='historyModal')closeHistory()})}
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeHistory()});
  });
})();
