/* ═══════════════════════════════════════════════════════════
   RIFA UMARI FIGHT — script.js
   Firebase Realtime Database (com fallback localStorage)
   FIREBASE_CONFIG vem de firebase-config.js (carregado antes deste arquivo)
═══════════════════════════════════════════════════════════ */

const WHATSAPP_NUM = "5591984108132"; // número sem + e sem espaços
const PIX_CHAVE   = "40f37b54-0074-443d-bc40-16b68a67fbbb";
const MAX_SEL      = 20;             // máximo de números por compra
const RESERVA_MS   = 5 * 60 * 1000;  // 5 minutos em ms

/* ═══════════════════════════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════════════════════════ */
let vendidos     = {};  // { "001": { nome, tel, cpf, ts } }
let reservados   = {};  // { "001": { ts } }
let pendentes    = {};  // { "001": { nome, tel, cpf, ts } } — pagamento enviado, aguardando aprovação do admin
let selecionados = [];  // ["001","007", ...]
let compraAtual  = {};  // { nome, tel, cpf, numeros }
let useFirebase  = false;
let dbRef        = null; // referência ao firebase db
let filtroStatus = "todos";
let timerInterval = null;
let timerExpiraEm = null;
let meuCpfSessao = null; // CPF de quem comprou/consultou agora (só em memória, some ao recarregar)

/* ═══════════════════════════════════════════════════════════
   INICIALIZAÇÃO
═══════════════════════════════════════════════════════════ */
(async function init() {
  // Desenha a grade na hora (números como disponíveis), sem esperar o Firebase.
  // Assim que os dados chegarem (Firestore ou localStorage), ela se atualiza sozinha.
  renderGrid();
  atualizarStats();

  // Tenta carregar Firebase dinamicamente
  const isConfigReal = !FIREBASE_CONFIG.apiKey.includes("DEMO");

  if (isConfigReal) {
    try {
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const {
        getFirestore, collection, doc, setDoc, deleteDoc,
        onSnapshot, runTransaction, getDocs, writeBatch,
      } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

      const app = initializeApp(FIREBASE_CONFIG);
      const db  = getFirestore(app);
      dbRef = { collection, doc, setDoc, deleteDoc, onSnapshot, runTransaction, getDocs, writeBatch, db };
      useFirebase = true;

      const aoFalhar = (origem) => (erro) => {
        console.error(`❌ Firebase (${origem}) falhou:`, erro);
        if (useFirebase) {
          useFirebase = false;
          dbRef = null;
          toast("Sem conexão com o banco online — os números não vão sincronizar entre dispositivos até isso ser corrigido.", "erro");
          initLocal();
        }
      };

      // Converte uma coleção do Firestore (docs) num objeto { "001": {...}, "002": {...} }
      const paraObjeto = (snap) => {
        const obj = {};
        snap.forEach(d => { obj[d.id] = d.data(); });
        return obj;
      };

      // Escuta em tempo real: números vendidos (aprovados)
      onSnapshot(collection(db, "numeros"), snap => {
        vendidos = paraObjeto(snap);
        renderGrid();
        atualizarStats();
        atualizarAdminSeAberto();
      }, aoFalhar("numeros"));

      // Escuta em tempo real: reservas (filtra expiradas)
      onSnapshot(collection(db, "reservas"), snap => {
        const agora = Date.now();
        const dados = paraObjeto(snap);
        reservados  = {};
        for (const [num, info] of Object.entries(dados)) {
          if (agora - info.ts < RESERVA_MS) reservados[num] = info;
        }
        renderGrid();
      }, aoFalhar("reservas"));

      // Escuta em tempo real: pagamentos aguardando aprovação
      onSnapshot(collection(db, "pendentes"), snap => {
        pendentes = paraObjeto(snap);
        renderGrid();
        atualizarStats();
        atualizarAdminSeAberto();
      }, aoFalhar("pendentes"));

      console.log("✅ Firestore conectado");
    } catch (e) {
      console.warn("Firebase falhou, usando localStorage:", e);
      initLocal();
    }
  } else {
    console.warn("Firebase não configurado — modo localStorage ativo.");
    initLocal();
  }

  atualizarAuthBar();
})();

/* ─────────────────────────────────────────────────────────
   MODO LOCAL (localStorage fallback)
───────────────────────────────────────────────────────── */
function initLocal() {
  vendidos   = JSON.parse(localStorage.getItem("rifa_vendidos")   || "{}");
  reservados = JSON.parse(localStorage.getItem("rifa_reservados") || "{}");
  pendentes  = JSON.parse(localStorage.getItem("rifa_pendentes")  || "{}");

  // Limpa reservas expiradas do localStorage
  const agora = Date.now();
  let mudou = false;
  for (const num in reservados) {
    if (agora - reservados[num].ts >= RESERVA_MS) {
      delete reservados[num];
      mudou = true;
    }
  }
  if (mudou) salvarLocal();

  renderGrid();
  atualizarStats();
}

