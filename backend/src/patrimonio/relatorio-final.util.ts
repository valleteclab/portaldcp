import { DadosTermoSetor, LinhaDivergencia } from './termo-conferencia.util';

/**
 * Dados do RELATÓRIO FINAL DA COMISSÃO DE INVENTÁRIO.
 *
 * Decisão estrutural: o relatório é a SOMA dos termos de setor, não um
 * recálculo paralelo. Cada setor já foi reduzido a um `DadosTermoSetor` pelas
 * mesmas regras que o conferente viu na tela e assinou no papel; aqui só se
 * empilha. Qualquer outra abordagem abriria espaço para o relatório da comissão
 * contradizer o termo que o servidor assinou — e foi exatamente esse tipo de
 * divergência entre duas contas da mesma coisa que custou caro neste sistema.
 *
 * Classificação conforme a IN SEDAP nº 205/1988, item 8, que segue sendo a
 * referência usada inclusive no âmbito municipal.
 */

export interface SetorNoRelatorio {
  nome: string;
  responsavel?: string | null;
  fechado: boolean;
  fechado_por?: string | null;
  dados: DadosTermoSetor;
}

export interface LinhaSetor {
  setor: string;
  cadastrados: number;
  conferidos: number;
  em_outro_setor: number;
  nao_localizados: number;
  fechado: boolean;
}

export interface GrupoDivergencia {
  titulo: string;
  linhas: Array<LinhaDivergencia & { setor: string }>;
}

export interface DadosRelatorioFinal {
  totais: {
    setores: number;
    setores_fechados: number;
    cadastrados: number;
    conferidos: number;
    em_outro_setor: number;
    nao_localizados: number;
    sem_cadastro: number;
    baixados_presentes: number;
    valor_cadastrado: number;
    valor_conferido: number;
    valor_nao_localizado: number;
    descartadas: number;
    /** Localizados = conferidos + achados em outra sala. */
    indice_localizacao: number;
  };
  por_setor: LinhaSetor[];
  grupos: GrupoDivergencia[];
  /** Setores que ainda não fecharam: o relatório sai, mas avisa. */
  pendentes: string[];
}

const arred2 = (n: number) => Math.round(n * 100) / 100;

/** Ocorrência -> seção do relatório. A ordem é a que a comissão lê. */
const SECOES: Array<{ titulo: string; casa: (o: string) => boolean }> = [
  { titulo: 'Bens não localizados', casa: (o) => o.startsWith('Não localizado') },
  {
    titulo: 'Bens localizados em setor diverso do cadastro',
    casa: (o) => o.startsWith('Localizado em') || o.includes('encontrado aqui'),
  },
  { titulo: 'Bens encontrados sem cadastro', casa: (o) => o.startsWith('Encontrado sem cadastro') || o.startsWith('Lido e não identificado') },
  { titulo: 'Bens baixados e fisicamente presentes', casa: (o) => o.startsWith('Baixado no cadastro') },
];

