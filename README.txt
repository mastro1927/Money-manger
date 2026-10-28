MONEY MANAGER CLOUD — GUIDA PASSO PER PASSO

COSA CAMBIA
- Ogni persona crea il proprio account con email e password.
- Saldo, obiettivo e movimenti vengono salvati online nel database Supabase.
- Le regole RLS nel database fanno sì che ogni account possa leggere/modificare SOLO le proprie righe, anche se qualcuno prova a chiamare direttamente le API.
- Per usare la versione cloud serve Internet.

PASSO 1 — CREA IL PROGETTO SUPABASE
1. Apri https://supabase.com/ e crea un account/progetto. Puoi usare il piano gratuito se disponibile per il tuo uso.
2. Dai al progetto un nome, imposta una password forte per il database e scegli una regione vicina. Conserva la password in un posto sicuro: non va messa nei file dell'app.
3. Aspetta che il progetto sia pronto.

PASSO 2 — CREA LE TABELLE PRIVATE
1. Nel pannello Supabase apri SQL Editor.
2. Apri il file database.sql incluso in questa cartella.
3. Copia tutto il contenuto e incollalo nel SQL Editor.
4. Premi Run. Verifica che l'esecuzione termini senza errori. Questo script crea le tabelle e le policy Row Level Security (RLS).
5. NON disattivare RLS e non eliminare le policy.

PASSO 3 — COPIA URL E PUBLISHABLE KEY
1. Nel pannello del progetto trova Connect oppure Project Settings → API Keys (la posizione può variare).
2. Copia Project URL.
3. Copia la publishable key (di solito inizia con sb_publishable_). Se il pannello mostra ancora la vecchia anon key, puoi usare quella pubblica anon.
4. Apri config.js con Blocco note o un editor di testo.
5. Sostituisci INCOLLA_QUI_PROJECT_URL con l'URL del progetto e INCOLLA_QUI_PUBLISHABLE_KEY con la publishable key. Mantieni le virgolette singole e non modificare il resto.
6. Salva config.js.
IMPORTANTE: non mettere MAI una secret key o service_role key in config.js, HTML, JavaScript o in GitHub. Le chiavi segrete bypassano le protezioni.

PASSO 4 — CONFIGURA L'AUTENTICAZIONE
1. In Supabase apri Authentication → Sign In / Providers (la voce può variare).
2. Abilita Email come metodo di accesso.
3. Per sicurezza, lascia attiva la conferma email se possibile. Con la conferma attiva, ogni nuovo utente deve aprire il messaggio ricevuto prima di accedere.
4. In Authentication → URL Configuration, imposta come Site URL l'indirizzo finale GitHub Pages, per esempio https://TUO-USERNAME.github.io/money-manager/. Aggiungi lo stesso indirizzo fra i Redirect URLs consentiti.
5. Se la registrazione deve essere aperta, lascia attivo “Allow new users to sign up”. In tal caso chiunque può creare un account, ma non può vedere i dati degli altri. Per limitare le registrazioni, disattiva questa opzione; però per aggiungere un nuovo amico potrà servire un invito/configurazione amministrativa separata.

PASSO 5 — PUBBLICA SU GITHUB PAGES
1. Estrai lo ZIP.
2. Crea un repository GitHub chiamato money-manager.
3. Carica tutti i file della cartella, inclusi config.js, database.sql e la cartella icons. Non caricare soltanto lo ZIP.
4. Nel repository apri Settings → Pages.
5. Seleziona Deploy from a branch, branch main e cartella /(root), poi Save.
6. Attendi l'indirizzo pubblico. Copialo nella Site URL e nei Redirect URLs di Supabase, come descritto al Passo 4.
7. Apri il sito e prova a creare il tuo account.

PASSO 6 — PROVA CHE I DATI SONO SEPARATI
1. Crea il tuo account e registra un movimento di prova.
2. Esci con il pulsante Esci.
3. Crea un altro account con un'altra email (o fai provare al tuo amico sul suo dispositivo). Dovrà vedere saldo zero e nessun movimento del tuo account.
4. Registra un movimento con il secondo account, esci e rientra nel primo: ogni account deve vedere solo i propri movimenti.
5. Se un account vede dati dell'altro, non usare l'app e controlla che lo script database.sql sia stato eseguito correttamente e che RLS sia attiva su entrambe le tabelle.

NOTE DI SICUREZZA
- La publishable/anon key è pensata per il frontend SOLO perché RLS limita l'accesso. La sicurezza dipende dalle policy SQL incluse.
- Non condividere password, codici email o file con credenziali segrete.
- Non inserire dati bancari o informazioni molto sensibili.
- I dati cloud non sono salvati automaticamente sul vecchio dispositivo: usa Backup dati per scaricare una copia privata.
- I movimenti salvati nella vecchia versione locale non vengono trasferiti automaticamente. Esporta un backup dalla vecchia app prima di sostituirla; dopo aver configurato il nuovo account, usa Ripristina backup.
- Non usare la vecchia versione e la nuova versione nello stesso sito senza aggiornare i file: pubblica tutti i file nuovi e fai ricaricamento completo.