function salvarLocal() {
  localStorage.setItem("rifa_vendidos",   JSON.stringify(vendidos));
  localStorage.setItem("rifa_reservados", JSON.stringify(reservados));
  localStorage.setItem("rifa_pendentes",  JSON.stringify(pendentes));
}

/* ═══════════════════════════════════════════════════════════
   RENDER DA GRADE
═══════════════════════════════════════════════════════════ */
function renderGrid() {
  const grid = document.getElementById("grid");
  const frag = document.createDocumentFragment();

  for (let i = 1; i <= 1000; i++) {
    const num = pad(i);
    const btn = document.createElement("button");
    btn.type         = "button";
    btn.className    = "num-btn";
    btn.textContent  = num;
    btn.dataset.num  = num;

    if (vendidos[num]) {
      btn.classList.add("vendido");
      btn.disabled = true;
      btn.title    = "Número vendido";
    } else if (pendentes[num]) {
      const ehMeu = meuCpfSessao && normalizarCPF(pendentes[num].cpf) === meuCpfSessao;
      if (ehMeu) {
        btn.classList.add("pendente");
        btn.disabled = true;
        btn.title    = "Seu pagamento está em análise (aguardando aprovação do admin)";
      } else {
        // Pra qualquer outra pessoa, não revela que é um pagamento pendente —
        // só aparece como indisponível no momento.
        btn.classList.add("reservado");
        btn.disabled = true;
        btn.title    = "Número indisponível no momento";
      }
    } else if (reservados[num]) {
      btn.classList.add("reservado");
      btn.disabled = true;
      btn.title    = "Reservado (compra em andamento)";
    } else if (selecionados.includes(num)) {
      btn.classList.add("selecionado");
    }

    btn.addEventListener("click", () => toggleNumero(num, btn));
    frag.appendChild(btn);
  }

  grid.innerHTML = "";
  grid.appendChild(frag);
  atualizarResumo();
  aplicarFiltros();
}

/* ═══════════════════════════════════════════════════════════
   TOGGLE DE NÚMERO
═══════════════════════════════════════════════════════════ */
function toggleNumero(num, btn) {
  const idx = selecionados.indexOf(num);

  if (idx >= 0) {
    selecionados.splice(idx, 1);
    btn.classList.remove("selecionado");
  } else {
    if (selecionados.length >= MAX_SEL) {
      toast(`Máximo de ${MAX_SEL} números por compra.`, "erro");
      return;
    }
    selecionados.push(num);
    btn.classList.add("selecionado");
  }
  atualizarResumo();
}

/* ═══════════════════════════════════════════════════════════
   UI: RESUMO + STATS
═══════════════════════════════════════════════════════════ */
function atualizarResumo() {
  const qtd     = selecionados.length;
  const total   = qtd * 10;
  const elRes   = document.getElementById("resumo");
  const elLista = document.getElementById("numSelecionados");
  const btnC    = document.getElementById("btnComprar");

  if (qtd === 0) {
    elRes.innerHTML = `<span class="resumo-hint">Toque nos números para selecionar</span>`;
    elLista.textContent = "—";
  } else {
    elRes.innerHTML = `<span>${qtd} número${qtd > 1 ? "s" : ""} &nbsp;→&nbsp; <strong>R$ ${total},00</strong></span>`;
    elLista.textContent = selecionados.join("  ·  ");
  }

  btnC.disabled = qtd === 0;
}

function atualizarStats() {
  const cnt = Object.keys(vendidos).length;
  const cntReservados = Object.keys(reservados).length;
  const cntPendentes  = Object.keys(pendentes).length;
  const elV = document.getElementById("totalVendidos");
  const elD = document.getElementById("totalDisp");
  const elP = document.getElementById("percentVendido");
  const elA = document.getElementById("valorArrecadado");
  const elB = document.getElementById("progressBar");
  const disponiveis = 1000 - cnt - cntReservados - cntPendentes;
  const percentual = (cnt / 1000) * 100;

  if (elV) elV.textContent = cnt;
  if (elD) elD.textContent = disponiveis;
  if (elP) elP.textContent = `${percentual.toFixed(1)}% vendido`;
  if (elA) elA.textContent = `R$ ${(cnt * 10).toLocaleString("pt-BR")},00 arrecadados`;
  if (elB) elB.style.width = `${percentual}%`;

  atualizarBannerBilhete();
}

/* ═══════════════════════════════════════════════════════════
   MEU BILHETE (consulta explícita por CPF — não fica
   "logado" sozinho, evitando conflito em aparelho compartilhado)
═══════════════════════════════════════════════════════════ */
function normalizarTel(tel) {
  return (tel || "").replace(/\D/g, "");
}

function obterNumerosPorCPF(cpf) {
  const cpfLimpo = normalizarCPF(cpf);
  if (!cpfLimpo) return [];
  const lista = [];
  Object.keys(vendidos).forEach(num => {
    if (normalizarCPF(vendidos[num].cpf) === cpfLimpo) lista.push({ num, status: "vendido", info: vendidos[num] });
  });
  Object.keys(pendentes).forEach(num => {
    if (normalizarCPF(pendentes[num].cpf) === cpfLimpo) lista.push({ num, status: "pendente", info: pendentes[num] });
  });
  return lista.sort((a, b) => a.num.localeCompare(b.num));
}

