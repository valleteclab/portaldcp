import { useState } from "react";

// ─── Mock Data ────────────────────────────────────────────────────────────────
const ordens = [
  {
    id: "OF-2024-0342",
    fornecedor: "Distribuidora Central Ltda.",
    cnpj: "12.345.678/0001-99",
    dataEmissao: "18/02/2025",
    valorTotal: 48320.0,
    itens: 5,
    status: "AGUARDANDO",
    nfPortal: {
      numero: "003421",
      serie: "1",
      dataEmissao: "21/02/2025",
      chaveAcesso: "35250212345678000199550010000034211000034219",
      valorTotal: 48320.0,
      xmlDisponivel: true,
    },
    produtos: [
      {
        id: 1,
        nomeFornecedor: "PAPEL A4 BRANCO 75G/M2 RESMA 500FLS",
        qtdNF: 100,
        unNF: "RESMA",
        valorUnit: 24.5,
        tipo: "CONSUMO",
        match: { id: "ALM-001", nome: "Papel Sulfite A4 75g — Resma c/ 500 fls", confianca: 98 },
        matchConfirmado: false,
      },
      {
        id: 2,
        nomeFornecedor: "CANETA ESFEROGRAFICA AZUL CX12",
        qtdNF: 50,
        unNF: "CX",
        valorUnit: 18.9,
        tipo: "CONSUMO",
        match: { id: "ALM-004", nome: "Caneta Esferográfica Azul — Caixa c/ 12 un", confianca: 95 },
        matchConfirmado: false,
      },
      {
        id: 3,
        nomeFornecedor: "NOTEBOOK DELL INSPIRON 15 I5 8GB 256SSD",
        qtdNF: 3,
        unNF: "UN",
        valorUnit: 4800.0,
        tipo: "PERMANENTE",
        match: { id: "PAT-012", nome: "Notebook Dell Inspiron 15 — Core i5 / 8GB / 256GB SSD", confianca: 91 },
        matchConfirmado: false,
      },
      {
        id: 4,
        nomeFornecedor: "GRAMPEADOR DE MESA 26/6 PRETO",
        qtdNF: 10,
        unNF: "UN",
        valorUnit: 45.0,
        tipo: "CONSUMO",
        match: { id: "ALM-018", nome: "Grampeador de Mesa 26/6", confianca: 87 },
        matchConfirmado: false,
      },
      {
        id: 5,
        nomeFornecedor: "MONITOR LED 24 FULL HD SAMSUNG",
        qtdNF: 2,
        unNF: "UN",
        valorUnit: 1420.0,
        tipo: "PERMANENTE",
        match: null,
        matchConfirmado: false,
      },
    ],
  },
  {
    id: "OF-2024-0338",
    fornecedor: "Tech Suprimentos S/A",
    cnpj: "98.765.432/0001-11",
    dataEmissao: "15/02/2025",
    valorTotal: 12750.0,
    itens: 3,
    status: "AGUARDANDO",
    nfPortal: null,
  },
  {
    id: "OF-2024-0331",
    fornecedor: "Escritório & Cia ME",
    cnpj: "45.123.789/0001-55",
    dataEmissao: "10/02/2025",
    valorTotal: 6890.0,
    itens: 8,
    status: "AGUARDANDO",
    nfPortal: null,
  },
];

const usuarioAtual = { nome: "João Ferreira", perfil: "almoxarifado", podePatrimonio: false };
// Troque podePatrimonio: true para simular usuário com ambas permissões

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const confiancaColor = (c) =>
  c >= 95 ? "#22c55e" : c >= 80 ? "#f59e0b" : "#ef4444";

const tipoColor = (t) =>
  t === "CONSUMO"
    ? { bg: "#dbeafe", text: "#1d4ed8", label: "Consumo" }
    : { bg: "#ede9fe", text: "#7c3aed", label: "Permanente" };

