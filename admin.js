/* ═══════════════════════════════════════════════════════════
   DASHBOARD ADMIN — admin.js
   Lê e escreve os mesmos dados do site (script.js): Firebase ou localStorage.
   FIREBASE_CONFIG e ADMIN_SENHA vêm de firebase-config.js (carregado antes deste arquivo)
═══════════════════════════════════════════════════════════ */

const NOME_RIFA     = "Rifa Umari Fight";
const PREMIO_RIFA   = "2 PIX de R$ 500,00";
const PRECO_NUMERO  = 10;
const TOTAL_NUMEROS = 1000;

// Só para exibição na aba Configurações — precisam bater com os valores
// definidos no topo do script.js (WHATSAPP_NUM e PIX_CHAVE).
const WHATSAPP_NUM_CFG = "5591984108132";
const PIX_CHAVE_CFG    = "40f37b54-0074-443d-bc40-16b68a67fbbb";

let vendidos    = {};
let pendentes   = {};
let useFirebase = false;
let dbRef       = null; // { ref, set, db } — só existe quando useFirebase = true
let viewAtual   = "dashboard";
let filtroBilhetes = "todos";

(function init() {
  const sessao = obterSessao();
  if (!sessao || !sessao.isAdmin) {
    mostrarAcessoNegado();
    return;
  }
  iniciarDashboard();
})();

function entrarComoAdmin() {
  const campo = document.getElementById("adminSenhaInput");
  const senha = campo.value;

  if (senha !== ADMIN_SENHA) {
    alert("Senha incorreta.");
    campo.value = "";
    campo.focus();
    return;
  }

  localStorage.setItem("rifa_sessao", JSON.stringify({ isAdmin: true }));
  document.getElementById("acessoNegado").style.display = "none";
  iniciarDashboard();
}

async function iniciarDashboard() {
  document.getElementById("appAdmin").style.display = "grid";
  document.getElementById("adminNome").textContent = "Admin";

  const isConfigReal = !FIREBASE_CONFIG.apiKey.includes("DEMO");

  if (isConfigReal) {
    try {
      const { initializeApp }                 = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const { getDatabase, ref, onValue, set } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");

      const app = initializeApp(FIREBASE_CONFIG);
      const db  = getDatabase(app);
      dbRef = { ref, set, db };
      useFirebase = true;

      onValue(ref(db, "numeros"), snap => {
        vendidos = snap.val() || {};
        renderTudo();
      });

      onValue(ref(db, "pendentes"), snap => {
        pendentes = snap.val() || {};
        renderTudo();
      });
    } catch (e) {
      console.warn("Firebase falhou, usando localStorage:", e);
      initLocal();
    }
  } else {
    initLocal();
  }
}

/* ─────────────────────────────────────────────────────────
   MODO LOCAL (localStorage fallback)
───────────────────────────────────────────────────────── */
function initLocal() {
  const carregar = () => {
    vendidos  = JSON.parse(localStorage.getItem("rifa_vendidos")  || "{}");
    pendentes = JSON.parse(localStorage.getItem("rifa_pendentes") || "{}");
    renderTudo();
  };
  carregar();
  // localStorage não avisa a mesma aba quando muda; re-checa periodicamente.
  setInterval(carregar, 3000);
}

function salvarLocal() {
  localStorage.setItem("rifa_vendidos",  JSON.stringify(vendidos));
  localStorage.setItem("rifa_pendentes", JSON.stringify(pendentes));
}

/* ─────────────────────────────────────────────────────────
   SESSÃO / ACESSO
───────────────────────────────────────────────────────── */
function obterSessao() {
  try {
    return JSON.parse(localStorage.getItem("rifa_sessao") || "null");
  } catch {
    return null;
  }
}

function mostrarAcessoNegado() {
  document.getElementById("acessoNegado").style.display = "flex";
}

function sairAdmin() {
  localStorage.removeItem("rifa_sessao");
  window.location.href = "index.html";
}

/* ─────────────────────────────────────────────────────────
   UTILITÁRIOS
───────────────────────────────────────────────────────── */
function normalizarTel(tel) {
  return (tel || "").replace(/\D/g, "");
}

function formatarMoeda(valor) {
  return `R$ ${valor.toLocaleString("pt-BR")},00`;
}