function renderBilheteConteudo(cpf, jaBuscou) {
  const el = document.getElementById("bilheteConteudo");
  const cpfValido = jaBuscou && validarCPF(cpf || "");

  if (!cpfValido) {
    el.innerHTML = "";
    return;
  }

  const numeros = obterNumerosPorCPF(cpf);

  if (numeros.length === 0) {
    el.innerHTML = `<div class="bilhete-vazio">Nenhum número encontrado pra esse CPF nesta rifa.</div>`;
    return;
  }

  const nomeComprador = numeros[0].info.nome || "";
  const qtdPendentes  = numeros.filter(n => n.status === "pendente").length;

  el.innerHTML = `
    <div class="bilhete-card">
      <div class="bilhete-evento">Rifa Beneficente · Umari Fight</div>
      <div class="bilhete-nome">${nomeComprador}</div>
      <div class="bilhete-linha-sep"></div>
      <div class="bilhete-numeros-label">Seus números</div>
      <div class="bilhete-numeros">
        ${numeros.map(({ num, status }) => `<span class="bilhete-num${status === "pendente" ? " status-pendente" : ""}" title="${status === "pendente" ? "Aguardando aprovação" : "Aprovado"}">${num}${status === "pendente" ? " ⏳" : ""}</span>`).join("")}
      </div>
      ${qtdPendentes > 0 ? `
        <div class="bilhete-aviso-pendente">
          ⏳ <strong>${qtdPendentes} número${qtdPendentes > 1 ? "s" : ""} com pagamento pendente.</strong>
          Só fica confirmado depois que o administrador aprovar o comprovante — até lá, o número continua reservado só pra você e não pode ser vendido pra outra pessoa.
        </div>
      ` : ""}
      <div class="bilhete-total">${numeros.length} número${numeros.length > 1 ? "s" : ""} · R$ ${numeros.length * 10},00</div>
    </div>
  `;
}

/* Mostra o aviso "Já comprou números?" só quando a pessoa comprou ou já
   consultou com sucesso NESTA visita (meuCpfSessao) — nunca por padrão. */
function atualizarBannerBilhete() {
  const banner = document.getElementById("meuBilheteResumo");
  if (!banner) return;
  const temNumeros = meuCpfSessao && obterNumerosPorCPF(meuCpfSessao).length > 0;
  banner.style.display = temNumeros ? "" : "none";
}

function buscarMeuBilhete() {
  const campo = document.getElementById("bilheteCpfInput");
  const cpf   = campo.value.trim();

  if (!validarCPF(cpf)) {
    toast("Informe um CPF válido pra consultar.", "erro");
    campo.focus();
    return;
  }

  const cpfLimpo = normalizarCPF(cpf);
  meuCpfSessao = cpfLimpo; // passa a destacar os números pendentes dessa pessoa na grade também
  renderGrid();
  renderBilheteConteudo(cpfLimpo, true);
  atualizarBannerBilhete();
}

function abrirMeuBilhete() {
  const campo = document.getElementById("bilheteCpfInput");
  if (campo) campo.value = "";
  renderBilheteConteudo(null, false);
  document.getElementById("bilheteOverlay").classList.add("ativo");
  document.body.style.overflow = "hidden";
  setTimeout(() => campo && campo.focus(), 50);
}

function fecharMeuBilhete() {
  document.getElementById("bilheteOverlay").classList.remove("ativo");
  document.body.style.overflow = "";
}

function fecharSeForaBilhete(e) {
  if (e.target.id === "bilheteOverlay") fecharMeuBilhete();
}

/* ═══════════════════════════════════════════════════════════
   MODAL: ABRIR / FECHAR
═══════════════════════════════════════════════════════════ */
function abrirModal() {
  if (selecionados.length === 0) return;

  // preenche resumo do passo 1
  document.getElementById("mNumeros").textContent = selecionados.join("  ·  ");
  document.getElementById("mTotal").textContent   = `R$ ${selecionados.length * 10},00`;
  document.getElementById("fNome").value = "";
  document.getElementById("fTel").value  = "";

  mostrarPasso("passoForm");
  document.getElementById("modalOverlay").classList.add("ativo");
  document.body.style.overflow = "hidden";
}

function fecharModal() {
  const estavaNoPix = document.getElementById("passoPix").style.display !== "none";
  pararTimerPix();
  if (estavaNoPix && compraAtual.numeros && compraAtual.numeros.length) {
    liberarReserva(compraAtual.numeros);
    compraAtual = {};
  }
  document.getElementById("modalOverlay").classList.remove("ativo");
  document.body.style.overflow = "";
}

function fecharSeForaModal(e) {
  if (e.target.id === "modalOverlay") fecharModal();
}

function fecharSucesso() {
  fecharModal();
  selecionados = [];
  renderGrid();
}