// ─── Sub-components ──────────────────────────────────────────────────────────
function Badge({ children, color, bg }) {
  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 20,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

function StatusDot({ color, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
      <span
        style={{
          width: 8, height: 8, borderRadius: "50%",
          background: color, display: "inline-block",
          boxShadow: `0 0 0 3px ${color}30`,
        }}
      />
      {label}
    </span>
  );
}

// ─── Tela principal ──────────────────────────────────────────────────────────
export default function TelaRecebimento() {
  const [ordemSelecionada, setOrdemSelecionada] = useState(null);
  const [etapa, setEtapa] = useState("lista"); // lista | nf | mapeamento | recebimento
  const [produtos, setProdutos] = useState([]);
  const [xmlImportado, setXmlImportado] = useState(false);
  const [aceiteAlmox, setAceiteAlmox] = useState(false);
  const [aceitePatrim, setAceitePatrim] = useState(false);
  const [notificacaoEnviada, setNotificacaoEnviada] = useState(false);

  const abrirOrdem = (of) => {
    setOrdemSelecionada(of);
    setProdutos(of.produtos ? of.produtos.map((p) => ({ ...p })) : []);
    setXmlImportado(false);
    setAceiteAlmox(false);
    setAceitePatrim(false);
    setNotificacaoEnviada(false);
    setEtapa(of.nfPortal ? "nf" : "sem_nf");
  };

  const importarXML = () => {
    setXmlImportado(true);
    setNotificacaoEnviada(true);
    setTimeout(() => setEtapa("mapeamento"), 600);
  };

  const confirmarMatch = (id, novoMatch) => {
    setProdutos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, match: novoMatch || p.match, matchConfirmado: true } : p))
    );
  };

  const confirmarTodos = () => {
    setProdutos((prev) => prev.map((p) => ({ ...p, matchConfirmado: p.match ? true : p.matchConfirmado })));
    setEtapa("recebimento");
  };

  const todosConfirmados = produtos.every((p) => p.matchConfirmado || !p.match);
  const itensConsumo = produtos.filter((p) => p.tipo === "CONSUMO");
  const itensPermanente = produtos.filter((p) => p.tipo === "PERMANENTE");
  const totalAceito = (aceiteAlmox || itensConsumo.length === 0) && (aceitePatrim || itensPermanente.length === 0 || !usuarioAtual.podePatrimonio && aceitePatrim);

  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        background: "#f1f5f9",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          background: "#0f172a",
          padding: "0 32px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {ordemSelecionada && etapa !== "lista" && (
            <button
              onClick={() => { setOrdemSelecionada(null); setEtapa("lista"); }}
              style={{
                background: "none", border: "none", color: "#94a3b8",
                cursor: "pointer", fontSize: 18, padding: "0 8px 0 0",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              ← <span style={{ fontSize: 13 }}>Voltar</span>
            </button>
          )}
          <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>
            📦 Recebimentos
          </span>
          {ordemSelecionada && (
            <>
              <span style={{ color: "#334155", fontSize: 14 }}>/</span>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>{ordemSelecionada.id}</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 12, fontWeight: 700,
            }}
          >
            {usuarioAtual.nome.charAt(0)}
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ color: "#f1f5f9", fontSize: 12, fontWeight: 600 }}>{usuarioAtual.nome}</div>
            <div style={{ color: "#475569", fontSize: 11 }}>
              {usuarioAtual.podePatrimonio ? "Almoxarifado · Patrimônio" : "Almoxarifado"}
            </div>
          </div>
        </div>
      </div>

      {/* Breadcrumb etapas */}
      {ordemSelecionada && etapa !== "lista" && etapa !== "sem_nf" && (
        <div
          style={{
            background: "#fff",
            borderBottom: "1px solid #e2e8f0",
            padding: "0 32px",
            display: "flex",
            alignItems: "center",
            gap: 0,
            height: 44,
          }}
        >
          {[
            { key: "nf", label: "1. Nota Fiscal" },
            { key: "mapeamento", label: "2. Vincular Produtos" },
            { key: "recebimento", label: "3. Recebimento" },
          ].map((s, i, arr) => {
            const ativo = etapa === s.key;
            const concluido =
              (s.key === "nf" && ["mapeamento", "recebimento"].includes(etapa)) ||
              (s.key === "mapeamento" && etapa === "recebimento");
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center" }}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "0 16px", height: 44,
                    borderBottom: ativo ? "2px solid #3b82f6" : "2px solid transparent",
                    color: ativo ? "#1d4ed8" : concluido ? "#22c55e" : "#94a3b8",
                    fontSize: 13, fontWeight: ativo ? 700 : 500,
                    cursor: concluido ? "pointer" : "default",
                    transition: "all 0.2s",
                  }}
                  onClick={() => concluido && setEtapa(s.key)}
                >
                  {concluido ? "✓" : ""} {s.label}
                </div>
                {i < arr.length - 1 && (
                  <span style={{ color: "#cbd5e1", fontSize: 16 }}>›</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, padding: "24px 32px", maxWidth: 1200, width: "100%", margin: "0 auto" }}>

        {/* ── LISTA DE ORDENS ─────────────────────────────────────────── */}
        {etapa === "lista" && (
          <>
            <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                  Ordens Aguardando Recebimento
                </h2>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
                  {ordens.length} ordens pendentes
                </p>
              </div>
              <input
                placeholder="🔍  Buscar por OF, fornecedor..."
                style={{
                  border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px",
                  fontSize: 13, color: "#334155", background: "#fff", width: 260,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ordens.map((of) => (
                <div
                  key={of.id}
                  onClick={() => abrirOrdem(of)}
                  style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    padding: "18px 24px",
                    cursor: "pointer",
                    display: "grid",
                    gridTemplateColumns: "1fr 160px 120px 140px 120px",
                    alignItems: "center",
                    gap: 16,
                    transition: "all 0.15s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#93c5fd";
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(59,130,246,0.12)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{of.id}</div>
                    <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>{of.fornecedor}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{of.cnpj}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>Emissão</div>
                    {of.dataEmissao}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>Itens</div>
                    {of.itens} produtos
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>Valor Total</div>
                    <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>{fmt(of.valorTotal)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    {of.nfPortal ? (
                      <StatusDot color="#22c55e" label="NF disponível" />
                    ) : (
                      <StatusDot color="#f59e0b" label="Aguard. NF" />
                    )}
                    <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>Abrir →</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── SEM NF ──────────────────────────────────────────────────── */}
        {etapa === "sem_nf" && ordemSelecionada && (
          <div style={{
            background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
            padding: 48, textAlign: "center", maxWidth: 560, margin: "0 auto",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: 18 }}>Aguardando Nota Fiscal</h3>
            <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
              O fornecedor <strong>{ordemSelecionada.fornecedor}</strong> ainda não enviou a nota fiscal
              pelo portal. Você receberá uma notificação assim que o documento estiver disponível.
            </p>
            <div style={{
              marginTop: 24, padding: "12px 20px", background: "#f8fafc",
              borderRadius: 10, border: "1px solid #e2e8f0",
              fontSize: 13, color: "#475569", textAlign: "left",
            }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>OF {ordemSelecionada.id}</div>
              <div>Fornecedor: {ordemSelecionada.fornecedor}</div>
              <div>Valor: {fmt(ordemSelecionada.valorTotal)}</div>
            </div>
          </div>
        )}

        {/* ── ETAPA NF ────────────────────────────────────────────────── */}
        {etapa === "nf" && ordemSelecionada?.nfPortal && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Dados da NF */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "#dbeafe", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 18,
                }}>📄</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Nota Fiscal do Fornecedor</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Enviada pelo portal de fornecedores</div>
                </div>
              </div>

              {[
                ["Número / Série", `${ordemSelecionada.nfPortal.numero} / ${ordemSelecionada.nfPortal.serie}`],
                ["Data de Emissão", ordemSelecionada.nfPortal.dataEmissao],
                ["Valor Total", fmt(ordemSelecionada.nfPortal.valorTotal)],
                ["Fornecedor", ordemSelecionada.fornecedor],
                ["CNPJ", ordemSelecionada.cnpj],
              ].map(([label, value]) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "10px 0", borderBottom: "1px solid #f1f5f9",
                }}>
                  <span style={{ color: "#94a3b8", fontSize: 13 }}>{label}</span>
                  <span style={{ color: "#0f172a", fontSize: 13, fontWeight: 600 }}>{value}</span>
                </div>
              ))}

              <div style={{ marginTop: 20, padding: 14, background: "#f8fafc", borderRadius: 10, border: "1px dashed #cbd5e1" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Chave de Acesso NF-e</div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "#475569", wordBreak: "break-all", lineHeight: 1.6 }}>
                  {ordemSelecionada.nfPortal.chaveAcesso}
                </div>
              </div>
            </div>

            {/* XML */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "#dcfce7", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 18,
                }}>🗂</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>XML da Nota Fiscal</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Disponível para importação</div>
                </div>
              </div>

              <div style={{
                background: "#0f172a", borderRadius: 10, padding: 20,
                fontFamily: "monospace", fontSize: 11, color: "#94a3b8",
                lineHeight: 1.8, marginBottom: 20, maxHeight: 220, overflow: "hidden",
                position: "relative",
              }}>
                <span style={{ color: "#7dd3fc" }}>&lt;nfeProc&gt;</span>{"\n"}
                {"  "}<span style={{ color: "#7dd3fc" }}>&lt;NFe&gt;</span>{"\n"}
                {"    "}<span style={{ color: "#7dd3fc" }}>&lt;infNFe&gt;</span>{"\n"}
                {"      "}<span style={{ color: "#86efac" }}>&lt;det nItem=<span style={{ color: "#fcd34d" }}>"1"</span>&gt;</span>{"\n"}
                {"        "}<span style={{ color: "#c4b5fd" }}>&lt;prod&gt;</span>{"\n"}
                {"          "}<span style={{ color: "#f9a8d4" }}>&lt;xProd&gt;</span>PAPEL A4 BRANCO 75G/M2<span style={{ color: "#f9a8d4" }}>&lt;/xProd&gt;</span>{"\n"}
                {"          "}<span style={{ color: "#f9a8d4" }}>&lt;qCom&gt;</span>100<span style={{ color: "#f9a8d4" }}>&lt;/qCom&gt;</span>{"\n"}
                {"          "}<span style={{ color: "#f9a8d4" }}>&lt;vUnCom&gt;</span>24.50<span style={{ color: "#f9a8d4" }}>&lt;/vUnCom&gt;</span>{"\n"}
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0, height: 60,
                  background: "linear-gradient(transparent, #0f172a)",
                }} />
              </div>

              <button
                onClick={importarXML}
                style={{
                  width: "100%", padding: "14px 0",
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  border: "none", borderRadius: 10,
                  color: "#fff", fontWeight: 700, fontSize: 14,
                  cursor: "pointer", letterSpacing: "0.01em",
                  boxShadow: "0 4px 12px rgba(59,130,246,0.35)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
              >
                ⬇ Importar XML e Vincular Produtos
              </button>

              {notificacaoEnviada && (
                <div style={{
                  marginTop: 14, padding: "10px 14px",
                  background: "#f0fdf4", border: "1px solid #bbf7d0",
                  borderRadius: 8, fontSize: 12, color: "#166534",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  🔔 Notificações enviadas para Almoxarifado{usuarioAtual.podePatrimonio ? " e Patrimônio" : " e Patrimônio"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ETAPA MAPEAMENTO ────────────────────────────────────────── */}
        {etapa === "mapeamento" && (
          <>
            <div style={{
              background: "linear-gradient(135deg, #eff6ff, #f5f3ff)",
              border: "1px solid #bfdbfe",
              borderRadius: 12, padding: "14px 20px",
              marginBottom: 20, display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ fontSize: 24 }}>🤖</div>
              <div>
                <div style={{ fontWeight: 700, color: "#1e40af", fontSize: 14 }}>
                  IA identificou {produtos.filter(p => p.match).length} de {produtos.length} produtos automaticamente
                </div>
                <div style={{ color: "#3730a3", fontSize: 12, marginTop: 2 }}>
                  Revise as sugestões abaixo e confirme ou corrija os vínculos antes de prosseguir.
                </div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <div style={{
                  background: "#fff", borderRadius: 8, padding: "6px 14px",
                  fontSize: 13, color: "#1d4ed8", fontWeight: 700,
                  border: "1px solid #bfdbfe",
                }}>
                  {produtos.filter(p => p.matchConfirmado).length}/{produtos.length} confirmados
                </div>
              </div>
            </div>

            {/* Cabeçalho da tabela */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 28px 1fr 120px 100px",
              gap: 12, padding: "8px 20px",
              fontSize: 11, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              <div>Produto da Nota Fiscal</div>
              <div />
              <div>Produto no Sistema</div>
              <div>Confiança IA</div>
              <div>Ação</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {produtos.map((prod) => {
                const tc = tipoColor(prod.tipo);
                return (
                  <div
                    key={prod.id}
                    style={{
                      background: prod.matchConfirmado ? "#f0fdf4" : "#fff",
                      border: `1px solid ${prod.matchConfirmado ? "#bbf7d0" : "#e2e8f0"}`,
                      borderRadius: 10, padding: "14px 20px",
                      display: "grid",
                      gridTemplateColumns: "1fr 28px 1fr 120px 100px",
                      gap: 12, alignItems: "center",
                      transition: "all 0.2s",
                    }}
                  >
                    {/* Produto NF */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
                        {prod.nomeFornecedor}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          {prod.qtdNF} {prod.unNF} · {fmt(prod.valorUnit)}/un
                        </span>
                        <Badge bg={tc.bg} color={tc.text}>{tc.label}</Badge>
                      </div>
                    </div>

                    {/* Seta */}
                    <div style={{ color: "#cbd5e1", fontSize: 18, textAlign: "center" }}>→</div>

                    {/* Produto sistema */}
                    <div>
                      {prod.match ? (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                            {prod.match.nome}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                            Código: {prod.match.id}
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          padding: "8px 12px", border: "1px dashed #fca5a5",
                          borderRadius: 8, background: "#fef2f2",
                          fontSize: 12, color: "#dc2626",
                        }}>
                          ⚠ Produto não identificado — selecionar manualmente
                        </div>
                      )}
                    </div>

                    {/* Confiança */}
                    <div>
                      {prod.match ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{
                            height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden",
                          }}>
                            <div style={{
                              height: "100%", width: `${prod.match.confianca}%`,
                              background: confiancaColor(prod.match.confianca),
                              borderRadius: 3, transition: "width 0.5s",
                            }} />
                          </div>
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            color: confiancaColor(prod.match.confianca),
                          }}>
                            {prod.match.confianca}% IA
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "#fca5a5" }}>—</span>
                      )}
                    </div>

                    {/* Ação */}
                    <div>
                      {prod.matchConfirmado ? (
                        <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>✓ Confirmado</span>
                      ) : (
                        <button
                          onClick={() => confirmarMatch(prod.id, prod.match)}
                          disabled={!prod.match}
                          style={{
                            padding: "6px 14px",
                            background: prod.match ? "#0f172a" : "#f1f5f9",
                            color: prod.match ? "#fff" : "#94a3b8",
                            border: "none", borderRadius: 6,
                            fontSize: 12, fontWeight: 600,
                            cursor: prod.match ? "pointer" : "not-allowed",
                          }}
                        >
                          {prod.match ? "Confirmar" : "Vincular"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>
                {produtos.filter(p => !p.matchConfirmado).length > 0
                  ? `${produtos.filter(p => !p.matchConfirmado).length} item(ns) aguardando confirmação`
                  : "Todos os vínculos confirmados ✓"}
              </span>
              <button
                onClick={confirmarTodos}
                disabled={!todosConfirmados}
                style={{
                  padding: "12px 28px",
                  background: todosConfirmados
                    ? "linear-gradient(135deg, #22c55e, #16a34a)"
                    : "#e2e8f0",
                  color: todosConfirmados ? "#fff" : "#94a3b8",
                  border: "none", borderRadius: 10,
                  fontWeight: 700, fontSize: 14,
                  cursor: todosConfirmados ? "pointer" : "not-allowed",
                  boxShadow: todosConfirmados ? "0 4px 12px rgba(34,197,94,0.3)" : "none",
                  transition: "all 0.2s",
                }}
              >
                Prosseguir para Recebimento →
              </button>
            </div>
          </>
        )}

        {/* ── ETAPA RECEBIMENTO ───────────────────────────────────────── */}
        {etapa === "recebimento" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

              {/* Bloco Almoxarifado */}
              <div style={{
                background: "#fff", borderRadius: 16,
                border: aceiteAlmox ? "2px solid #22c55e" : "1px solid #e2e8f0",
                padding: 24, transition: "border 0.3s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                    }}>🏪</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Almoxarifado</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>Itens de Consumo</div>
                    </div>
                  </div>
                  {aceiteAlmox
                    ? <StatusDot color="#22c55e" label="Aceito" />
                    : <StatusDot color="#f59e0b" label="Pendente" />}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {itensConsumo.map((item) => (
                    <div key={item.id} style={{
                      display: "flex", justifyContent: "space-between",
                      padding: "10px 14px", background: "#f8fafc",
                      borderRadius: 8, fontSize: 13,
                    }}>
                      <span style={{ color: "#334155", flex: 1 }}>{item.match?.nome || item.nomeFornecedor}</span>
                      <span style={{ color: "#0f172a", fontWeight: 600, marginLeft: 12 }}>
                        {item.qtdNF} {item.unNF}
                      </span>
                    </div>
                  ))}
                </div>

                {!aceiteAlmox ? (
                  <button
                    onClick={() => setAceiteAlmox(true)}
                    style={{
                      width: "100%", padding: "13px 0",
                      background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                      border: "none", borderRadius: 10,
                      color: "#fff", fontWeight: 700, fontSize: 14,
                      cursor: "pointer", boxShadow: "0 4px 12px rgba(59,130,246,0.3)",
                    }}
                  >
                    ✓ Aceitar Almoxarifado
                  </button>
                ) : (
                  <div style={{
                    textAlign: "center", padding: "12px",
                    background: "#f0fdf4", borderRadius: 10,
                    color: "#166534", fontWeight: 700, fontSize: 14,
                  }}>
                    ✅ Recebido por {usuarioAtual.nome} hoje
                  </div>
                )}
              </div>

              {/* Bloco Patrimônio */}
              <div style={{
                background: "#fff", borderRadius: 16,
                border: aceitePatrim ? "2px solid #22c55e" : "1px solid #e2e8f0",
                padding: 24, transition: "border 0.3s",
                opacity: usuarioAtual.podePatrimonio ? 1 : 0.65,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                    }}>🏛</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Patrimônio</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>Itens Permanentes</div>
                    </div>
                  </div>
                  {aceitePatrim
                    ? <StatusDot color="#22c55e" label="Aceito" />
                    : <StatusDot color="#f59e0b" label="Pendente" />}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {itensPermanente.map((item) => (
                    <div key={item.id} style={{
                      display: "flex", justifyContent: "space-between",
                      padding: "10px 14px", background: "#f8fafc",
                      borderRadius: 8, fontSize: 13,
                    }}>
                      <span style={{ color: "#334155", flex: 1 }}>{item.match?.nome || item.nomeFornecedor}</span>
                      <span style={{ color: "#0f172a", fontWeight: 600, marginLeft: 12 }}>
                        {item.qtdNF} {item.unNF}
                      </span>
                    </div>
                  ))}
                </div>

                {!usuarioAtual.podePatrimonio ? (
                  <div style={{
                    padding: "12px 14px", background: "#fefce8",
                    border: "1px solid #fde68a", borderRadius: 10,
                    fontSize: 13, color: "#92400e", textAlign: "center",
                  }}>
                    🔒 Aguardando agente de Patrimônio
                  </div>
                ) : !aceitePatrim ? (
                  <button
                    onClick={() => setAceitePatrim(true)}
                    style={{
                      width: "100%", padding: "13px 0",
                      background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                      border: "none", borderRadius: 10,
                      color: "#fff", fontWeight: 700, fontSize: 14,
                      cursor: "pointer", boxShadow: "0 4px 12px rgba(139,92,246,0.3)",
                    }}
                  >
                    ✓ Aceitar Patrimônio
                  </button>
                ) : (
                  <div style={{
                    textAlign: "center", padding: "12px",
                    background: "#f0fdf4", borderRadius: 10,
                    color: "#166534", fontWeight: 700, fontSize: 14,
                  }}>
                    ✅ Recebido por {usuarioAtual.nome} hoje
                  </div>
                )}
              </div>
            </div>

            {/* Status geral */}
            <div style={{
              background: aceiteAlmox && (aceitePatrim || !usuarioAtual.podePatrimonio)
                ? "linear-gradient(135deg, #f0fdf4, #dcfce7)"
                : "#fff",
              border: `1px solid ${aceiteAlmox && (aceitePatrim || !usuarioAtual.podePatrimonio) ? "#bbf7d0" : "#e2e8f0"}`,
              borderRadius: 12, padding: "16px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                  {aceiteAlmox && aceitePatrim
                    ? "🟢 Recebimento totalmente concluído — NF liberada para o Financeiro"
                    : aceiteAlmox
                    ? "⏳ Aguardando aceite do Patrimônio"
                    : aceitePatrim
                    ? "⏳ Aguardando aceite do Almoxarifado"
                    : "⏳ Aguardando os dois aceites"}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  OF {ordemSelecionada?.id} · {ordemSelecionada?.fornecedor} · NF {ordemSelecionada?.nfPortal?.numero}
                </div>
              </div>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                border: "3px solid",
                borderColor: (aceiteAlmox ? 1 : 0) + (aceitePatrim ? 1 : 0) === 2 ? "#22c55e" : "#e2e8f0",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 15,
                color: (aceiteAlmox ? 1 : 0) + (aceitePatrim ? 1 : 0) === 2 ? "#22c55e" : "#94a3b8",
              }}>
                {(aceiteAlmox ? 1 : 0) + (aceitePatrim ? 1 : 0)}/2
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