function formatarData(ts) {
  if (!ts) return "—";
  const d   = new Date(ts);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const hh  = String(d.getHours()).padStart(2, "0");
  const mm  = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()} ${hh}:${mm}`;
}

/* ═══════════════════════════════════════════════════════════
   NAVEGAÇÃO ENTRE VIEWS (sidebar)
═══════════════════════════════════════════════════════════ */
const TITULOS_VIEW = {
  dashboard:     "Dashboard",
  rifas:         "Rifas",
  bilhetes:      "Bilhetes",
  participantes: "Participantes",
  configuracoes: "Configurações",
};

function trocarView(view) {
  viewAtual = view;

  document.querySelectorAll(".view").forEach(sec => sec.classList.remove("ativa"));
  const secAtiva = document.getElementById(`view-${view}`);
  if (secAtiva) secAtiva.classList.add("ativa");

  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.view === view);
  });

  const titulo = document.getElementById("tituloPagina");
  if (titulo) titulo.textContent = TITULOS_VIEW[view] || "Dashboard";

  renderTudo();
}

/* ═══════════════════════════════════════════════════════════
   RENDERIZAÇÃO
═══════════════════════════════════════════════════════════ */
function renderTudo() {
  renderStats();

  if (viewAtual === "dashboard") {
    renderRifasRecentes();
    renderBilhetesRecentes();
  } else if (viewAtual === "rifas") {
    renderViewRifas();
  } else if (viewAtual === "bilhetes") {
    renderViewBilhetes();
  } else if (viewAtual === "participantes") {
    renderViewParticipantes();
  } else if (viewAtual === "configuracoes") {
    renderViewConfiguracoes();
  }
}

function renderStats() {
  const cntVendidos = Object.keys(vendidos).length;
  const arrecadado  = cntVendidos * PRECO_NUMERO;

  const participantes = new Set();
  Object.values(vendidos).forEach(v  => participantes.add(normalizarTel(v.tel)));
  Object.values(pendentes).forEach(v => participantes.add(normalizarTel(v.tel)));

  const elRifas = document.getElementById("statRifasAtivas");
  const elVend  = document.getElementById("statBilhetesVendidos");
  const elArrec = document.getElementById("statArrecadado");
  const elPart  = document.getElementById("statParticipantes");
  if (elRifas) elRifas.textContent = "1";
  if (elVend)  elVend.textContent  = cntVendidos;
  if (elArrec) elArrec.textContent = formatarMoeda(arrecadado);
  if (elPart)  elPart.textContent  = participantes.size;
}

function renderRifasRecentes() {
  const corpo = document.getElementById("corpoRifasRecentes");
  if (!corpo) return;
  const cntVendidos = Object.keys(vendidos).length;
  const arrecadado  = cntVendidos * PRECO_NUMERO;

  corpo.innerHTML = `
    <tr>
      <td>${NOME_RIFA}</td>
      <td>${PREMIO_RIFA}</td>
      <td>${cntVendidos}</td>
      <td>${formatarMoeda(arrecadado)}</td>
      <td><span class="pill pill-ativa">Ativa</span></td>
    </tr>
  `;
}

function renderBilhetesRecentes() {
  const corpo = document.getElementById("corpoBilhetes");
  if (!corpo) return;

  const entradas = [
    ...Object.entries(vendidos).map(([num, info])  => ({ num, info, status: "aprovado" })),
    ...Object.entries(pendentes).map(([num, info]) => ({ num, info, status: "pendente" })),
  ].sort((a, b) => (b.info.ts || 0) - (a.info.ts || 0)).slice(0, 12);

  if (!entradas.length) {
    corpo.innerHTML = `<tr><td colspan="7" class="tabela-vazia">Nenhum bilhete registrado ainda.</td></tr>`;
    return;
  }

  corpo.innerHTML = entradas.map(({ num, info, status }) => `
    <tr>
      <td>#${num}</td>
      <td>${NOME_RIFA}</td>
      <td>${info.nome || "—"}</td>
      <td>${num}</td>
      <td>${formatarData(info.ts)}</td>
      <td>${formatarMoeda(PRECO_NUMERO)}</td>
      <td><span class="pill ${status === "aprovado" ? "pill-aprovado" : "pill-pendente"}">${status === "aprovado" ? "Aprovado" : "Pendente"}</span></td>
    </tr>
  `).join("");
}

/* ─────────────────────────────────────────────────────────
   VIEW: RIFAS (detalhe da rifa única)
───────────────────────────────────────────────────────── */
function renderViewRifas() {
  const el = document.getElementById("rifaDetalhe");
  if (!el) return;

  const cntVendidos  = Object.keys(vendidos).length;
  const cntPendentes = Object.keys(pendentes).length;
  const disponiveis  = TOTAL_NUMEROS - cntVendidos - cntPendentes;
  const arrecadado   = cntVendidos * PRECO_NUMERO;
  const percentual   = ((cntVendidos / TOTAL_NUMEROS) * 100).toFixed(1);

  el.innerHTML = `
    <div class="rifa-detalhe-topo">
      <div>
        <div class="rifa-detalhe-nome">${NOME_RIFA}</div>
        <div class="rifa-detalhe-premio">🏆 ${PREMIO_RIFA}</div>
      </div>
      <span class="pill pill-ativa">Ativa</span>
    </div>
    <div class="rifa-detalhe-grid">
      <div class="rifa-detalhe-item"><span>Preço por número</span><strong>${formatarMoeda(PRECO_NUMERO)}</strong></div>
      <div class="rifa-detalhe-item"><span>Total de números</span><strong>${TOTAL_NUMEROS}</strong></div>
      <div class="rifa-detalhe-item"><span>Vendidos (aprovados)</span><strong>${cntVendidos}</strong></div>
      <div class="rifa-detalhe-item"><span>Aguardando aprovação</span><strong>${cntPendentes}</strong></div>
      <div class="rifa-detalhe-item"><span>Disponíveis</span><strong>${disponiveis}</strong></div>
      <div class="rifa-detalhe-item"><span>Arrecadado</span><strong>${formatarMoeda(arrecadado)}</strong></div>
      <div class="rifa-detalhe-item"><span>% vendido</span><strong>${percentual}%</strong></div>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   VIEW: BILHETES (lista completa + aprovar/rejeitar)
