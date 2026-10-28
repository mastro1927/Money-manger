(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const money = n => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n);
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let db = null;
  let currentUser = null;
  let state = { starting:0, goal:0, movements:[] };
  let installPrompt = null;
  let busy = false;

  function notice(message) { $('notice').textContent = message || ''; }
  function authNotice(message) { $('authNotice').textContent = message || ''; }
  function setBusy(value) {
    busy = value;
    ['loginBtn','signupBtn','resetPasswordBtn'].forEach(id => { $(id).disabled = value; });
  }
  function setSignedIn(isSignedIn) {
    $('authPanel').classList.toggle('hidden', isSignedIn);
    $('appContent').classList.toggle('hidden', !isSignedIn);
    $('exportBtn').classList.toggle('hidden', !isSignedIn);
    $('importBtn').classList.toggle('hidden', !isSignedIn);
    $('signOutBtn').classList.toggle('hidden', !isSignedIn);
  }
  function explainError(error) {
    const message = error && error.message ? error.message : String(error || 'Errore sconosciuto');
    if (/Invalid login credentials/i.test(message)) return 'Email o password non corretti.';
    if (/Email not confirmed/i.test(message)) return 'Conferma prima la tua email usando il messaggio ricevuto.';
    if (/User already registered/i.test(message)) return 'Questa email ha già un account: premi Accedi.';
    if (/Failed to fetch|NetworkError/i.test(message)) return 'Connessione non riuscita. Controlla Internet e la configurazione Supabase.';
    return message;
  }
  function totals() {
    let inc=0,out=0,mi=0,mo=0; const month=today().slice(0,7);
    for (const x of state.movements) {
      if (x.type==='income') { inc+=x.amount; if (x.date.startsWith(month)) mi+=x.amount; }
      else { out+=x.amount; if (x.date.startsWith(month)) mo+=x.amount; }
    }
    return {inc,out,mi,mo,balance:state.starting+inc-out};
  }
  function render() {
    const t=totals();
    $('balance').textContent=money(t.balance);
    $('income').textContent=money(t.inc); $('expense').textContent=money(t.out);
    $('monthIncome').textContent=money(t.mi); $('monthExpense').textContent=money(t.mo);
    $('startingBalance').value=state.starting;
    $('goalInput').value=state.goal || '';
    $('goalBalance').textContent=money(t.balance);
    const pct=state.goal>0?Math.max(0,Math.min(100,t.balance/state.goal*100)):0;
    $('goalBar').style.width=pct+'%';
    $('goalText').textContent=state.goal>0?(pct>=100?'Obiettivo raggiunto!':`${pct.toFixed(0)}% completato · Mancano ${money(Math.max(0,state.goal-t.balance))}`):'Imposta un obiettivo per iniziare.';
    const filter=$('filter').value;
    const list=state.movements.filter(x=>filter==='all'||x.type===filter).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
    $('transactions').innerHTML=list.length?list.map(x=>`<div class="transaction"><div class="tx-left"><div class="tx-name">${escapeHtml(x.description||x.category)}</div><div class="tx-meta">${escapeHtml(x.date)} · ${escapeHtml(x.category)}</div></div><div class="tx-right"><strong class="${x.type==='income'?'positive':'negative'}">${x.type==='income'?'+':'−'}${money(x.amount)}</strong><button class="delete" type="button" data-delete="${escapeHtml(x.id)}" aria-label="Elimina movimento">×</button></div></div>`).join(''):`<div class="empty">${state.movements.length?'Nessun movimento in questo filtro.':'Non hai ancora registrato movimenti.'}</div>`;
    const groups={};
    state.movements.filter(x=>x.type==='expense').forEach(x=>groups[x.category]=(groups[x.category]||0)+x.amount);
    const cats=Object.entries(groups).sort((a,b)=>b[1]-a[1]);
    $('categories').innerHTML=cats.length?cats.map(([name,val])=>`<div class="category"><div class="category-top"><span>${escapeHtml(name)}</span><strong>${money(val)}</strong></div><div class="bar"><span style="width:${val/Math.max(...cats.map(c=>c[1]))*100}%"></span></div></div>`).join(''):'<div class="empty">Le categorie appariranno quando registrerai delle uscite.</div>';
  }
  async function loadCloudData() {
    if (!currentUser) return;
    notice('Caricamento dei tuoi dati…');
    const { data: settings, error: settingsError } = await db.from('money_manager_settings').select('starting_balance,goal').eq('user_id',currentUser.id).maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings) {
      const { error } = await db.from('money_manager_settings').insert({user_id:currentUser.id,starting_balance:0,goal:0});
      if (error && error.code !== '23505') throw error;
    }
    const { data: freshSettings, error: freshSettingsError } = await db.from('money_manager_settings').select('starting_balance,goal').eq('user_id',currentUser.id).single();
    if (freshSettingsError) throw freshSettingsError;
    const { data: rows, error: rowsError } = await db.from('money_manager_movements').select('id,type,amount,category,description,movement_date,created_at').eq('user_id',currentUser.id).order('movement_date',{ascending:false}).order('created_at',{ascending:false}).limit(10000);
    if (rowsError) throw rowsError;
    state = {
      starting: Number(freshSettings.starting_balance) || 0,
      goal: Number(freshSettings.goal) || 0,
      movements: (rows || []).map(x=>({id:x.id,type:x.type,amount:Number(x.amount),category:x.category,description:x.description,date:x.movement_date,createdAt:x.created_at}))
    };
    render();
    notice('Dati sincronizzati con il tuo account.');
  }
  async function saveSettings() {
    if (!currentUser) return;
    const { error } = await db.from('money_manager_settings').upsert({user_id:currentUser.id,starting_balance:state.starting,goal:state.goal,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if (error) throw error;
  }
  async function runAuth(mode) {
    if (busy || !db) return;
    const email=$('authEmail').value.trim();
    const password=$('authPassword').value;
    if (!email || !password) { authNotice('Inserisci email e password.'); return; }
    if (password.length < 8) { authNotice('La password deve avere almeno 8 caratteri.'); return; }
    setBusy(true); authNotice(mode==='signup'?'Creazione account in corso…':'Accesso in corso…');
    try {
      if (mode==='signup') {
        const {data,error}=await db.auth.signUp({
    email,
    password,
    options: {
        emailRedirectTo: window.location.origin + window.location.pathname
    }
});
        if (error) throw error;
        if (data.session) {
          currentUser=data.user;
          setSignedIn(true);
          await loadCloudData();
          authNotice('');
        } else {
          authNotice('Account creato. Controlla la tua email e conferma l’indirizzo, poi torna qui e accedi.');
        }
      } else {
        const {data,error}=await db.auth.signInWithPassword({email,password});
        if (error) throw error;
        currentUser=data.user;
        setSignedIn(true);
        await loadCloudData();
        authNotice('');
      }
    } catch (error) {
      currentUser=null; setSignedIn(false); authNotice(explainError(error));
    } finally { setBusy(false); }
  }
  $('authForm').addEventListener('submit',e=>{e.preventDefault();const mode=e.submitter?.dataset.mode||'login';runAuth(mode);});
  $('resetPasswordBtn').addEventListener('click',async()=>{
    if (!db) return;
    const email=$('authEmail').value.trim();
    if (!email) { authNotice('Scrivi prima la tua email, poi premi “Ho dimenticato la password”.'); return; }
    setBusy(true); authNotice('Invio richiesta…');
    try {
      const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      if (error) throw error;
      authNotice('Se l’email è registrata, riceverai un messaggio per reimpostare la password. Aprilo sullo stesso dispositivo o browser.');
    } catch(error) { authNotice(explainError(error)); }
    finally { setBusy(false); }
  });
  $('passwordUpdateForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const password=$('newPassword').value;
    if(password.length<8){authNotice('La nuova password deve avere almeno 8 caratteri.');return;}
    const button=$('passwordUpdateForm').querySelector('button');button.disabled=true;
    try{
      const {error}=await db.auth.updateUser({password});
      if(error)throw error;
      $('passwordUpdatePanel').classList.add('hidden');$('newPassword').value='';
      authNotice('Password aggiornata. Ora puoi accedere con la nuova password.');
      await db.auth.signOut();currentUser=null;setSignedIn(false);
    }catch(error){authNotice(explainError(error));}
    finally{button.disabled=false;}
  });
  $('signOutBtn').addEventListener('click',async()=>{
    if (!db) return;
    const {error}=await db.auth.signOut();
    state={starting:0,goal:0,movements:[]}; currentUser=null; setSignedIn(false); render();
    notice(''); authNotice(error?'Sei uscito dall’app.':'Hai effettuato la disconnessione.');
  });
  $('date').value=today();
  $('txForm').addEventListener('submit',async e=>{
    e.preventDefault(); if (!currentUser) return;
    const amount=Number($('amount').value), date=$('date').value;
    if(!Number.isFinite(amount)||amount<=0||amount>100000000){$('formNotice').textContent='Inserisci un importo valido.';return;}
    if(!date||date>today()){$('formNotice').textContent='Inserisci una data valida, non futura.';return;}
    const button=$('txForm').querySelector('button[type="submit"]'); button.disabled=true;
    try {
      const row={user_id:currentUser.id,type:$('type').value,amount,category:$('category').value,description:$('description').value.trim(),movement_date:date};
      const {data,error}=await db.from('money_manager_movements').insert(row).select('id,type,amount,category,description,movement_date,created_at').single();
      if(error) throw error;
      state.movements.push({id:data.id,type:data.type,amount:Number(data.amount),category:data.category,description:data.description,date:data.movement_date,createdAt:data.created_at});
      render(); $('amount').value=''; $('description').value=''; $('formNotice').textContent='Movimento salvato online nel tuo account.';
    } catch(error) { $('formNotice').textContent='Non è stato possibile salvare: '+explainError(error); }
    finally { button.disabled=false; }
  });
  $('transactions').addEventListener('click',async e=>{
    const b=e.target.closest('[data-delete]'); if(!b||!currentUser)return;
    if(!confirm('Vuoi eliminare questo movimento?'))return;
    b.disabled=true;
    try {
      const {error}=await db.from('money_manager_movements').delete().eq('id',b.dataset.delete).eq('user_id',currentUser.id);
      if(error)throw error;
      state.movements=state.movements.filter(x=>x.id!==b.dataset.delete); render(); notice('Movimento eliminato.');
    } catch(error) { notice('Non è stato possibile eliminare il movimento: '+explainError(error)); b.disabled=false; }
  });
  $('filter').addEventListener('change',render);
  $('saveStarting').addEventListener('click',async()=>{
    const v=Number($('startingBalance').value);
    if(!Number.isFinite(v)||v<0||v>100000000){notice('Inserisci un saldo iniziale valido.');return;}
    const old=state.starting; state.starting=v;
    try { await saveSettings(); render(); notice('Saldo iniziale salvato nel tuo account.'); }
    catch(error) { state.starting=old; render(); notice('Errore nel salvataggio: '+explainError(error)); }
  });
  $('saveGoal').addEventListener('click',async()=>{
    const v=Number($('goalInput').value);
    if(!Number.isFinite(v)||v<=0||v>100000000){notice('Inserisci un obiettivo maggiore di zero.');return;}
    const old=state.goal; state.goal=v;
    try { await saveSettings(); render(); notice('Obiettivo salvato nel tuo account.'); }
    catch(error) { state.goal=old; render(); notice('Errore nel salvataggio: '+explainError(error)); }
  });
  function download(name,content,type) {
    const url=URL.createObjectURL(new Blob([content],{type}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('exportBtn').addEventListener('click',()=>{
    download('money-manager-backup.json',JSON.stringify({...state,backupVersion:2,exportedAt:new Date().toISOString()},null,2),'application/json');
    notice('Backup del tuo account esportato. Conserva il file in un posto sicuro.');
  });
  $('importBtn').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',async()=>{
    const file=$('importFile').files[0]; if(!file||!currentUser)return;
    try {
      const data=JSON.parse(await file.text());
      if(!data||!Array.isArray(data.movements)||!Number.isFinite(Number(data.starting))||Number(data.starting)<0||!Number.isFinite(Number(data.goal))||Number(data.goal)<0)throw new Error('Formato non valido');
      const ms=data.movements.filter(x=>x&&['income','expense'].includes(x.type)&&Number.isFinite(Number(x.amount))&&Number(x.amount)>0&&Number(x.amount)<=100000000&&typeof x.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.date<=today()).slice(0,10000).map(x=>({user_id:currentUser.id,type:x.type,amount:Number(x.amount),category:String(x.category||'Altro').slice(0,50),description:String(x.description||'').slice(0,100),movement_date:x.date}));
      if(!confirm(`Importare ${ms.length} movimenti? I movimenti attuali di QUESTO account saranno sostituiti.`))return;
      notice('Ripristino backup in corso…');
      const del=await db.from('money_manager_movements').delete().eq('user_id',currentUser.id);
      if(del.error)throw del.error;
      for(let i=0;i<ms.length;i+=500){const batch=ms.slice(i,i+500);if(batch.length){const result=await db.from('money_manager_movements').insert(batch);if(result.error)throw result.error;}}
      state.starting=Number(data.starting); state.goal=Number(data.goal); await saveSettings(); await loadCloudData(); notice('Backup ripristinato nel tuo account.');
    } catch(error) { notice('Backup non ripristinato: '+explainError(error)+'. Se necessario, controlla i dati e riprova.'); }
    $('importFile').value='';
  });
  $('resetBtn').addEventListener('click',async()=>{
    if(!currentUser)return;
    if(confirm('Vuoi cancellare saldo, obiettivo e tutti i movimenti del TUO account? Questa operazione non si può annullare.')){
      try {
        const {error}=await db.from('money_manager_movements').delete().eq('user_id',currentUser.id);
        if(error)throw error;
        state={starting:0,goal:0,movements:[]}; await saveSettings(); render(); notice('I dati del tuo account sono stati azzerati.');
      } catch(error) { notice('Errore durante l’azzeramento: '+explainError(error)); }
    }
  });
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installBtn').classList.remove('hidden');});
  $('installBtn').addEventListener('click',async()=>{
    if(!installPrompt){notice('Usa il menu del browser e scegli “Installa app” o “Aggiungi alla schermata Home”.');return;}
    installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installBtn').classList.add('hidden');
  });
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>notice('La modalità offline non è disponibile. Per usare i dati serve Internet.')));
  }
  async function start() {
    setSignedIn(false);
    const cfg=window.MONEY_MANAGER_CONFIG||{};
    if (!window.supabase || !cfg.url || !cfg.publishableKey || cfg.url.includes('INCOLLA_QUI') || cfg.publishableKey.includes('INCOLLA_QUI')) {
      $('configNotice').textContent='Configurazione necessaria: crea un progetto Supabase e inserisci URL e publishable key nel file config.js.';
      $('loginBtn').disabled=true; $('signupBtn').disabled=true; $('resetPasswordBtn').disabled=true; return;
    }
    db=window.supabase.createClient(cfg.url,cfg.publishableKey);
    $('configNotice').textContent='I dati si sincronizzano online. Per visualizzarli devi accedere al tuo account.';
    try {
      const {data,error}=await db.auth.getSession();
      if(error)throw error;
      if(data.session){currentUser=data.session.user;setSignedIn(true);await loadCloudData();}
    } catch(error) { currentUser=null;setSignedIn(false);authNotice('Impossibile collegarsi al database: '+explainError(error)); }
    db.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY'){
        $('passwordUpdatePanel').classList.remove('hidden');
        authNotice('Inserisci la nuova password qui sotto.');
      } else if(event==='SIGNED_OUT'){
        currentUser=null;state={starting:0,goal:0,movements:[]};setSignedIn(false);render();
      } else if(event==='SIGNED_IN' && session && (!currentUser || currentUser.id!==session.user.id)){
        currentUser=session.user;setSignedIn(true);
        setTimeout(()=>loadCloudData().catch(error=>notice('Errore nel caricamento: '+explainError(error))),0);
      }
    });
  }
  render();
  start();
})();