export function montarRelatorioFinal(setores: SetorNoRelatorio[]): DadosRelatorioFinal {
  const lista = setores || [];
  const soma = (f: (s: SetorNoRelatorio) => number) => lista.reduce((acc, s) => acc + f(s), 0);

  const cadastrados = soma((s) => s.dados.quadro.cadastrados);
  const conferidos = soma((s) => s.dados.quadro.conferidos);
  const emOutroSetor = soma((s) => s.dados.quadro.em_outro_setor);
  const localizados = conferidos + emOutroSetor;

  const grupos: GrupoDivergencia[] = SECOES.map((sec) => ({ titulo: sec.titulo, linhas: [] }));
  const outros: GrupoDivergencia = { titulo: 'Outras ocorrências', linhas: [] };
  for (const s of lista) {
    for (const d of s.dados.divergencias) {
      const i = SECOES.findIndex((sec) => sec.casa(d.ocorrencia));
      (i >= 0 ? grupos[i] : outros).linhas.push({ ...d, setor: s.nome });
    }
  }
  if (outros.linhas.length) grupos.push(outros);

  return {
    totais: {
      setores: lista.length,
      setores_fechados: lista.filter((s) => s.fechado).length,
      cadastrados,
      conferidos,
      em_outro_setor: emOutroSetor,
      nao_localizados: soma((s) => s.dados.quadro.nao_localizados),
      sem_cadastro: soma((s) => s.dados.quadro.sem_cadastro),
      baixados_presentes: soma((s) => s.dados.quadro.baixados_presentes),
      valor_cadastrado: arred2(soma((s) => s.dados.quadro.valor_cadastrado)),
      valor_conferido: arred2(soma((s) => s.dados.quadro.valor_conferido)),
      valor_nao_localizado: arred2(soma((s) => s.dados.quadro.valor_nao_localizado)),
      descartadas: soma((s) => s.dados.descartadas),
      indice_localizacao: cadastrados ? arred2((localizados / cadastrados) * 100) : 0,
    },
    por_setor: lista.map((s) => ({
      setor: s.nome,
      cadastrados: s.dados.quadro.cadastrados,
      conferidos: s.dados.quadro.conferidos,
      em_outro_setor: s.dados.quadro.em_outro_setor,
      nao_localizados: s.dados.quadro.nao_localizados,
      fechado: s.fechado,
    })),
    grupos: grupos.filter((g) => g.linhas.length > 0),
    pendentes: lista.filter((s) => !s.fechado).map((s) => s.nome),
  };
}

/**
 * Recomendações derivadas do que foi apurado — a comissão edita depois, mas
 * nenhuma providência devida deixa de ser proposta por esquecimento.
 *
 * A primeira é deliberadamente "apurar antes de dar baixa": a IN SEDAP nº
 * 205/1988 exige comissão própria para isso, e um relatório que sugerisse baixa
 * direta de bem não localizado seria questionado pelo controle externo.
 */
export function recomendacoes(t: DadosRelatorioFinal['totais']): string[] {
  const r: string[] = [];
  // "os 1 bens" num documento que vai à Mesa Diretora não passa.
  const bens = (n: number, artigo: 'os' | 'dos' | 'aos') =>
    n === 1
      ? `${{ os: 'o', dos: 'do', aos: 'ao' }[artigo]} bem`
      : `${artigo} ${n} bens`;

  if (t.nao_localizados > 0) {
    r.push(
      `Instaurar procedimento de apuração quanto ${bens(t.nao_localizados, 'aos')} não ` +
        `${t.nao_localizados === 1 ? 'localizado' : 'localizados'}, com baixa apenas após sua conclusão.`,
    );
  }
  if (t.em_outro_setor > 0) {
    r.push(
      `Promover a transferência de carga ${bens(t.em_outro_setor, 'dos')} ` +
        `${t.em_outro_setor === 1 ? 'localizado' : 'localizados'} em setor diverso, ` +
        'regularizando os termos de responsabilidade.',
    );
  }
  if (t.sem_cadastro > 0) {
    r.push(
      `Avaliar e incorporar ${bens(t.sem_cadastro, 'os')} ` +
        `${t.sem_cadastro === 1 ? 'encontrado' : 'encontrados'} sem cadastro, com emissão de plaqueta.`,
    );
  }
  if (t.baixados_presentes > 0) {
    r.push(
      `Estornar a baixa ${bens(t.baixados_presentes, 'dos')} ` +
        `${t.baixados_presentes === 1 ? 'baixado e presente' : 'baixados e presentes'}, ` +
        'ou providenciar seu desfazimento efetivo.',
    );
  }
  r.push(
    'Condicionar toda movimentação física de bem à prévia transferência no sistema, ' +
      'origem da maior parte das divergências apuradas.',
  );
  return r;
}
