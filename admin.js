/* ═══════════════════════════════════════════════════════════
   DASHBOARD ADMIN — admin.js
   Lê os mesmos dados do site (script.js): Firebase ou localStorage.
   FIREBASE_CONFIG vem de firebase-config.js (carregado antes deste arquivo)
═══════════════════════════════════════════════════════════ */

const NOME_RIFA     = "Rifa Umari Fight";
const PREMIO_RIFA   = "2 PIX de R$ 500,00";
const PRECO_NUMERO  = 10;

let vendidos    = {};
let pendentes   = {};
let useFirebase = false;

(async function init() {
  const sessao = obterSessao();
  if (!sessao || !sessao.isAdmin) {
    mostrarAcessoNegado();
    return;
  }

  document.getElementById("appAdmin").style.display = "grid";
  document.getElementById("adminNome").textContent = (sessao.nome || "Admin").split(" ")[0];

  const isConfigReal = !FIREBASE_CONFIG.apiKey.includes("DEMO");

  if (isConfigReal) {
    try {
      const { initializeApp }            = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const { getDatabase, ref, onValue } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");

      const app = initializeApp(FIREBASE_CONFIG);
      const db  = getDatabase(app);
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
})();

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

/* ─────────────────────────────────────────────────────────
   RENDERIZAÇÃO
───────────────────────────────────────────────────────── */
function renderTudo() {
  renderStats();
  renderRifasRecentes();
  renderBilhetesRecentes();
}

function renderStats() {
  const cntVendidos = Object.keys(vendidos).length;
  const arrecadado  = cntVendidos * PRECO_NUMERO;

  const participantes = new Set();
  Object.values(vendidos).forEach(v  => participantes.add(normalizarTel(v.tel)));
  Object.values(pendentes).forEach(v => participantes.add(normalizarTel(v.tel)));

  document.getElementById("statRifasAtivas").textContent      = "1";
  document.getElementById("statBilhetesVendidos").textContent = cntVendidos;
  document.getElementById("statArrecadado").textContent       = formatarMoeda(arrecadado);
  document.getElementById("statParticipantes").textContent    = participantes.size;
}

function renderRifasRecentes() {
  const corpo = document.getElementById("corpoRifasRecentes");
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

window.sairAdmin = sairAdmin;