function mostrarPasso(id) {
  ["passoForm", "passoPix", "passoSucesso"].forEach(p => {
    document.getElementById(p).style.display = (p === id) ? "" : "none";
  });
}

/* ═══════════════════════════════════════════════════════════
   MÁSCARA DE TELEFONE + PASSO 1 → PASSO 2 (validação + reserva)
═══════════════════════════════════════════════════════════ */
function mascararTelefone(input) {
  let v = input.value.replace(/\D/g, "").slice(0, 11); // só números, máx. 11 dígitos

  if (v.length > 10) {
    v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  } else if (v.length > 5) {
    v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  } else if (v.length > 2) {
    v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  } else if (v.length > 0) {
    v = v.replace(/(\d{0,2})/, "($1");
  }

  input.value = v;
}

function mascararCPF(input) {
  let v = input.value.replace(/\D/g, "").slice(0, 11); // só números, máx. 11 dígitos

  if (v.length > 9) {
    v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
  } else if (v.length > 6) {
    v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
  } else if (v.length > 3) {
    v = v.replace(/(\d{3})(\d{0,3})/, "$1.$2");
  }

  input.value = v;
}

function normalizarCPF(cpf) {
  return (cpf || "").replace(/\D/g, "");
}

function formatarCPFExibicao(cpf) {
  const limpo = normalizarCPF(cpf);
  if (limpo.length !== 11) return "—";
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function validarCPF(cpfBruto) {
  const cpf = normalizarCPF(cpfBruto);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i], 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9], 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i], 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[10], 10)) return false;

  return true;
}

async function irParaPix() {
  const nome = document.getElementById("fNome").value.trim();
  const tel  = document.getElementById("fTel").value.trim();
  const cpf  = document.getElementById("fCpf").value.trim();

  if (!nome) {
    toast("Informe seu nome completo.", "erro");
    document.getElementById("fNome").focus();
    return;
  }
  if (tel.replace(/\D/g, "").length < 10) {
    toast("Informe um telefone válido com DDD.", "erro");
    document.getElementById("fTel").focus();
    return;
  }
  if (!validarCPF(cpf)) {
    toast("Informe um CPF válido.", "erro");
    document.getElementById("fCpf").focus();
    return;
  }

  const btn = document.getElementById("btnIrPix");
  btn.disabled    = true;
  btn.textContent = "Verificando...";

  // Verifica conflitos antes de reservar
  const conflito = selecionados.filter(n => vendidos[n] || reservados[n]);
  if (conflito.length) {
    toast(`Número(s) ${conflito.join(", ")} indisponíveis. Remova e tente novamente.`, "erro");
    selecionados = selecionados.filter(n => !conflito.includes(n));
    renderGrid();
    btn.disabled    = false;
    btn.textContent = "Ir para Pagamento →";
    return;
  }

  // Reserva (Firebase ou local)
  const erros = await reservarNumeros(selecionados, nome);
  if (erros.length) {
    toast(`Número(s) ${erros.join(", ")} já foram reservados. Remova e tente novamente.`, "erro");
    selecionados = selecionados.filter(n => !erros.includes(n));
    renderGrid();
    btn.disabled    = false;
    btn.textContent = "Ir para Pagamento →";
    return;
  }

  // Salva estado da compra
  compraAtual = { nome, tel, cpf: normalizarCPF(cpf), numeros: [...selecionados] };

  // Preenche passo 2
  document.getElementById("pNome").textContent    = nome;
  document.getElementById("pNumeros").textContent = selecionados.join("  ·  ");
  document.getElementById("pTotal").textContent   = `R$ ${selecionados.length * 10},00`;

  mostrarPasso("passoPix");
  iniciarTimerPix();
  btn.disabled    = false;
  btn.textContent = "Ir para Pagamento →";
}

/* ─────────────────────────────────────────────────────────
   Reservar números
───────────────────────────────────────────────────────── */
async function reservarNumeros(nums, nome) {
  const erros = [];

  if (useFirebase && dbRef) {
    const { doc, runTransaction, db } = dbRef;
    for (const num of nums) {
      try {
        await runTransaction(db, async (tx) => {
          const refNum = doc(db, "reservas", num);
          const snap   = await tx.get(refNum);
          const agora  = Date.now();
          const current = snap.exists() ? snap.data() : null;
          if (current && (agora - current.ts) < RESERVA_MS) {
            throw new Error("reservado");
          }
          tx.set(refNum, { ts: agora, nome });
        });
      } catch {
        erros.push(num);
      }
    }
  } else {
    // Local: verifica e reserva
    const agora = Date.now();
    for (const num of nums) {
      const r = reservados[num];
      if (r && (agora - r.ts) < RESERVA_MS) {
        erros.push(num);
      } else {
        reservados[num] = { ts: agora, nome };
      }
    }
    salvarLocal();
    renderGrid();
  }

  return erros;
}

