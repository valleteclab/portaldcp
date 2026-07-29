"use client";

import { useMemo, useState } from "react";
import { Copy, Plus, Trash2, Users } from "lucide-react";
import { API_URL, authFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ItemEquipeLote {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  lote_numero?: number | null;
}

export interface FuncionarioEquipeForm {
  id?: string;
  item_cronograma_id: string;
  posto_numero?: number | null;
  nome: string;
  cargo_funcao: string;
  inicio_prestacao_servicos: string;
  lotacao: string;
  situacao: string;
  carga_horaria_semanal: number;
  dias_trabalhados: number;
  salario_base: number;
  salario_proporcional: number;
  acumulo_funcao: number;
  salario_total: number;
  encargos: number;
  indenizacao: number;
  ausencias_legais: number;
  aso_farda: number;
  vale_transporte: number;
  vale_alimentacao: number;
  taxa_administracao_lucro: number;
  tributos: number;
  valor_total: number;
  observacoes?: string;
}

export interface EquipeMedicaoForm {
  fechamento_fatura: string;
  responsavel_legal: string;
  data_emissao: string;
  percentual_iss: number;
  percentual_ir: number;
  retencao_inss: number;
  funcionarios: FuncionarioEquipeForm[];
}

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

const composicaoPadrao = (valorUnitario: number) => {
  const padroes = [
    {
      total: 12681.29,
      salario_base: 3904.33,
      acumulo_funcao: 0,
      encargos: 1858.8,
      indenizacao: 122.85,
      ausencias_legais: 622.69,
      aso_farda: 251.83,
      vale_transporte: 0,
      vale_alimentacao: 563.43,
      taxa_administracao_lucro: 4577.46,
      tributos: 779.9,
    },
    {
      total: 7725.96,
      salario_base: 1621,
      acumulo_funcao: 648.4,
      encargos: 1045.05,
      indenizacao: 71.4,
      ausencias_legais: 368.1,
      aso_farda: 144.66,
      vale_transporte: 0,
      vale_alimentacao: 563.43,
      taxa_administracao_lucro: 2788.77,
      tributos: 475.15,
    },
    {
      total: 13565.2,
      salario_base: 4189.69,
      acumulo_funcao: 0,
      encargos: 2000.84,
      indenizacao: 131.83,
      ausencias_legais: 667.12,
      aso_farda: 281.51,
      vale_transporte: 0,
      vale_alimentacao: 563.43,
      taxa_administracao_lucro: 4896.52,
      tributos: 834.26,
    },
  ];
  return (
    padroes.find((padrao) => Math.abs(padrao.total - Number(valorUnitario)) < 0.02) || {
      total: Number(valorUnitario),
      salario_base: 0,
      acumulo_funcao: 0,
      encargos: 0,
      indenizacao: 0,
      ausencias_legais: 0,
      aso_farda: 0,
      vale_transporte: 0,
      vale_alimentacao: 0,
      taxa_administracao_lucro: Number(valorUnitario),
      tributos: 0,
    }
  );
};

const aplicarDias = (
  linha: FuncionarioEquipeForm,
  item: ItemEquipeLote,
  dias: number,
): FuncionarioEquipeForm => {
  const base = composicaoPadrao(item.valor_unitario);
  const fator = Math.max(0, Math.min(30, dias)) / 30;
  const salarioProporcional = arredondar(base.salario_base * fator);
  const acumulo = arredondar(base.acumulo_funcao * fator);
  const componentes = {
    encargos: arredondar(base.encargos * fator),
    indenizacao: arredondar(base.indenizacao * fator),
    ausencias_legais: arredondar(base.ausencias_legais * fator),
    aso_farda: arredondar(base.aso_farda * fator),
    vale_transporte: arredondar(base.vale_transporte * fator),
    vale_alimentacao: arredondar(base.vale_alimentacao * fator),
    taxa_administracao_lucro: arredondar(base.taxa_administracao_lucro * fator),
    tributos: arredondar(base.tributos * fator),
  };
  const salarioTotal = arredondar(
    (base.salario_base + base.acumulo_funcao) * fator,
  );
  return {
    ...linha,
    cargo_funcao: item.descricao,
    dias_trabalhados: dias,
    salario_base: base.salario_base,
    salario_proporcional: salarioProporcional,
    acumulo_funcao: acumulo,
    salario_total: salarioTotal,
    ...componentes,
    valor_total: arredondar(Number(item.valor_unitario) * fator),
  };
};

export const equipeVazia = (): EquipeMedicaoForm => ({
  fechamento_fatura: "CÂMARA MUNICIPAL DE LUÍS EDUARDO MAGALHÃES-BA",
  responsavel_legal: "",
  data_emissao: new Date().toISOString().slice(0, 10),
  percentual_iss: 2.5,
  percentual_ir: 4.8,
  retencao_inss: 0,
  funcionarios: [],
});

export function calcularItensEquipe(funcionarios: FuncionarioEquipeForm[]) {
  const agrupado = new Map<string, { quantidade_medida: number; valor_override: number }>();
  for (const funcionario of funcionarios) {
    const atual = agrupado.get(funcionario.item_cronograma_id) || {
      quantidade_medida: 0,
      valor_override: 0,
    };
    atual.quantidade_medida += Number(funcionario.dias_trabalhados || 0) / 30;
    atual.valor_override = arredondar(atual.valor_override + Number(funcionario.valor_total || 0));
    agrupado.set(funcionario.item_cronograma_id, atual);
  }
  return Array.from(agrupado.entries()).map(([item_cronograma_id, valores]) => ({
    item_cronograma_id,
    quantidade_medida: Math.round(valores.quantidade_medida * 1_000_000) / 1_000_000,
    modo_input: "valor" as const,
    valor_override: valores.valor_override,
  }));
}

export default function EquipeLoteMedicao({
  contratoId,
  fornecedorId,
  itens,
  value,
  onChange,
  medicaoId,
  loteNumero,
}: {
  contratoId: string;
  fornecedorId: string;
  itens: ItemEquipeLote[];
  value: EquipeMedicaoForm;
  onChange: (value: EquipeMedicaoForm) => void;
  medicaoId?: string;
  loteNumero?: number | null;
}) {
  const [copiando, setCopiando] = useState(false);
  const total = useMemo(
    () => arredondar(value.funcionarios.reduce((soma, linha) => soma + Number(linha.valor_total || 0), 0)),
    [value.funcionarios],
  );

  const alterarLinha = (indice: number, patch: Partial<FuncionarioEquipeForm>) => {
    const funcionarios = [...value.funcionarios];
    funcionarios[indice] = { ...funcionarios[indice], ...patch };
    onChange({ ...value, funcionarios });
  };

  const encontrarPostoDisponivel = (
    item: ItemEquipeLote,
    dias: number,
    ignorarIndice?: number,
  ) => {
    const ocupacao = new Map<number, number>();
    value.funcionarios.forEach((funcionario, indice) => {
      if (
        indice === ignorarIndice ||
        funcionario.item_cronograma_id !== item.id ||
        !funcionario.posto_numero
      ) {
        return;
      }
      ocupacao.set(
        funcionario.posto_numero,
        Number(ocupacao.get(funcionario.posto_numero) || 0) +
          Number(funcionario.dias_trabalhados || 0),
      );
    });
    const limite = Math.max(1, Math.ceil(Number(item.quantidade)));
    for (let posto = 1; posto <= limite; posto++) {
      if (Number(ocupacao.get(posto) || 0) + dias <= 30.0001) {
        return posto;
      }
    }
    return null;
  };

  const adicionar = () => {
    const item = itens[0];
    if (!item) return;
    const linha = aplicarDias(
      {
        item_cronograma_id: item.id,
        posto_numero: encontrarPostoDisponivel(item, 30),
        nome: "",
        cargo_funcao: item.descricao,
        inicio_prestacao_servicos: "",
        lotacao: "RÁDIO E TV CÂMARA",
        situacao: "ATIVO",
        carga_horaria_semanal: 30,
        dias_trabalhados: 30,
        salario_base: 0,
        salario_proporcional: 0,
        acumulo_funcao: 0,
        salario_total: 0,
        encargos: 0,
        indenizacao: 0,
        ausencias_legais: 0,
        aso_farda: 0,
        vale_transporte: 0,
        vale_alimentacao: 0,
        taxa_administracao_lucro: 0,
        tributos: 0,
        valor_total: 0,
      },
      item,
      30,
    );
    onChange({ ...value, funcionarios: [...value.funcionarios, linha] });
  };

  const copiarAnterior = async () => {
    setCopiando(true);
    try {
      const query = new URLSearchParams({ fornecedorId });
      if (medicaoId) query.set("excluirMedicaoId", medicaoId);
      const resposta = await authFetch(
        `${API_URL}/api/fornecedor/contratos/${contratoId}/equipe/ultima?${query}`,
      );
      if (!resposta.ok) throw new Error("Não foi possível buscar a equipe anterior");
      const anterior = await resposta.json();
      if (!anterior?.funcionarios?.length) {
        alert("Nenhuma relação de funcionários anterior foi encontrada.");
        return;
      }
      onChange({
        ...value,
        responsavel_legal: anterior.responsavel_legal || value.responsavel_legal,
        percentual_iss: Number(anterior.percentual_iss ?? value.percentual_iss),
        percentual_ir: Number(anterior.percentual_ir ?? value.percentual_ir),
        retencao_inss: Number(anterior.retencao_inss ?? 0),
        funcionarios: anterior.funcionarios.map((linha: FuncionarioEquipeForm) => {
          const item = itens.find((i) => i.id === linha.item_cronograma_id);
          return item ? aplicarDias({ ...linha, id: undefined }, item, 30) : { ...linha, id: undefined };
        }),
      });
    } catch (erro) {
      alert(erro instanceof Error ? erro.message : "Erro ao copiar equipe anterior");
    } finally {
      setCopiando(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-amber-300 bg-amber-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-amber-950">
            <Users className="h-5 w-5" /> Relação de funcionários
            {loteNumero !== null && loteNumero !== undefined
              ? ` - Lote ${loteNumero}`
              : ""}
          </h3>
          <p className="text-xs text-amber-800">
            Cada funcionário é vinculado ao cargo contratual. Dias parciais são calculados sobre 30 dias.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copiarAnterior} disabled={copiando}>
            <Copy className="mr-1 h-4 w-4" />
            {copiando ? "Copiando..." : "Copiar mês anterior"}
          </Button>
          <Button type="button" size="sm" onClick={adicionar}>
            <Plus className="mr-1 h-4 w-4" /> Funcionário
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div><Label>Fechamento da fatura</Label><Input value={value.fechamento_fatura} onChange={(e) => onChange({ ...value, fechamento_fatura: e.target.value })} /></div>
        <div><Label>Responsável legal</Label><Input value={value.responsavel_legal} onChange={(e) => onChange({ ...value, responsavel_legal: e.target.value })} /></div>
        <div><Label>Data de emissão</Label><Input type="date" value={value.data_emissao} onChange={(e) => onChange({ ...value, data_emissao: e.target.value })} /></div>
      </div>

      <div className="space-y-3">
        {value.funcionarios.map((linha, indice) => {
          const item = itens.find((i) => i.id === linha.item_cronograma_id) || itens[0];
          return (
            <div key={`${linha.id || "novo"}-${indice}`} className="rounded-md border bg-white p-3 shadow-sm">
              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-3"><Label>Nome</Label><Input value={linha.nome} onChange={(e) => alterarLinha(indice, { nome: e.target.value })} /></div>
                <div className="md:col-span-3">
                  <Label>Cargo/item do contrato</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                    value={linha.item_cronograma_id}
                    onChange={(e) => {
                      const novoItem = itens.find((i) => i.id === e.target.value)!;
                      const atualizada = aplicarDias({
                        ...linha,
                        item_cronograma_id: novoItem.id,
                        posto_numero: encontrarPostoDisponivel(
                          novoItem,
                          linha.dias_trabalhados,
                          indice,
                        ),
                      }, novoItem, linha.dias_trabalhados);
                      const funcionarios = [...value.funcionarios]; funcionarios[indice] = atualizada;
                      onChange({ ...value, funcionarios });
                    }}
                  >
                    {itens.map((opcao) => <option key={opcao.id} value={opcao.id}>{opcao.numero_item}. {opcao.descricao}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2"><Label>Início</Label><Input type="date" value={linha.inicio_prestacao_servicos || ""} onChange={(e) => alterarLinha(indice, { inicio_prestacao_servicos: e.target.value })} /></div>
                <div className="md:col-span-1"><Label>Posto</Label><Input type="number" min="1" max={Math.max(1, Math.ceil(Number(item.quantidade)))} placeholder="Auto" value={linha.posto_numero || ""} onChange={(e) => alterarLinha(indice, { posto_numero: Number(e.target.value) || null })} /></div>
                <div className="md:col-span-1"><Label>Dias</Label><Input type="number" min="0.01" max="30" step="0.01" value={linha.dias_trabalhados} onChange={(e) => {
                  const dias = Number(e.target.value) || 0;
                  const funcionarios = [...value.funcionarios]; funcionarios[indice] = aplicarDias({
                    ...linha,
                    posto_numero:
                      encontrarPostoDisponivel(item, dias, indice) ||
                      linha.posto_numero,
                  }, item, dias);
                  onChange({ ...value, funcionarios });
                }} /></div>
                <div className="md:col-span-1"><Label>C.H.</Label><Input type="number" value={linha.carga_horaria_semanal} onChange={(e) => alterarLinha(indice, { carga_horaria_semanal: Number(e.target.value) || 0 })} /></div>
                <div className="flex items-end justify-end md:col-span-1"><Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => onChange({ ...value, funcionarios: value.funcionarios.filter((_, i) => i !== indice) })}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{linha.lotacao} · {linha.situacao}</span>
                <strong className="text-emerald-700">Total: {linha.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
              </div>
              <details className="mt-2 rounded border bg-slate-50 p-2">
                <summary className="cursor-pointer text-xs font-medium text-slate-700">Composição financeira</summary>
                <div className="mt-2 grid gap-2 md:grid-cols-5">
                  {([
                    ["salario_base", "Salário base"], ["salario_proporcional", "Salário proporcional"],
                    ["acumulo_funcao", "Acúmulo 40%"], ["salario_total", "Salário total"],
                    ["encargos", "Encargos"], ["indenizacao", "Indenização"],
                    ["ausencias_legais", "Ausências legais"], ["aso_farda", "ASO + farda"],
                    ["vale_transporte", "VT"], ["vale_alimentacao", "VA"],
                    ["taxa_administracao_lucro", "Taxa adm. + lucro"], ["tributos", "Tributos"],
                  ] as const).map(([campo, label]) => (
                    <div key={campo}><Label className="text-xs">{label}</Label><Input type="number" step="0.01" value={linha[campo]} onChange={(e) => alterarLinha(indice, { [campo]: Number(e.target.value) || 0 })} /></div>
                  ))}
                </div>
              </details>
            </div>
          );
        })}
        {value.funcionarios.length === 0 && <p className="rounded border border-dashed p-6 text-center text-sm text-slate-500">Adicione os funcionários ou copie a equipe do mês anterior.</p>}
      </div>

      <div className="grid gap-3 border-t pt-3 md:grid-cols-4">
        <div><Label>ISS (%)</Label><Input type="number" step="0.01" value={value.percentual_iss} onChange={(e) => onChange({ ...value, percentual_iss: Number(e.target.value) || 0 })} /></div>
        <div><Label>IR (%)</Label><Input type="number" step="0.01" value={value.percentual_ir} onChange={(e) => onChange({ ...value, percentual_ir: Number(e.target.value) || 0 })} /></div>
        <div><Label>Retenção INSS</Label><Input type="number" step="0.01" value={value.retencao_inss} onChange={(e) => onChange({ ...value, retencao_inss: Number(e.target.value) || 0 })} /></div>
        <div className="rounded bg-emerald-100 p-3 text-right"><span className="block text-xs text-emerald-800">Total da equipe</span><strong className="text-lg text-emerald-900">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>
      </div>
    </section>
  );
}
