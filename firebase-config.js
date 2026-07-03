/* ═══════════════════════════════════════════════════════════
   CONFIGURAÇÃO FIREBASE — COMPARTILHADA
   Usada pelo site (script.js) e pelo painel admin (admin.js).
   Substitua pelos dados do seu projeto em:
   console.firebase.google.com → Configurações → Geral → Seus apps
   Atualize só aqui — os dois arquivos usam esse mesmo valor.
═══════════════════════════════════════════════════════════ */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDEMO-substitua-pela-sua-chave",
  authDomain:        "seu-projeto.firebaseapp.com",
  databaseURL:       "https://seu-projeto-default-rtdb.firebaseio.com",
  projectId:         "seu-projeto",
  storageBucket:     "seu-projeto.appspot.com",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:0000000000000000"
};

/* ═══════════════════════════════════════════════════════════
   SENHA DE ACESSO DO ADMINISTRADOR
   Não existe mais conta/login — quem souber essa senha acessa
   o painel admin (tanto o painel rápido do site quanto o
   admin.html). TROQUE por uma senha forte antes de publicar.
═══════════════════════════════════════════════════════════ */
const ADMIN_SENHA = "umarifight2026";