───────────────────────────────────────────────────────── */
function filtrarBilhetes(status, el) {
  filtroBilhetes = status;
  document.querySelectorAll(".filtro-tab").forEach(tab => tab.classList.remove("ativo"));
  if (el) el.classList.add("ativo");
  renderViewBilhetes();
}

function renderViewBilhetes() {
  const corpo = document.getElementById("corpoBilhetesTodos");
  if (!corpo) return;

  let entradas = [
    ...Object.entries(vendidos).map(([num, info])  => ({ num, info, status: "aprovado" })),
    ...Object.entries(pendentes).map(([num, info]) => ({ num, info, status: "pendente" })),
  ];

  if (filtroBilhetes !== "todos") {
    entradas = entradas.filter(e => e.status === filtroBilhetes);
  }

  entradas.sort((a, b) => (b.info.ts || 0) - (a.info.ts || 0));

  if (!entradas.length) {
    corpo.innerHTML = `<tr><td colspan="8" class="tabela-vazia">Nenhum bilhete encontrado.</td></tr>`;
    return;
  }

  corpo.innerHTML = entradas.map(({ num, info, status }) => `
    <tr>
      <td>#${num}</td>
      <td>${info.nome || "—"}</td>
      <td>${info.tel || "—"}</td>
      <td>${num}</td>
      <td>${formatarData(info.ts)}</td>
      <td>${formatarMoeda(PRECO_NUMERO)}</td>
      <td><span class="pill ${status === "aprovado" ? "pill-aprovado" : "pill-pendente"}">${status === "aprovado" ? "Aprovado" : "Pendente"}</span></td>
      <td>
        ${status === "pendente" ? `
          <div class="acoes-bilhete">
            <button class="btn-acao aprovar" type="button" onclick="aprovarPagamento('${num}')">✓ Aprovar</button>
            <button class="btn-acao rejeitar" type="button" onclick="rejeitarPagamento('${num}')">✕ Rejeitar</button>
          </div>
        ` : "—"}
      </td>
    </tr>
  `).join("");
}

/* ─────────────────────────────────────────────────────────
   VIEW: PARTICIPANTES (agregado por telefone)
───────────────────────────────────────────────────────── */
function renderViewParticipantes() {
  const corpo = document.getElementById("corpoParticipantes");
  if (!corpo) return;

  const mapa = {}; // chave: telefone normalizado

  Object.values(vendidos).forEach(info => {
    const chave = normalizarTel(info.tel) || `sem-tel-${info.nome}`;
    if (!mapa[chave]) mapa[chave] = { nome: info.nome, tel: info.tel, aprovados: 0, pendentes: 0 };
    mapa[chave].aprovados++;
  });

  Object.values(pendentes).forEach(info => {
    const chave = normalizarTel(info.tel) || `sem-tel-${info.nome}`;
    if (!mapa[chave]) mapa[chave] = { nome: info.nome, tel: info.tel, aprovados: 0, pendentes: 0 };
    mapa[chave].pendentes++;
  });

  const lista = Object.values(mapa).sort((a, b) => (b.aprovados * PRECO_NUMERO) - (a.aprovados * PRECO_NUMERO));

  if (!lista.length) {
    corpo.innerHTML = `<tr><td colspan="5" class="tabela-vazia">Nenhum participante ainda.</td></tr>`;
    return;
  }

  corpo.innerHTML = lista.map(p => `
    <tr>
      <td>${p.nome || "—"}</td>
      <td>${p.tel || "—"}</td>
      <td>${p.aprovados}</td>
      <td>${p.pendentes}</td>
      <td>${formatarMoeda(p.aprovados * PRECO_NUMERO)}</td>
    </tr>
  `).join("");
}

