/* ═══════════════════════════════════════════════════════════
   CONFIGURAÇÃO FIREBASE — COMPARTILHADA
   Usada pelo site (script.js) e pelo painel admin (admin.js).
   Substitua pelos dados do seu projeto em:
   console.firebase.google.com → Configurações → Geral → Seus apps
   Atualize só aqui — os dois arquivos usam esse mesmo valor.
═══════════════════════════════════════════════════════════ */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCvz5pi3iV2n0Si7qnoRSFrn5mKzT2lfu0",
  authDomain:        "rifa-umari-fight.firebaseapp.com",
  databaseURL:       "https://rifa-umari-fight-default-rtdb.firebaseio.com",
  projectId:         "rifa-umari-fight",
  storageBucket:     "rifa-umari-fight.firebasestorage.app",
  messagingSenderId: "755525989658",
  appId:             "1:755525989658:web:7d765c13cc226f93cb68a3"
};

/* ═══════════════════════════════════════════════════════════
   SENHA DE ACESSO DO ADMINISTRADOR
   Não existe mais conta/login — quem souber essa senha acessa
   o painel admin (tanto o painel rápido do site quanto o
   admin.html). TROQUE por uma senha forte antes de publicar.
═══════════════════════════════════════════════════════════ */
const ADMIN_SENHA = "umarifight2026";