/* ─────────────────────────────────────────────────────────
   Liberar reserva (cancelamento / expiração)
───────────────────────────────────────────────────────── */
async function liberarReserva(nums) {
  if (useFirebase && dbRef) {
    const { doc, deleteDoc, db } = dbRef;
    try {
      for (const num of nums) {
        await deleteDoc(doc(db, "reservas", num));
      }
    } catch { /* ok */ }
  } else {
    for (const num of nums) {
      delete reservados[num];
    }
    salvarLocal();
    renderGrid();
    atualizarStats();
  }
}

/* ─────────────────────────────────────────────────────────
   Temporizador de 5 minutos (passo PIX)
───────────────────────────────────────────────────────── */
function iniciarTimerPix() {
  pararTimerPix();
  timerExpiraEm = Date.now() + RESERVA_MS;

  function tick() {
    const elTimer = document.getElementById("pixTimer");
    const elValor = document.getElementById("pixTimerValor");
    const restanteMs = timerExpiraEm - Date.now();

    if (restanteMs <= 0) {
      pararTimerPix();
      expirarReserva();
      return;
    }

    const totalSeg = Math.ceil(restanteMs / 1000);
    const min = String(Math.floor(totalSeg / 60)).padStart(2, "0");
    const seg = String(totalSeg % 60).padStart(2, "0");
    if (elValor) elValor.textContent = `${min}:${seg}`;
    if (elTimer) elTimer.classList.toggle("urgente", totalSeg <= 60);
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function pararTimerPix() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerExpiraEm = null;
}

async function expirarReserva() {
  const nums = compraAtual.numeros || [];
  if (nums.length) {
    await liberarReserva(nums);
    toast("Tempo esgotado! Sua reserva expirou e os números foram liberados.", "erro");
  }
  selecionados = [];
  compraAtual  = {};
  fecharModal();
  renderGrid();
  atualizarResumo();
}

/* ═══════════════════════════════════════════════════════════
   COPIAR CHAVE PIX
═══════════════════════════════════════════════════════════ */
function copiarPix() {
  navigator.clipboard.writeText(PIX_CHAVE).then(() => {
    toast("Chave PIX copiada! ✓", "ok");
    const btn = document.getElementById("btnCopiar");
    btn.textContent = "✓ Copiado!";
    setTimeout(() => { btn.textContent = "Copiar Chave PIX"; }, 2500);
  }).catch(() => {
    toast("Não foi possível copiar. Copie manualmente.", "erro");
  });
}

/* ═══════════════════════════════════════════════════════════
   CONFIRMAR PAGAMENTO → ENVIA PARA APROVAÇÃO DO ADMIN
═══════════════════════════════════════════════════════════ */
async function confirmarPagamento() {
  const { nome, tel, cpf, numeros } = compraAtual;
  const btn = document.getElementById("btnConfirmar");
  btn.disabled    = true;
  btn.textContent = "Registrando...";

  // Marca a sessão atual como dona desses números (só em memória — some ao
  // recarregar a página), pra grade destacar como "pendente" pra quem comprou
  // agora, sem depender de localStorage nem causar conflito em aparelho compartilhado.
  meuCpfSessao = cpf;

  const erros = await registrarPendente(numeros, nome, tel, cpf);

  if (erros.length) {
    toast(`Número(s) ${erros.join(", ")} já foram comprados por outra pessoa.`, "erro");
    selecionados = selecionados.filter(n => !erros.includes(n));
    renderGrid();
    btn.disabled    = false;
    btn.textContent = "Já paguei, confirmar!";
    return;
  }

  // Sucesso: limpa seleção
  pararTimerPix();
  selecionados = [];
  atualizarResumo();
  atualizarStats();
  renderGrid();

  // Preenche tela de sucesso
  document.getElementById("sNome").textContent    = nome;
  document.getElementById("sNumeros").textContent = numeros.join("  ·  ");

  // Monta link WhatsApp pré-preenchido
  const msg = encodeURIComponent(
    `Olá! Me chamo *${nome}* e acabei de pagar a rifa Umari Fight! 🥋\n\n` +
    `📋 *Números:* ${numeros.join(", ")}\n` +
    `💰 *Valor pago:* R$ ${numeros.length * 10},00\n\n` +
    `Segue o comprovante do PIX! ✅`
  );
  document.getElementById("btnWpp").href = `https://wa.me/${WHATSAPP_NUM}?text=${msg}`;

  mostrarPasso("passoSucesso");
  btn.disabled    = false;
  btn.textContent = "Já paguei, confirmar!";
}

/* ─────────────────────────────────────────────────────────
   Registrar pagamento como pendente (aguardando aprovação)
───────────────────────────────────────────────────────── */
async function registrarPendente(numeros, nome, tel, cpf) {
  const erros = [];

  if (useFirebase && dbRef) {
    const { doc, runTransaction, deleteDoc, db } = dbRef;
    for (const num of numeros) {
      try {
        await runTransaction(db, async (tx) => {
          const refPend = doc(db, "pendentes", num);
          const refNum  = doc(db, "numeros", num);
          const [snapPend, snapNum] = await Promise.all([tx.get(refPend), tx.get(refNum)]);
          if (snapPend.exists() || snapNum.exists()) throw new Error("ocupado"); // já pendente ou vendido
          tx.set(refPend, { nome, tel, cpf, ts: Date.now() });
        });
      } catch {
        erros.push(num);
      }
    }
    // Remove reservas dos números que entraram como pendentes
    for (const num of numeros) {
      if (!erros.includes(num)) {
        try {
          await deleteDoc(doc(db, "reservas", num));
        } catch { /* ok */ }
      }
    }
  } else {
    // Local
    for (const num of numeros) {
      if (vendidos[num] || pendentes[num]) {
        erros.push(num);
      } else {
        pendentes[num] = { nome, tel, cpf, ts: Date.now() };
        delete reservados[num];
      }
    }
    salvarLocal();
    renderGrid();
    atualizarStats();
  }

  return erros;
}

/* ─────────────────────────────────────────────────────────
   APROVAR / REJEITAR PAGAMENTO (admin)
───────────────────────────────────────────────────────── */
async function aprovarPagamento(num) {
  const sessao = obterSessao();
  if (!sessao || !sessao.isAdmin) { toast("Acesso restrito ao administrador.", "erro"); return; }

  const registro = pendentes[num];
  if (!registro) { toast("Esse pagamento não está mais pendente.", "erro"); return; }

  try {
    if (useFirebase && dbRef) {
      const { doc, setDoc, deleteDoc, db } = dbRef;
      await setDoc(doc(db, "numeros", num), { nome: registro.nome, tel: registro.tel, cpf: registro.cpf, ts: Date.now() });
      await deleteDoc(doc(db, "pendentes", num));
    } else {
      vendidos[num] = { nome: registro.nome, tel: registro.tel, cpf: registro.cpf, ts: Date.now() };
      delete pendentes[num];
      salvarLocal();
      renderGrid();
      atualizarStats();
    }
    toast(`Número ${num} aprovado! ✓`, "ok");
    renderAdminPendentes();
    renderAdminVendidos();
  } catch (e) {
    console.error(e);
    toast("Não foi possível aprovar. Tente novamente.", "erro");
  }
}

async function rejeitarPagamento(num) {
  const sessao = obterSessao();
  if (!sessao || !sessao.isAdmin) { toast("Acesso restrito ao administrador.", "erro"); return; }

  if (!confirm(`Rejeitar o pagamento do número ${num}? Ele voltará a ficar disponível.`)) return;

  try {
    if (useFirebase && dbRef) {
      const { doc, deleteDoc, db } = dbRef;
      await deleteDoc(doc(db, "pendentes", num));
    } else {
      delete pendentes[num];
      salvarLocal();
      renderGrid();
      atualizarStats();
    }
    toast(`Pagamento do número ${num} rejeitado.`, "erro");
    renderAdminPendentes();
  } catch (e) {
    console.error(e);
    toast("Não foi possível rejeitar. Tente novamente.", "erro");
  }
}

/* ─────────────────────────────────────────────────────────
   RESETAR TUDO (zona de risco)
   Apaga vendidos, reservados e pendentes — volta a rifa ao início.
───────────────────────────────────────────────────────── */
async function limparColecaoFirestore(nomeColecao) {
  const { collection, getDocs, writeBatch, db } = dbRef;
  const snap = await getDocs(collection(db, nomeColecao));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

async function resetarTudo() {
  const sessao = obterSessao();
  if (!sessao || !sessao.isAdmin) { toast("Acesso restrito ao administrador.", "erro"); return; }

  const digitado = prompt(
    "⚠️ Isso vai apagar TODOS os números vendidos, pendentes e reservados — a rifa volta ao início do zero.\n\n" +
    "Essa ação não pode ser desfeita. Digite RESETAR para confirmar:"
  );
  if (digitado === null) return;
  if (digitado.trim().toUpperCase() !== "RESETAR") {
    toast("Reset cancelado — texto de confirmação não confere.", "erro");
    return;
  }

  try {
    if (useFirebase && dbRef) {
      await limparColecaoFirestore("numeros");
      await limparColecaoFirestore("reservas");
      await limparColecaoFirestore("pendentes");
    } else {
      vendidos   = {};
      reservados = {};
      pendentes  = {};
      salvarLocal();
      renderGrid();
      atualizarStats();
    }
    selecionados = [];
    atualizarResumo();
    renderAdminPendentes();
    renderAdminVendidos();
    toast("Todos os números foram resetados!", "ok");
  } catch (e) {
    console.error(e);
    toast("Não foi possível resetar. Tente novamente.", "erro");
  }
}

/* ═══════════════════════════════════════════════════════════
   BUSCA / FILTRO
═══════════════════════════════════════════════════════════ */
function filtrarNumero(val) {
  aplicarFiltros(val);
}

function aplicarFiltros(valorBusca) {
  const campoBusca = document.getElementById("buscaNumero");
  const buscaCrua = valorBusca ?? (campoBusca ? campoBusca.value : "");
  const busca = buscaCrua ? buscaCrua.padStart(3, "0").slice(-3) : "";

  document.querySelectorAll(".num-btn").forEach(btn => {
    const num = btn.dataset.num;
    const bateBusca = !busca || num.includes(busca);
    const bateStatus =
      filtroStatus === "todos" ||
      (filtroStatus === "vendidos" && btn.classList.contains("vendido")) ||
      (filtroStatus === "reservados" && btn.classList.contains("reservado")) ||
      (filtroStatus === "disponiveis" && !btn.classList.contains("vendido") && !btn.classList.contains("reservado") && !btn.classList.contains("pendente"));

    btn.style.display = bateBusca && bateStatus ? "" : "none";
  });
}

function limparBusca() {
  const input = document.getElementById("buscaNumero");
  if (input) input.value = "";

  selecionados = [];
  filtroStatus = "todos";
  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  const tabTodos = document.querySelector(".tab");
  if (tabTodos) tabTodos.classList.add("active");

  renderGrid();
  atualizarResumo();
}

function filtrarStatus(status, el) {
  filtroStatus = status;
  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  if (el) el.classList.add("active");
  aplicarFiltros();
}

function selecionarAleatorio() {
  const livres = [];
  for (let i = 1; i <= 1000; i++) {
    const num = pad(i);
    if (!vendidos[num] && !reservados[num] && !pendentes[num] && !selecionados.includes(num)) livres.push(num);
  }

  if (!livres.length) {
    toast("Nenhum número disponível.", "erro");
    return;
  }

  const num = livres[Math.floor(Math.random() * livres.length)];
  const btn = document.querySelector(`.num-btn[data-num="${num}"]`);
  if (btn) toggleNumero(num, btn);
}

/* ═══════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════ */
function toast(msg, tipo = "ok") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className   = `toast ativo ${tipo}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove("ativo"), 4000);
}


/* ═══════════════════════════════════════════════════════════
   SESSÃO DE ADMIN (sem conta/login — só senha)
   ADMIN_SENHA vem de firebase-config.js
═══════════════════════════════════════════════════════════ */
function obterSessao() {
  try {
    return JSON.parse(localStorage.getItem("rifa_sessao") || "null");
  } catch {
    return null;
  }
}

function salvarSessao(dados) {
  localStorage.setItem("rifa_sessao", JSON.stringify(dados));
}

function encerrarSessao() {
  localStorage.removeItem("rifa_sessao");
}

/* ─────────────────────────────────────────────────────────
   MODAL DE SENHA DO ADMIN
───────────────────────────────────────────────────────── */
function abrirAdminLogin() {
  const sessao = obterSessao();
  if (sessao && sessao.isAdmin) { abrirAdmin(); return; }
  document.getElementById("adminLoginOverlay").classList.add("ativo");
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("adminSenhaInput")?.focus(), 50);
}

function fecharAdminLogin() {
  document.getElementById("adminLoginOverlay").classList.remove("ativo");
  document.body.style.overflow = "";
}

function fecharSeForaAdminLogin(e) {
  if (e.target.id === "adminLoginOverlay") fecharAdminLogin();
}

const ICONE_OLHO_ABERTO = `<svg class="ic-olho" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICONE_OLHO_FECHADO = `<svg class="ic-olho" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.66 18.66 0 0 1-2.16 3.19"/><path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a9.26 9.26 0 0 0 5.39-1.61"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>`;

function alternarSenha(inputId, botao) {
  const campo = document.getElementById(inputId);
  if (!campo) return;
  const visivel = campo.type === "text";
  campo.type = visivel ? "password" : "text";
  botao.innerHTML = visivel ? ICONE_OLHO_ABERTO : ICONE_OLHO_FECHADO;
  botao.setAttribute("aria-label", visivel ? "Mostrar senha" : "Ocultar senha");
}

function fazerLoginAdmin() {
  const campo = document.getElementById("adminSenhaInput");
  const senha = campo.value;

  if (senha !== ADMIN_SENHA) {
    toast("Senha incorreta.", "erro");
    campo.value = "";
    campo.focus();
    return;
  }

  salvarSessao({ isAdmin: true });
  campo.value = "";
  fecharAdminLogin();
  atualizarAuthBar();
  toast("Acesso de administrador liberado!", "ok");
  abrirAdmin();
}

function sairAdmin() {
  encerrarSessao();
  atualizarAuthBar();
  fecharAdmin();
  toast("Sessão de administrador encerrada.", "ok");
}

/* ─────────────────────────────────────────────────────────
   BARRA DE AUTENTICAÇÃO (topo do banner)
───────────────────────────────────────────────────────── */
function atualizarAuthBar() {
  const bar = document.getElementById("authBar");
  if (!bar) return;
  const sessao = obterSessao();

  if (sessao && sessao.isAdmin) {
    bar.innerHTML = `
      <button class="auth-pill auth-admin" type="button" onclick="abrirAdmin()">⚙ Admin</button>
      <button class="auth-pill auth-sair" type="button" onclick="sairAdmin()">Sair</button>
    `;
  } else {
    bar.innerHTML = `<button class="auth-pill" type="button" onclick="abrirAdminLogin()">🔐 Admin</button>`;
  }
}

/* ─────────────────────────────────────────────────────────
   PAINEL ADMIN
───────────────────────────────────────────────────────── */
function abrirAdmin() {
  const sessao = obterSessao();
  if (!sessao || !sessao.isAdmin) {
    toast("Acesso restrito ao administrador.", "erro");
    return;
  }
  renderAdminPendentes();
  renderAdminVendidos();
  document.getElementById("adminOverlay").classList.add("ativo");
  document.body.style.overflow = "hidden";
}

function fecharAdmin() {
  document.getElementById("adminOverlay").classList.remove("ativo");
  document.body.style.overflow = "";
}

function fecharSeForaAdmin(e) {
  if (e.target.id === "adminOverlay") fecharAdmin();
}

// Atualiza as listas do painel admin em tempo real, se ele estiver aberto
function atualizarAdminSeAberto() {
  const overlay = document.getElementById("adminOverlay");
  if (overlay && overlay.classList.contains("ativo")) {
    renderAdminPendentes();
    renderAdminVendidos();
  }
}

function renderAdminPendentes() {
  const lista = document.getElementById("adminListaPendentes");
  if (!lista) return;
  const entradas = Object.entries(pendentes).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));

  document.getElementById("adTotalPendentes").textContent = entradas.length;

  if (!entradas.length) {
    lista.innerHTML = `<div class="admin-vazio">Nenhum pagamento aguardando aprovação.</div>`;
    return;
  }

  lista.innerHTML = entradas.map(([num, info]) => `
    <div class="pendente-card">
      <div class="pendente-card-topo">
        <span class="pendente-num">${num}</span>
        <div class="pendente-info">
          <div class="pendente-nome">${info.nome || "—"}</div>
          <div class="pendente-tel">📱 ${info.tel || "—"} · CPF ${formatarCPFExibicao(info.cpf)}</div>
        </div>
      </div>
      <div class="pendente-acoes">
        <button class="btn-aprovar" type="button" onclick="aprovarPagamento('${num}')">✓ Confirmar Pagamento</button>
        <button class="btn-rejeitar" type="button" onclick="rejeitarPagamento('${num}')">✕ Rejeitar</button>
      </div>
    </div>
  `).join("");
}