/* ─────────────────────────────────────────────────────────
   VIEW: CONFIGURAÇÕES
───────────────────────────────────────────────────────── */
function renderViewConfiguracoes() {
  const elPreco = document.getElementById("cfgPreco");
  const elPix   = document.getElementById("cfgPix");
  const elWpp   = document.getElementById("cfgWpp");
  const elFonte = document.getElementById("cfgFonte");

  if (elPreco) elPreco.textContent = formatarMoeda(PRECO_NUMERO);
  if (elPix)   elPix.textContent   = PIX_CHAVE_CFG;
  if (elWpp)   elWpp.textContent   = `+${WHATSAPP_NUM_CFG}`;
  if (elFonte) elFonte.textContent = useFirebase ? "Firebase (tempo real)" : "LocalStorage (só neste navegador)";
}

/* ─────────────────────────────────────────────────────────
   APROVAR / REJEITAR PAGAMENTO
───────────────────────────────────────────────────────── */
async function aprovarPagamento(num) {
  const registro = pendentes[num];
  if (!registro) { alert("Esse pagamento não está mais pendente."); return; }

  try {
    if (useFirebase && dbRef) {
      const { ref, set, db } = dbRef;
      await set(ref(db, `numeros/${num}`), { nome: registro.nome, tel: registro.tel, ts: Date.now() });
      await set(ref(db, `pendentes/${num}`), null);
    } else {
      vendidos[num] = { nome: registro.nome, tel: registro.tel, ts: Date.now() };
      delete pendentes[num];
      salvarLocal();
      renderTudo();
    }
  } catch (e) {
    console.error(e);
    alert("Não foi possível aprovar. Tente novamente.");
  }
}

async function rejeitarPagamento(num) {
  if (!confirm(`Rejeitar o pagamento do número ${num}? Ele voltará a ficar disponível.`)) return;

  try {
    if (useFirebase && dbRef) {
      const { ref, set, db } = dbRef;
      await set(ref(db, `pendentes/${num}`), null);
    } else {
      delete pendentes[num];
      salvarLocal();
      renderTudo();
    }
  } catch (e) {
    console.error(e);
    alert("Não foi possível rejeitar. Tente novamente.");
  }
}

/* ─────────────────────────────────────────────────────────
   RESETAR TUDO (zona de risco — aba Configurações)
───────────────────────────────────────────────────────── */
async function resetarTudoAdmin() {
  const digitado = prompt(
    "⚠️ Isso vai apagar TODOS os números vendidos, pendentes e reservados — a rifa volta ao início do zero.\n\n" +
    "Essa ação não pode ser desfeita. Digite RESETAR para confirmar:"
  );
  if (digitado === null) return;
  if (digitado.trim().toUpperCase() !== "RESETAR") {
    alert("Reset cancelado — texto de confirmação não confere.");
    return;
  }

  try {
    if (useFirebase && dbRef) {
      const { ref, set, db } = dbRef;
      await set(ref(db, "numeros"), null);
      await set(ref(db, "reservas"), null);
      await set(ref(db, "pendentes"), null);
    } else {
      vendidos  = {};
      pendentes = {};
      localStorage.removeItem("rifa_reservados");
      salvarLocal();
      renderTudo();
    }
    alert("Todos os números foram resetados!");
  } catch (e) {
    console.error(e);
    alert("Não foi possível resetar. Tente novamente.");
  }
}

/* ── Expõe funções para o HTML (onclick) ── */
window.sairAdmin         = sairAdmin;
window.entrarComoAdmin   = entrarComoAdmin;
window.trocarView        = trocarView;
window.filtrarBilhetes   = filtrarBilhetes;
window.aprovarPagamento  = aprovarPagamento;
window.rejeitarPagamento = rejeitarPagamento;
window.resetarTudoAdmin  = resetarTudoAdmin;