function renderAdminVendidos() {
  const lista = document.getElementById("adminLista");
  if (!lista) return;
  const entradas = Object.entries(vendidos).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));

  document.getElementById("adTotalVendidos").textContent   = entradas.length;
  document.getElementById("adTotalArrecadado").textContent = `R$ ${(entradas.length * 10).toLocaleString("pt-BR")},00`;

  if (!entradas.length) {
    lista.innerHTML = `<div class="admin-vazio">Nenhuma venda aprovada ainda.</div>`;
    return;
  }

  lista.innerHTML = entradas.map(([num, info]) => `
    <div class="admin-row">
      <div class="admin-row-info">
        <div class="admin-row-nome">${info.nome || "—"}</div>
        <div class="admin-row-tel">${info.tel || "—"} · CPF ${formatarCPFExibicao(info.cpf)}</div>
      </div>
      <span class="admin-row-num">${num}</span>
    </div>
  `).join("");
}

/* ═══════════════════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════════════════ */
function pad(n) {
  return String(n).padStart(3, "0");
}

/* ── Expõe funções para o HTML (onclick) ── */
window.abrirModal         = abrirModal;
window.fecharModal        = fecharModal;
window.fecharSeForaModal  = fecharSeForaModal;
window.fecharSucesso      = fecharSucesso;
window.mascararTelefone   = mascararTelefone;
window.irParaPix          = irParaPix;
window.copiarPix          = copiarPix;
window.confirmarPagamento = confirmarPagamento;
window.filtrarNumero      = filtrarNumero;
window.limparBusca        = limparBusca;
window.filtrarStatus      = filtrarStatus;
window.selecionarAleatorio = selecionarAleatorio;
window.abrirMeuBilhete     = abrirMeuBilhete;
window.fecharMeuBilhete    = fecharMeuBilhete;
window.fecharSeForaBilhete = fecharSeForaBilhete;
window.buscarMeuBilhete    = buscarMeuBilhete;
window.mascararCPF         = mascararCPF;
window.alternarSenha      = alternarSenha;
window.abrirAdminLogin        = abrirAdminLogin;
window.fecharAdminLogin       = fecharAdminLogin;
window.fecharSeForaAdminLogin = fecharSeForaAdminLogin;
window.fazerLoginAdmin        = fazerLoginAdmin;
window.sairAdmin              = sairAdmin;
window.abrirAdmin          = abrirAdmin;
window.fecharAdmin         = fecharAdmin;
window.fecharSeForaAdmin   = fecharSeForaAdmin;
window.aprovarPagamento    = aprovarPagamento;
window.rejeitarPagamento   = rejeitarPagamento;
window.resetarTudo         = resetarTudo;

document.addEventListener("DOMContentLoaded", () => {
  const btnLimpar = document.querySelector(".btn-clear");
  if (btnLimpar) btnLimpar.addEventListener("click", limparBusca);
  atualizarAuthBar();
});
