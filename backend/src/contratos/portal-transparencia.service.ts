import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ContratosService } from './contratos.service';
import { IaService } from '../ia/ia.service';
import { MedicaoService } from './medicao.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { DocumentoContrato, TipoDocumentoContrato } from './entities/documento-contrato.entity';
import { CategoriaContrato, Contrato, ModalidadeExecucao } from './entities/contrato.entity';
import { ItemContrato, TipoItemContrato, UnidadeMedidaContrato } from '../almoxarifado/entities/item-contrato.entity';

function corrigirJsonMalformado(jsonString: string): string {
  const inicio = jsonString.indexOf('{');
  const fim = jsonString.lastIndexOf('}');
  if (inicio === -1 || fim === -1) return jsonString;

  let json = jsonString.substring(inicio, fim + 1);
  json = json.replace(/"\w+":\s*null\s*,?/g, '');
  json = json.replace(/\}\s*"([^"]+)":\s*([^,\{\}]+)\s*,?\s*\{/g, '}, {');
  json = json.replace(/\}\s*"([^"]+)":\s*([^,\{\}]+)\s*\{/g, '}, {');
  json = json.replace(/("\w+":\s*[^,\{\}]+)\s*,\s*"\w+":\s*[^,\{\}]+\s*,?/g, '$1,');
  json = json.replace(/("\w+":\s*[^,\{\}]+)(\s*,\s*\1)+/g, '$1');
  json = json.replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']');
  json = json.replace(/,\s*,/g, ',');
  json = json.replace(/\{\s*\}/g, '');
  json = json.replace(/,\s*\]/g, ']');

  return json;
}

function tentarExtrairJson(str: string): any | null {
  try {
    return JSON.parse(str);
  } catch { /* continuar */ }

  const corrigido = corrigirJsonMalformado(str);
  try {
    return JSON.parse(corrigido);
  } catch { /* continuar */ }

  try {
    const resultado: any = { itens: [] };
    const descRegex = /"descricao":\s*"([^"]*)"/gi;
    const itensEncontrados = new Map<string, any>();

    let match;
    while ((match = descRegex.exec(str)) !== null) {
      const descricao = match[1].trim();
      const posicao = match.index;
      const contexto = str.substring(posicao, posicao + 800);

      const item: any = {
        descricao: descricao || 'Item sem descrição',
        unidade_medida: 'UNIDADE',
        quantidade: 1,
        valor_unitario: 0,
        quantidade_meses: null,
        valor_total: 0,
      };

      const qtdMatch = contexto.match(/"quantidade":\s*([\d.]+|null)/);
      if (qtdMatch && qtdMatch[1] !== 'null') item.quantidade = parseFloat(qtdMatch[1]);

      const unitMatch = contexto.match(/"valor_unitario":\s*([\d.]+|null)/);
      if (unitMatch && unitMatch[1] !== 'null') item.valor_unitario = parseFloat(unitMatch[1]);

      const totalMatch = contexto.match(/"valor_total":\s*([\d.]+)/);
      if (totalMatch) {
        item.valor_total = parseFloat(totalMatch[1]);
      } else if (item.quantidade && item.valor_unitario) {
        item.valor_total = item.quantidade * item.valor_unitario;
      }

      const unidMatch = contexto.match(/"unidade_medida":\s*"([^"]+)"/);
      if (unidMatch) item.unidade_medida = unidMatch[1];

      const mesesMatch = contexto.match(/"quantidade_meses":\s*(\d+|null)/);
      if (mesesMatch && mesesMatch[1] !== 'null') item.quantidade_meses = parseInt(mesesMatch[1]);

      if (item.valor_total > 0 || (item.quantidade > 0 && item.valor_unitario > 0)) {
        const chave = `${item.descricao}|${item.quantidade}|${item.valor_total}`;
        if (!itensEncontrados.has(chave)) itensEncontrados.set(chave, item);
      }
    }

    resultado.itens = Array.from(itensEncontrados.values());
    if (resultado.itens.length > 0) return resultado;
  } catch { /* continuar */ }

  return null;
}

function normalizarItensExtraidos(itens: any[]): Array<{
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_meses?: number | null;
  valor_total?: number;
}> {
  return itens
    .map((item) => {
      const descricao = String(item?.descricao || '').trim();
      let unidade_medida = String(item?.unidade_medida || 'UNIDADE').trim() || 'UNIDADE';

      // Normalizar unidades longas que a IA retorna (ex: "PACOTE COM 8 UNIDADES" → "PCT")
      // O campo no banco é varchar(20)
      const mapaUnidades: Record<string, string> = {
        'PACOTE': 'PCT', 'PACOTES': 'PCT', 'CAIXA': 'CX', 'CAIXAS': 'CX',
        'UNIDADE': 'UN', 'UNIDADES': 'UN', 'LITRO': 'LT', 'LITROS': 'LT',
        'GALÃO': 'GL', 'GALÕES': 'GL', 'GARRAFA': 'GF', 'GARRAFAS': 'GF',
        'FRASCO': 'FR', 'FRASCOS': 'FR', 'ROLO': 'RL', 'ROLOS': 'RL',
        'RESMA': 'RM', 'RESMAS': 'RM', 'BALDE': 'BD', 'BALDES': 'BD',
      };
      const unidadeUpper = unidade_medida.toUpperCase();
      const primeiraP = unidadeUpper.split(/\s+/)[0];
      if (mapaUnidades[primeiraP]) {
        unidade_medida = mapaUnidades[primeiraP];
      } else if (mapaUnidades[unidadeUpper]) {
        unidade_medida = mapaUnidades[unidadeUpper];
      }
      if (unidade_medida.length > 20) {
        unidade_medida = unidade_medida.substring(0, 20);
      }

      const quantidade = Number(item?.quantidade) || 0;
      let valor_unitario = Number(item?.valor_unitario) || 0;
      const quantidade_meses = item?.quantidade_meses != null ? Number(item.quantidade_meses) || null : null;
      let valor_total = Number(item?.valor_total) || 0;

      // Validar coerência: valor_total deve ser ≈ valor_unitario × quantidade
      // A IA frequentemente confunde "Valor Total" com "Valor Unitário" em tabelas de PDF
      if (quantidade > 0 && valor_unitario > 0 && valor_total > 0) {
        const calculado = Number((valor_unitario * quantidade).toFixed(2));
        const tolerancia = Math.max(calculado * 0.02, 1); // 2% ou R$1

        if (Math.abs(calculado - valor_total) > tolerancia) {
          // valor_unitario × quantidade ≠ valor_total — tentar corrigir
          const unitarioInferido = Number((valor_total / quantidade).toFixed(2));
          const calculadoInverso = Number((unitarioInferido * quantidade).toFixed(2));

          if (Math.abs(calculadoInverso - valor_total) <= tolerancia) {
            // valor_total / quantidade = unitário correto → IA confundiu unitário com total
            valor_unitario = unitarioInferido;
          }
        }
      }

      // Se temos valor_total mas não valor_unitario, inferir
      if (valor_total > 0 && valor_unitario === 0 && quantidade > 0) {
        valor_unitario = Number((valor_total / quantidade).toFixed(2));
      }

      // Se temos valor_unitario mas não valor_total, calcular
      if (valor_unitario > 0 && valor_total === 0 && quantidade > 0) {
        valor_total = Number((valor_unitario * quantidade).toFixed(2));
      }

      // Evitar dupla multiplicação: quando valor_total ≈ valor_unitario × quantidade
      // e quantidade_meses é igual à quantidade, a IA interpretou "Quantidade (Mês)"
      // como ambos campos. Downstream o sistema calcularia unitário × quantidade × meses,
      // dobrando o valor. Neste caso, quantidade_meses deve ser null.
      let quantidade_meses_final = quantidade_meses;
      if (quantidade_meses && quantidade > 0 && valor_unitario > 0 && valor_total > 0) {
        const totalSemMeses = Number((valor_unitario * quantidade).toFixed(2));
        const totalComMeses = Number((valor_unitario * quantidade * quantidade_meses).toFixed(2));
        const tolerancia = Math.max(valor_total * 0.02, 1);

        if (Math.abs(totalSemMeses - valor_total) <= tolerancia) {
          // valor_total = unitário × quantidade (meses já está embutido na quantidade)
          quantidade_meses_final = null;
        } else if (Math.abs(totalComMeses - valor_total) > tolerancia && quantidade_meses === quantidade) {
          // Nem com nem sem meses bate — e meses == quantidade → provavelmente duplicou
          quantidade_meses_final = null;
        }
      }

      return { descricao, unidade_medida, quantidade, valor_unitario, quantidade_meses: quantidade_meses_final, valor_total: valor_total || undefined };
    })
    .filter((item) => item.descricao && (item.valor_total || (item.quantidade > 0 && item.valor_unitario > 0)));
}

function ajustarItemParaPersistencia(item: {
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_meses?: number | null;
  valor_total?: number;
}): {
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_meses?: number | null;
  valor_total?: number;
} {
  const descricao = String(item.descricao || '').trim();
  const unidadeMedida = String(item.unidade_medida || 'UNIDADE').trim() || 'UNIDADE';
  const quantidadeOriginal = Number(item.quantidade) || 0;
  const valorUnitarioOriginal = Number(item.valor_unitario) || 0;
  const quantidadeMesesOriginal = item.quantidade_meses != null ? Number(item.quantidade_meses) || null : null;
  const valorTotalOriginal = Number(item.valor_total) || 0;
  const textoBase = `${descricao} ${unidadeMedida}`.toLowerCase();

  let quantidade = quantidadeOriginal > 0 ? quantidadeOriginal : 1;
  let valorUnitario = valorUnitarioOriginal;
  let quantidade_meses = quantidadeMesesOriginal;
  let valor_total = valorTotalOriginal || Number((quantidade * valorUnitario).toFixed(2));

  const itemRecorrente = /(licen[cç]a|mensal|mensalidade|loca[cç][aã]o|sustenta[cç][aã]o|suporte t[eé]cnico|manuten[cç][aã]o)/i.test(textoBase);
  const valorCalculadoComMeses = quantidade_meses ? Number((quantidade * valorUnitario * quantidade_meses).toFixed(2)) : Number((quantidade * valorUnitario).toFixed(2));

  if (valor_total > 0 && itemRecorrente) {
    const divergenciaRelevante = valorCalculadoComMeses > 0 && Math.abs(valorCalculadoComMeses - valor_total) > 0.01;
    if (divergenciaRelevante) {
      if (quantidade_meses && quantidade_meses > 1) {
        const valorMensalInferido = Number((valor_total / quantidade_meses).toFixed(2));
        if (valorMensalInferido > 0) {
          quantidade = 1;
          valorUnitario = valorMensalInferido;
        }
      } else if (quantidade > 1) {
        const valorUnitarioInferido = Number((valor_total / quantidade).toFixed(2));
        if (valorUnitarioInferido > 0) {
          valorUnitario = valorUnitarioInferido;
        }
      }
    }
  }

  return {
    descricao,
    unidade_medida: unidadeMedida,
    quantidade,
    valor_unitario: valorUnitario,
    quantidade_meses,
    valor_total: valor_total > 0 ? valor_total : undefined,
  };
}

function extrairItensDaRespostaIA(respostaIA: string): Array<any> {
  const jsonLimpo = respostaIA.replace(/```json\n?|```/g, '').trim();
  const dadosExtraidos = tentarExtrairJson(jsonLimpo);

  if (!dadosExtraidos || !Array.isArray(dadosExtraidos.itens)) {
    return [];
  }

  return normalizarItensExtraidos(dadosExtraidos.itens);
}

function parseNumeroBrasileiro(valor?: string | null): number {
  if (!valor) return 0;
  const normalizado = String(valor)
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');

  return Number(normalizado) || 0;
}

function limparTextoTabelaItens(texto: string): string {
  return texto
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/Rua Octogonal[\s\S]*?www\.cmlem\.ba\.qov\.br/gi, ' ')
    .replace(/CNPJ\s+[\d./-]+[\s\S]*?www\.cmlem\.ba\.qov\.br/gi, ' ')
    .replace(/\b\d{6}\b/g, ' ')
    .replace(/ITEM\s+DESCRIÇÃO\s*LOCAL\s+DE\s+INSTALAÇÃO\s*UNID\.?\s*Q[UÜ]ANT\.?\s*VALOR[\s\S]*?TOTAL/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairTrechoBrutoTabelaItens(texto: string): string {
  const inicioCabecalho = texto.search(/ITEM\s+DESCRIÇÃO\s*LOCAL\s+DE\s+INSTALAÇÃO/i);
  const inicioPrimeiroItem = texto.search(/(?:^|\s)1\s*(?=Persiana|Cortina|Pel[ií]cula|Fornecimento|Servi[cç]o)/im);
  const inicio = inicioCabecalho >= 0
    ? inicioCabecalho
    : inicioPrimeiroItem;

  if (inicio === -1) {
    return '';
  }

  const trecho = texto.slice(inicio);
  const fimValorGlobal = trecho.search(/O valor global do contrato/i);
  const fimClausula = trecho.search(/\b\d+\.\s*CL[ÁA]USULA\b/i);

  const fimCandidatos = [fimValorGlobal, fimClausula].filter((valor) => valor > 0);
  const fim = fimCandidatos.length ? Math.min(...fimCandidatos) : trecho.length;

  return trecho.slice(0, fim);
}

function extrairBlocosTabelaItens(texto: string): Array<{ numero_item: number; bloco: string }> {
  const trechoBruto = extrairTrechoBrutoTabelaItens(texto);
  if (!trechoBruto) {
    return [];
  }

  const itemStartPattern = /(?:^|\s)(\d{1,3})\s*(?=Persiana|Cortina|Pel[ií]cula|Fornecimento|Servi[cç]o)/gim;
  const inicios = Array.from(trechoBruto.matchAll(itemStartPattern));

  return inicios.map((match, indice) => {
    const numeroCapturado = match[1] || '';
    const posicaoNumero = match[0].lastIndexOf(numeroCapturado);
    const inicioBloco = (match.index ?? 0) + Math.max(posicaoNumero, 0);
    const fimBloco = indice + 1 < inicios.length
      ? (() => {
          const proximoNumero = inicios[indice + 1][1] || '';
          const proximaPosicaoNumero = inicios[indice + 1][0].lastIndexOf(proximoNumero);
          return (inicios[indice + 1].index ?? trechoBruto.length) + Math.max(proximaPosicaoNumero, 0);
        })()
      : trechoBruto.length;

    return {
      numero_item: Number(match[1]),
      bloco: trechoBruto.slice(inicioBloco, fimBloco).trim(),
    };
  });
}

function normalizarBlocoItemTabela(bloco: string): string {
  return bloco
    .replace(/Rua Octogonal[\s\S]*?www\.cmlem\.ba\.qov\.br/gi, '\n')
    .replace(/CNPJ\s+[\d./-]+[\s\S]*?www\.cmlem\.ba\.qov\.br/gi, '\n')
    .replace(/^[^\n]*(?:maGALHAES|MAGALHÃES|ARDü|kv>m\||LÉ\s+Eduardo|V'U\s*v)[^\n]*$/gim, ' ')
    .replace(/\b\d{6}\b/g, ' ')
    .replace(/\bRS\b/g, 'R$')
    .replace(/R\s*S\s*/g, 'R$ ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tentarExtrairCamposBlocoTabela(bloco: string): {
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
} | null {
  const regexPadrao = /^(.*?)\s+(M2|M²|M3|M³|UNIDADE|UNID\.?|UND\.?|UN|M|METRO|METROS|MES|MÊS|MESES|DIARIA|DIÁRIA|HORA|HORAS|KG|QUILOGRAMA|LITRO|LITROS)\s+(\d+(?:,\d+)?)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/i;
  const matchPadrao = bloco.match(regexPadrao);
  if (matchPadrao) {
    return {
      descricao: matchPadrao[1].replace(/\s+/g, ' ').trim(),
      unidade_medida: matchPadrao[2].trim(),
      quantidade: parseNumeroBrasileiro(matchPadrao[3]),
      valor_unitario: parseNumeroBrasileiro(matchPadrao[4]),
      valor_total: parseNumeroBrasileiro(matchPadrao[5]),
    };
  }

  const regexComSobra = /^(.*?)\s+(M2|M²|M3|M³|UNIDADE|UNID\.?|UND\.?|UN|M|METRO|METROS|MES|MÊS|MESES|DIARIA|DIÁRIA|HORA|HORAS|KG|QUILOGRAMA|LITRO|LITROS)\s+(\d+(?:,\d+)?)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)(.*)$/i;
  const matchComSobra = bloco.match(regexComSobra);
  if (matchComSobra) {
    return {
      descricao: `${matchComSobra[1]} ${matchComSobra[6]}`.replace(/\s+/g, ' ').trim(),
      unidade_medida: matchComSobra[2].trim(),
      quantidade: parseNumeroBrasileiro(matchComSobra[3]),
      valor_unitario: parseNumeroBrasileiro(matchComSobra[4]),
      valor_total: parseNumeroBrasileiro(matchComSobra[5]),
    };
  }

  return null;
}

function extrairItensTabelaTexto(textoExtraido: string): Array<{
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_meses?: number | null;
  valor_total?: number;
}> {
  const blocos = extrairBlocosTabelaItens(textoExtraido);
  if (!blocos.length) {
    return [];
  }

  const itens = new Map<number, {
    descricao: string;
    unidade_medida: string;
    quantidade: number;
    valor_unitario: number;
    quantidade_meses?: number | null;
    valor_total?: number;
  }>();

  for (const blocoItem of blocos) {
    const numeroItem = blocoItem.numero_item;
    const blocoOriginal = blocoItem.bloco;
    let bloco = normalizarBlocoItemTabela(blocoOriginal)
      .replace(/^\s*\d{1,3}/, '')
      .replace(/O valor global do contrato[\s\S]*$/i, ' ')
      .replace(/\d+\.\s*CL[ÁA]USULA[\s\S]*$/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const campos = tentarExtrairCamposBlocoTabela(bloco);
    if (!campos) {
      continue;
    }

    const descricao = campos.descricao;
    const unidade = campos.unidade_medida.replace(/\.+$/g, '').trim();
    const quantidade = campos.quantidade;
    const valorUnitario = campos.valor_unitario;
    const valorTotal = campos.valor_total;

    if (!descricao || !quantidade || !valorUnitario) {
      continue;
    }

    itens.set(numeroItem, {
      descricao,
      unidade_medida: unidade,
      quantidade,
      valor_unitario: valorUnitario,
      quantidade_meses: null,
      valor_total: valorTotal || Number((quantidade * valorUnitario).toFixed(2)),
    });
  }

  return Array.from(itens.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}

function normalizarItensExtraidosComNumero(itens: any[]): Array<{
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_meses?: number | null;
  valor_total?: number;
}> {
  return itens
    .map((item) => ({
      numero_item: Number(item?.numero_item) || 0,
      descricao: String(item?.descricao || '').trim(),
      unidade_medida: String(item?.unidade_medida || 'UNIDADE').trim() || 'UNIDADE',
      quantidade: Number(item?.quantidade) || 0,
      valor_unitario: Number(item?.valor_unitario) || 0,
      quantidade_meses: item?.quantidade_meses != null ? Number(item.quantidade_meses) || null : null,
      valor_total: Number(item?.valor_total) || undefined,
    }))
    .filter((item) => item.numero_item > 0 && item.descricao && (item.valor_total || (item.quantidade > 0 && item.valor_unitario > 0)));
}

function extrairItensNumeradosDaRespostaIA(respostaIA: string): Array<{
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_meses?: number | null;
  valor_total?: number;
}> {
  const jsonLimpo = respostaIA.replace(/```json\n?|```/g, '').trim();
  const dadosExtraidos = tentarExtrairJson(jsonLimpo);

  if (!dadosExtraidos || !Array.isArray(dadosExtraidos.itens)) {
    return [];
  }

  return normalizarItensExtraidosComNumero(dadosExtraidos.itens);
}

function mapearUnidadeMedidaContrato(unidade?: string | null): UnidadeMedidaContrato {
  const valor = String(unidade || '').trim().toUpperCase();

  if (!valor) return UnidadeMedidaContrato.UNIDADE;
  if (['UN', 'UND', 'UNIDADE', 'UNIDADES'].includes(valor)) return UnidadeMedidaContrato.UNIDADE;
  if (['PECA', 'PEÇA', 'PECAS', 'PEÇAS'].includes(valor)) return UnidadeMedidaContrato.PECA;
  if (['CX', 'CAIXA', 'CAIXAS'].includes(valor)) return UnidadeMedidaContrato.CAIXA;
  if (['PCT', 'PACOTE', 'PACOTES'].includes(valor)) return UnidadeMedidaContrato.PACOTE;
  if (['M', 'MT', 'METRO', 'METROS'].includes(valor)) return UnidadeMedidaContrato.METRO;
  if (['M2', 'M²', 'METRO_QUADRADO', 'METROS_QUADRADOS'].includes(valor)) return UnidadeMedidaContrato.METRO_QUADRADO;
  if (['M3', 'M³', 'METRO_CUBICO', 'METRO_CÚBICO', 'METROS_CUBICOS', 'METROS_CÚBICOS'].includes(valor)) return UnidadeMedidaContrato.METRO_CUBICO;
  if (['L', 'LT', 'LITRO', 'LITROS'].includes(valor)) return UnidadeMedidaContrato.LITRO;
  if (['KG', 'KILO', 'QUILO', 'QUILOGRAMA', 'QUILOGRAMAS'].includes(valor)) return UnidadeMedidaContrato.QUILOGRAMA;
  if (['T', 'TON', 'TONELADA', 'TONELADAS'].includes(valor)) return UnidadeMedidaContrato.TONELADA;
  if (['H', 'HR', 'HORA', 'HORAS'].includes(valor)) return UnidadeMedidaContrato.HORA;
  if (['DIARIA', 'DIÁRIA', 'DIARIAS', 'DIÁRIAS'].includes(valor)) return UnidadeMedidaContrato.DIARIA;
  if (['MES', 'MÊS', 'MESES'].includes(valor)) return UnidadeMedidaContrato.MES;
  if (['ANO', 'ANOS'].includes(valor)) return UnidadeMedidaContrato.ANO;
  if (['SERVICO', 'SERVIÇO', 'SERVICOS', 'SERVIÇOS'].includes(valor)) return UnidadeMedidaContrato.SERVICO;
  if (['GLOBAL', 'CONTRATO GLOBAL'].includes(valor)) return UnidadeMedidaContrato.GLOBAL;

  return UnidadeMedidaContrato.UNIDADE;
}

function inferirModalidadeExecucaoContrato(params: {
  categoria?: CategoriaContrato;
}): ModalidadeExecucao {
  if (params.categoria === CategoriaContrato.SERVICOS || params.categoria === CategoriaContrato.OBRAS || params.categoria === CategoriaContrato.SERVICOS_ENGENHARIA) {
    return ModalidadeExecucao.MEDICAO;
  }

  return ModalidadeExecucao.ITEM_QUANTIDADE;
}

function inferirCategoriaContrato(params: {
  objeto?: string;
  itens?: Array<{
    descricao?: string;
    unidade_medida?: string;
  }>;
}): CategoriaContrato {
  const objeto = String(params.objeto || '').toLowerCase();

  // Prioridade 1: objeto do contrato indica claramente COMPRAS (aquisição/fornecimento de produtos/materiais)
  if (/(aquisi[cç][aã]o|fornecimento de (materia|produto|equipamento|m[oó]ve)[a-zà-ú]*|compra de)/i.test(objeto)) {
    return CategoriaContrato.COMPRAS;
  }

  // Prioridade 2: objeto indica OBRAS
  if (/(obra|reforma|amplia[cç][aã]o|constru[cç][aã]o)/i.test(objeto)) {
    return CategoriaContrato.OBRAS;
  }

  // Prioridade 3: objeto indica ENGENHARIA
  if (/(engenharia|projeto executivo|projeto b[aá]sico|servi[cç]os? de engenharia)/i.test(objeto)) {
    return CategoriaContrato.SERVICOS_ENGENHARIA;
  }

  // Prioridade 4: objeto indica SERVIÇOS
  if (/(presta[cç][aã]o de servi[cç]o|assessoria|consultoria|software|sistema|licen[cç]a|loca[cç][aã]o|manuten[cç][aã]o|suporte t[eé]cnico)/i.test(objeto)) {
    return CategoriaContrato.SERVICOS;
  }

  // Fallback: analisar itens (só se o objeto não foi conclusivo)
  const itens = params.itens || [];
  const textoItens = itens
    .map((item) => `${item?.descricao || ''} ${item?.unidade_medida || ''}`.toLowerCase())
    .join(' ');

  if (/(obra|reforma|constru[cç][aã]o)/i.test(textoItens)) {
    return CategoriaContrato.OBRAS;
  }

  // Heurística: unidades como UN, PCT, CX, KG, LT indicam compras
  const unidades = itens.map((i) => (i?.unidade_medida || '').toUpperCase());
  const unidadesCompra = unidades.filter((u) => /^(UN|UND|UNID|UNIDADE|PCT|PACOTE|CX|CAIXA|KG|LT|ML|LITRO|ROLO|FRASCO|GALÃO|GARRAFA|BALDE|SACO|RESMA|PAR|POTE)$/i.test(u));
  if (unidadesCompra.length > itens.length * 0.5) {
    return CategoriaContrato.COMPRAS;
  }

  return CategoriaContrato.COMPRAS;
}

export interface PortalTransparenciaContrato {
  id?: string;
  contratoNumero: string;
  documento: string;
  favorecido: string;
  contratoObjeto: string;
  vigencia: string;
  vigencia_inicio?: string;
  aditivos_valor_total?: string | null;
  valor_contrato?: string;
  url?: string;
  fiscal?: string;
  ja_cadastrado?: boolean;
  contrato_id_existente?: string;
}

export interface PortalTransparenciaResponse {
  resource: string;
  count: number;
  data: PortalTransparenciaContrato[];
}

export interface ImportacaoContratoJobStatus {
  job_id: string;
  status: 'pendente' | 'processando' | 'concluido' | 'erro';
  progresso: number;
  etapa: string;
  mensagem: string;
  contrato_id?: string;
  itens_criados?: number;
  itens_total_pdf?: number;
  itens_faltantes?: number[];
  valor_contrato_referencia?: number;
  valor_itens_importados?: number;
  divergencia_valor?: number;
  percentual_divergencia?: number;
  aviso_conferencia?: string;
  concluido: boolean;
  erro?: string;
  atualizado_em: string;
}

@Injectable()
export class PortalTransparenciaService {
  private readonly logger = new Logger(PortalTransparenciaService.name);
  private readonly baseUrl = 'https://portaldatransparencia.cmlem.ba.gov.br/api';
  private readonly importacoesIndividuais = new Map<string, ImportacaoContratoJobStatus>();

  constructor(
    private readonly httpService: HttpService,
    private readonly contratosService: ContratosService,
    private readonly fornecedoresService: FornecedoresService,
    private readonly iaService: IaService,
    private readonly medicaoService: MedicaoService,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    @InjectRepository(ItemContrato)
    private readonly itemContratoRepository: Repository<ItemContrato>,
    @InjectRepository(DocumentoContrato)
    private readonly documentoContratoRepository: Repository<DocumentoContrato>,
  ) {}

  /**
   * Busca aditivos de um contrato no Portal de Transparência via scraping HTML.
   */
  async buscarAditivosPortal(portalContratoId: string): Promise<{
    contrato_numero: string;
    aditivos: Array<{
      nome: string;
      tipo: string;
      valor: string;
      vigencia: string;
      fiscal: string;
      pdf_url: string;
    }>;
  }> {
    const url = `https://portaldatransparencia.cmlem.ba.gov.br/aditivos/?id=${portalContratoId}`;
    this.logger.log(`[buscarAditivosPortal] Scraping: ${url}`);

    const response = await firstValueFrom(
      this.httpService.get(url, { responseType: 'text', timeout: 15000 }),
    );
    const html: string = response.data;

    const contratoMatch = html.match(/<h3[^>]*>.*?Contrato.*?<\/h3>\s*<table[^>]*>([\s\S]*?)<\/table>/i);
    let contratoNumero = '';
    if (contratoMatch) {
      const firstTd = contratoMatch[1].match(/<td[^>]*>([\s\S]*?)<\/td>/);
      contratoNumero = firstTd ? firstTd[1].replace(/<[^>]+>/g, '').trim() : '';
    }

    const aditivosMatch = html.match(/Aditivos do contrato[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    const aditivos: Array<{ nome: string; tipo: string; valor: string; vigencia: string; fiscal: string; pdf_url: string }> = [];

    if (aditivosMatch) {
      const tableHtml = aditivosMatch[1];
      const rows = [...tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];

      for (const row of rows) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
        if (cells.length < 5) continue;

        const clean = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const pdfMatch = cells[cells.length - 1]?.match(/href="([^"]+)"/);

        aditivos.push({
          nome: clean(cells[0]),
          tipo: clean(cells[1]),
          valor: clean(cells[2]),
          vigencia: clean(cells[3]),
          fiscal: clean(cells[4]),
          pdf_url: pdfMatch ? pdfMatch[1] : '',
        });
      }
    }

    this.logger.log(`[buscarAditivosPortal] Encontrados ${aditivos.length} aditivos para contrato ${contratoNumero}`);
    return { contrato_numero: contratoNumero, aditivos };
  }

  /**
   * Busca aditivos de um contrato do sistema no Portal de Transparência.
   * Usa o numero_contrato para encontrar o ID do portal e então buscar os aditivos.
   */
  async buscarAditivosPorContratoId(contratoId: string): Promise<{
    contrato_numero: string;
    aditivos: Array<{
      nome: string;
      tipo: string;
      valor: string;
      vigencia: string;
      fiscal: string;
      pdf_url: string;
    }>;
  }> {
    const contrato = await this.contratosService.findOne(contratoId);
    if (!contrato) {
      throw new Error('Contrato não encontrado');
    }

    const numeroContrato = contrato.numero_contrato;
    this.logger.log(`[buscarAditivosPorContratoId] Buscando contrato ${numeroContrato} no portal...`);

    // Buscar contrato na API do portal pelo número
    const resultado = await this.buscarContratos({ numero: numeroContrato });
    if (!resultado.data || resultado.data.length === 0) {
      this.logger.warn(`[buscarAditivosPorContratoId] Contrato ${numeroContrato} não encontrado no portal`);
      return { contrato_numero: numeroContrato, aditivos: [] };
    }

    // Encontrar o contrato exato (pode haver múltiplos com números parecidos)
    const contratoPortal = resultado.data.find(c => c.contratoNumero === numeroContrato || c.contratoNumero === numeroContrato + '-Contrato');
    if (!contratoPortal) {
      this.logger.warn(`[buscarAditivosPorContratoId] Nenhum contrato exato para ${numeroContrato}`);
      return { contrato_numero: numeroContrato, aditivos: [] };
    }

    // Usar o ID do portal diretamente (campo retornado pela API)
    let portalContratoId = contratoPortal.id || '';

    // Fallback: extrair da URL se id não estiver disponível
    if (!portalContratoId && contratoPortal.url) {
      const idMatch = contratoPortal.url.match(/[?&]id=(\d+)/);
      if (idMatch) {
        portalContratoId = idMatch[1];
      }
    }

    if (!portalContratoId) {
      // Fallback: tentar scraping da página de listagem
      this.logger.log(`[buscarAditivosPorContratoId] Sem ID na URL, tentando scraping da listagem...`);
      const listagemUrl = `https://portaldatransparencia.cmlem.ba.gov.br/contratos/?inputContratoNumero=${encodeURIComponent(numeroContrato)}&action=search`;
      try {
        const listagemHtml = await firstValueFrom(
          this.httpService.get(listagemUrl, { responseType: 'text', timeout: 15000 }),
        );
        const linkMatch = listagemHtml.data.match(/aditivos\/\?id=(\d+)/);
        if (linkMatch) {
          portalContratoId = linkMatch[1];
        }
      } catch (e) {
        this.logger.warn(`[buscarAditivosPorContratoId] Erro ao buscar listagem: ${e.message}`);
      }
    }

    if (!portalContratoId) {
      this.logger.warn(`[buscarAditivosPorContratoId] Não foi possível obter o ID do portal para ${numeroContrato}`);
      return { contrato_numero: numeroContrato, aditivos: [] };
    }

    this.logger.log(`[buscarAditivosPorContratoId] Portal ID: ${portalContratoId}, buscando aditivos...`);
    return this.buscarAditivosPortal(portalContratoId);
  }

  /**
   * Importa aditivos do Portal de Transparência para um contrato existente no sistema.
   */
  async importarAditivos(
    contratoId: string,
    aditivos: Array<{
      nome: string;
      tipo: string;
      valor: string;
      vigencia: string;
      fiscal: string;
      pdf_url: string;
    }>,
  ): Promise<{ importados: number; ja_existentes: number; erros: number; detalhes: Array<{ nome: string; status: string; mensagem?: string }> }> {
    const resultado = { importados: 0, ja_existentes: 0, erros: 0, detalhes: [] as Array<{ nome: string; status: string; mensagem?: string }> };

    for (const aditivo of aditivos) {
      try {
        const existente = await this.contratosService.buscarTermoAditivoPorNome(contratoId, aditivo.nome);
        if (existente) {
          resultado.ja_existentes++;
          resultado.detalhes.push({ nome: aditivo.nome, status: 'ja_existe' });
          continue;
        }

        const tipoTexto = (aditivo.tipo || '').toLowerCase();
        let tipo: string;
        if (tipoTexto.includes('prazo') && (tipoTexto.includes('valor') || tipoTexto.includes('acréscimo'))) {
          tipo = 'ADITIVO_PRAZO_VALOR';
        } else if (tipoTexto.includes('prazo')) {
          tipo = 'ADITIVO_PRAZO';
        } else if (tipoTexto.includes('acréscimo') || tipoTexto.includes('valor') || tipoTexto.includes('acresc')) {
          tipo = 'ADITIVO_VALOR';
        } else if (tipoTexto.includes('supressão') || tipoTexto.includes('supress')) {
          tipo = 'ADITIVO_VALOR';
        } else if (tipoTexto.includes('apostil')) {
          tipo = 'APOSTILAMENTO';
        } else if (tipoTexto.includes('rescis')) {
          tipo = 'RESCISAO';
        } else if (tipoTexto.includes('reajuste')) {
          tipo = 'REAJUSTE';
        } else {
          tipo = 'ADITIVO_PRAZO_VALOR';
        }

        let valorNum = 0;
        if (aditivo.valor) {
          valorNum = parseFloat(aditivo.valor.replace(/^R\$\s*/, '').replace(/\./g, '').replace(',', '.')) || 0;
        }

        const datas = aditivo.vigencia.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
        const parseData = (d: string) => {
          const [dia, mes, ano] = d.split('/').map(Number);
          return new Date(ano, mes - 1, dia);
        };
        const dataInicio = datas[0] ? parseData(datas[0]) : new Date();
        const dataFim = datas[1] ? parseData(datas[1]) : undefined;

        await this.contratosService.criarTermoAditivo(contratoId, {
          tipo: tipo as any,
          objeto: `${aditivo.nome} — importado do Portal de Transparência`,
          valor_acrescimo: valorNum > 0 ? valorNum : undefined,
          data_assinatura: dataInicio,
          data_vigencia_inicio: dataInicio,
          data_vigencia_fim: dataFim,
          nova_data_vigencia_fim: dataFim,
          observacoes: `Fiscal: ${aditivo.fiscal}. Importado automaticamente do Portal de Transparência.`,
        } as any);

        resultado.importados++;
        resultado.detalhes.push({ nome: aditivo.nome, status: 'importado' });
      } catch (err: any) {
        resultado.erros++;
        resultado.detalhes.push({ nome: aditivo.nome, status: 'erro', mensagem: err.message });
        this.logger.warn(`[importarAditivos] Erro no aditivo "${aditivo.nome}": ${err.message}`);
      }
    }

    return resultado;
  }

  /**
   * Busca contratos na API do Portal de Transparência
   */
  async buscarContratos(params: {
    numero?: string;
    limit?: number;
    offset?: number;
    apenas_vigentes?: boolean;
  }): Promise<PortalTransparenciaResponse> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('resource', 'contratos');
      
      if (params.numero) queryParams.append('numero', params.numero);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const url = `${this.baseUrl}/?${queryParams.toString()}`;
      this.logger.log(`Buscando contratos na API: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get<PortalTransparenciaResponse>(url)
      );

      let data = response.data.data || [];
      
      // Filtrar apenas contratos vigentes se solicitado
      if (params.apenas_vigentes) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        data = data.filter(contrato => {
          const dataVigencia = this.parseDataBrasileira(contrato.vigencia);
          return dataVigencia >= hoje;
        });
        
        this.logger.log(`Filtrados ${data.length} contratos vigentes de ${response.data.data?.length || 0} total`);
      }

      return {
        resource: response.data.resource,
        count: data.length,
        data: data
      };
    } catch (error) {
      this.logger.error(`Erro ao buscar contratos na API: ${error.message}`, error.stack);
      throw new Error(`Falha ao consultar API do Portal de Transparência: ${error.message}`);
    }
  }

  /**
   * Cruza contratos da API com os já cadastrados no banco e marca duplicados.
   */
  async marcarContratosJaCadastrados(
    contratosApi: PortalTransparenciaContrato[],
    orgaoId: string,
  ): Promise<PortalTransparenciaContrato[]> {
    const numerosParaBuscar = contratosApi.map((c) => c.contratoNumero.replace('-Contrato', ''));

    const contratosExistentes = await this.contratosService.findByNumeros(numerosParaBuscar, orgaoId);

    const mapaExistentes = new Map<string, string>();
    for (const c of contratosExistentes) {
      mapaExistentes.set(c.numero_contrato, c.id);
    }

    return contratosApi.map((c) => {
      const numeroLimpo = c.contratoNumero.replace('-Contrato', '');
      const idExistente = mapaExistentes.get(numeroLimpo);
      return {
        ...c,
        ja_cadastrado: !!idExistente,
        contrato_id_existente: idExistente || undefined,
      };
    });
  }

  /**
   * Importa contratos da API para o sistema
   */
  async importarContratos(
    orgaoId: string,
    params: {
      numero?: string;
      limit?: number;
      offset?: number;
      apenas_vigentes?: boolean;
    }
  ): Promise<{
    importados: number;
    erros: number;
    detalhes: Array<{ numero: string; status: 'sucesso' | 'erro'; mensagem?: string }>;
  }> {
    const resultado = {
      importados: 0,
      erros: 0,
      detalhes: [] as Array<{ numero: string; status: 'sucesso' | 'erro'; mensagem?: string }>,
    };

    try {
      const apiResponse = await this.buscarContratos(params);
      
      if (!apiResponse.data || apiResponse.data.length === 0) {
        this.logger.log('Nenhum contrato encontrado na API');
        return resultado;
      }

      this.logger.log(`Encontrados ${apiResponse.data.length} contratos para importar`);

      for (const contratoApi of apiResponse.data) {
        try {
          await this.importarContratoIndividual(orgaoId, contratoApi);
          resultado.importados++;
          resultado.detalhes.push({
            numero: contratoApi.contratoNumero,
            status: 'sucesso',
          });
        } catch (error) {
          resultado.erros++;
          resultado.detalhes.push({
            numero: contratoApi.contratoNumero,
            status: 'erro',
            mensagem: error.message,
          });
          this.logger.error(`Erro ao importar contrato ${contratoApi.contratoNumero}: ${error.message}`);
        }
      }

      return resultado;
    } catch (error) {
      this.logger.error(`Erro na importação: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Importa um contrato individual e retorna status detalhado
   */
  async importarContratoIndividualPublico(
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato
  ): Promise<{
    sucesso: boolean;
    ja_existe: boolean;
    contrato_id?: string;
    numero: string;
    mensagem?: string;
  }> {
    this.logger.log(`[Importar Individual] Iniciando: ${contratoApi.contratoNumero}, orgaoId: ${orgaoId}`);
    
    try {
      // Verificar se contrato já existe
      this.logger.log(`[Importar Individual] Verificando se contrato existe...`);
      const contratoExistente = await this.contratosService.findByNumero(
        contratoApi.contratoNumero,
        orgaoId
      );
      
      if (contratoExistente) {
        this.logger.log(`[Importar Individual] Contrato já existe: ${contratoExistente.id}`);
        return {
          sucesso: false,
          ja_existe: true,
          numero: contratoApi.contratoNumero,
          mensagem: 'Contrato já existe no sistema'
        };
      }

      // Importar contrato
      this.logger.log(`[Importar Individual] Chamando importarContratoIndividual...`);
      await this.importarContratoIndividual(orgaoId, contratoApi);
      
      // Buscar contrato criado para retornar ID (usar mesmo número formatado usado na criação)
      const numeroFormatado = contratoApi.contratoNumero.replace('-Contrato', '');
      this.logger.log(`[Importar Individual] Buscando contrato criado com número: ${numeroFormatado}`);
      const contratoCriado = await this.contratosService.findByNumero(
        numeroFormatado,
        orgaoId
      );

      if (!contratoCriado) {
        this.logger.error(`[Importar Individual] Contrato não encontrado após criação!`);
        return {
          sucesso: false,
          ja_existe: false,
          numero: contratoApi.contratoNumero,
          mensagem: 'Contrato criado mas não encontrado no banco de dados'
        };
      }

      this.logger.log(`[Importar Individual] Sucesso! ID: ${contratoCriado.id}`);

      // Baixar PDF se tiver URL
      let pdfBaixado = false;
      if (contratoApi.url) {
        try {
          this.logger.log(`[Importar Individual] Baixando PDF: ${contratoApi.url}`);
          const pdfBuffer = await this.baixarPdfContrato(contratoApi.url);
          pdfBaixado = true;
          this.logger.log(`[Importar Individual] PDF baixado: ${pdfBuffer.length} bytes`);

          // Salvar PDF em documentos do contrato
          try {
            await this.salvarPdfDocumento(contratoCriado.id, pdfBuffer, contratoApi.contratoNumero);
            this.logger.log(`[Importar Individual] PDF salvo em documentos`);
          } catch (docError) {
            this.logger.warn(`[Importar Individual] Erro ao salvar PDF: ${docError.message}`);
          }
        } catch (pdfError) {
          this.logger.warn(`[Importar Individual] PDF não baixado: ${pdfError.message}`);
        }
      }

      return {
        sucesso: true,
        ja_existe: false,
        contrato_id: contratoCriado.id,
        numero: contratoApi.contratoNumero,
        mensagem: pdfBaixado ? 'Contrato e PDF importados com sucesso' : 'Contrato importado com sucesso'
      };
    } catch (error) {
      this.logger.error(`[Importar Individual] Erro: ${error.message}`, error.stack);
      return {
        sucesso: false,
        ja_existe: false,
        numero: contratoApi.contratoNumero,
        mensagem: error.message
      };
    }
  }

  iniciarImportacaoContratoCompletoJob(
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato,
  ): { job_id: string } {
    const jobId = randomUUID();

    this.importacoesIndividuais.set(jobId, {
      job_id: jobId,
      status: 'pendente',
      progresso: 0,
      etapa: 'Fila',
      mensagem: 'Importação adicionada à fila',
      concluido: false,
      atualizado_em: new Date().toISOString(),
    });

    void this.processarImportacaoContratoCompleta(jobId, orgaoId, contratoApi);

    return { job_id: jobId };
  }

  obterStatusImportacaoContratoCompleto(jobId: string): ImportacaoContratoJobStatus | null {
    return this.importacoesIndividuais.get(jobId) || null;
  }

  private atualizarStatusImportacao(
    jobId: string,
    dados: Partial<ImportacaoContratoJobStatus>,
  ): void {
    const atual = this.importacoesIndividuais.get(jobId);
    if (!atual) return;

    this.importacoesIndividuais.set(jobId, {
      ...atual,
      ...dados,
      atualizado_em: new Date().toISOString(),
    });
  }

  private async processarImportacaoContratoCompleta(
    jobId: string,
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato,
  ): Promise<void> {
    try {
      this.atualizarStatusImportacao(jobId, {
        status: 'processando',
        progresso: 5,
        etapa: 'Validando contrato',
        mensagem: `Preparando importação do contrato ${contratoApi.contratoNumero}`,
      });

      const resultado = await this.importarContratoCompleto(
        orgaoId,
        contratoApi,
        (status) => this.atualizarStatusImportacao(jobId, status),
      );

      this.atualizarStatusImportacao(jobId, {
        status: 'concluido',
        progresso: 100,
        etapa: 'Concluído',
        mensagem: resultado.mensagem,
        contrato_id: resultado.contrato_id,
        itens_criados: resultado.itens_criados,
        valor_contrato_referencia: resultado.valor_contrato_referencia,
        valor_itens_importados: resultado.valor_itens_importados,
        divergencia_valor: resultado.divergencia_valor,
        percentual_divergencia: resultado.percentual_divergencia,
        aviso_conferencia: resultado.aviso_conferencia,
        concluido: true,
      });
    } catch (error) {
      this.logger.error(`[Importação Job ${jobId}] ${error.message}`, error.stack);
      this.atualizarStatusImportacao(jobId, {
        status: 'erro',
        progresso: 100,
        etapa: 'Erro',
        mensagem: error.message || 'Erro ao importar contrato',
        erro: error.message || 'Erro ao importar contrato',
        concluido: true,
      });
    }
  }

  private async importarContratoIndividual(
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato
  ): Promise<void> {
    this.logger.log(`[importarContratoIndividual] Iniciando: ${contratoApi.contratoNumero}`);
    
    // Limpar CNPJ (remover formatação)
    const cnpjLimpo = contratoApi.documento.replace(/\D/g, '');
    this.logger.log(`[importarContratoIndividual] CNPJ limpo: ${cnpjLimpo}`);
    
    // Buscar ou criar fornecedor usando métodos existentes
    let fornecedor;
    try {
      this.logger.log(`[importarContratoIndividual] Verificando fornecedor...`);
      const verificacao = await this.fornecedoresService.verificarCnpjExistente(cnpjLimpo);
      if (verificacao.existe && verificacao.fornecedor) {
        fornecedor = verificacao.fornecedor;
        this.logger.log(`[importarContratoIndividual] Fornecedor existente: ${fornecedor.id}`);
      }
    } catch (e) {
      this.logger.log(`[importarContratoIndividual] Fornecedor não encontrado, será criado`);
    }
    
    if (!fornecedor) {
      this.logger.log(`[importarContratoIndividual] Criando fornecedor: ${contratoApi.favorecido} - ${cnpjLimpo}`);
      // Usar cadastro rápido que já existe no sistema
      fornecedor = await this.fornecedoresService.cadastroRapidoOrgao(
        cnpjLimpo,
        contratoApi.favorecido
      );
      this.logger.log(`[importarContratoIndividual] Fornecedor criado: ${fornecedor.id}`);
    }

    // Converter vigência para data
    this.logger.log(`[importarContratoIndividual] Parsing data vigência: ${contratoApi.vigencia}`);
    const dataVigencia = this.parseDataBrasileira(contratoApi.vigencia);
    
    // Converter valor — priorizar valor_contrato (valor original), ignorar aditivos_valor_total
    // pois a API do portal pode ter aditivos vinculados ao contrato errado (ex: 015/2024 vs 015/2025)
    let valorGlobal = 0;
    if (contratoApi.valor_contrato) {
      const valorLimpo = contratoApi.valor_contrato
        .replace(/^R\$\s*/, '')
        .replace(/\./g, '')
        .replace(',', '.');
      valorGlobal = parseFloat(valorLimpo) || 0;
      this.logger.log(`[importarContratoIndividual] Valor contrato (original): ${valorGlobal}`);
    }
    if (valorGlobal === 0 && contratoApi.aditivos_valor_total) {
      valorGlobal = parseFloat(contratoApi.aditivos_valor_total) || 0;
      this.logger.log(`[importarContratoIndividual] Usando valor aditivos como fallback: ${valorGlobal}`);
    }

    // Extrair ano e sequencial do número do contrato (ex: 001/2024-Contrato -> ano=2024, sequencial=1)
    const anoMatch = contratoApi.contratoNumero.match(/\/(\d{4})/);
    const ano = anoMatch ? parseInt(anoMatch[1]) : new Date().getFullYear();
    const sequencialMatch = contratoApi.contratoNumero.match(/^(\d{3})/);
    const sequencial = sequencialMatch ? parseInt(sequencialMatch[1]) : 1;
    this.logger.log(`[importarContratoIndividual] Ano: ${ano}, Sequencial: ${sequencial}`);

    // Criar contrato usando o método existente
    this.logger.log(`[importarContratoIndividual] Verificando se contrato já existe...`);
    
    // Buscar se contrato já existe
    try {
      const contratoExistente = await this.contratosService.findByNumero(
        contratoApi.contratoNumero,
        orgaoId
      );
      
      if (contratoExistente) {
        this.logger.log(`[importarContratoIndividual] Contrato ${contratoApi.contratoNumero} já existe, pulando...`);
        return;
      }
    } catch (e) {
      this.logger.log(`[importarContratoIndividual] Contrato não existe, vai criar`);
    }

    // Criar DTO para o contrato
    this.logger.log(`[importarContratoIndividual] Criando DTO...`);
    const categoriaContrato = inferirCategoriaContrato({
      objeto: contratoApi.contratoObjeto,
      itens: [],
    });
    const modalidadeExecucao = inferirModalidadeExecucaoContrato({
      categoria: categoriaContrato,
    });
    const createDto = {
      orgao_id: orgaoId,
      numero_contrato: contratoApi.contratoNumero.replace('-Contrato', ''),
      ano,
      sequencial,
      objeto: contratoApi.contratoObjeto,
      valor_inicial: valorGlobal,
      valor_global: valorGlobal,
      data_assinatura: contratoApi.vigencia_inicio ? this.parseDataBrasileira(contratoApi.vigencia_inicio) : new Date(),
      data_vigencia_inicio: contratoApi.vigencia_inicio ? this.parseDataBrasileira(contratoApi.vigencia_inicio) : new Date(),
      data_vigencia_fim: dataVigencia,
      fornecedor_id: fornecedor.id,
      fornecedor_cnpj: cnpjLimpo,
      fornecedor_razao_social: contratoApi.favorecido,
      categoria: categoriaContrato,
      modalidade: 'CONTRATACAO_DIRETA',
      modalidade_execucao: modalidadeExecucao,
      situacao: 'VIGENTE',
      origem: 'IMPORTADO_PORTAL_TRANSPARENCIA',
    };

    this.logger.log(`[importarContratoIndividual] Chamando contratosService.criar...`);
    await this.contratosService.criar(createDto);
    this.logger.log(`[importarContratoIndividual] Contrato criado com sucesso!`);
  }

  /**
   * Baixa o PDF do contrato a partir da URL
   */
  async baixarPdfContrato(url: string): Promise<Buffer> {
    try {
      this.logger.log(`Baixando PDF: ${url}`);
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })
      );
      
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('pdf')) {
        return Buffer.from(response.data);
      }
      
      // Se não detectou pelo content-type, tenta verificar se é PDF pelo magic number
      const buffer = Buffer.from(response.data);
      if (buffer.toString('hex', 0, 4) === '25504446') { // %PDF
        return buffer;
      }
      
      throw new Error('Resposta não é um PDF válido');
    } catch (error) {
      this.logger.error(`Erro ao baixar PDF: ${error.message}`);
      throw new Error(`Falha ao baixar PDF do contrato: ${error.message}`);
    }
  }

  /**
   * Extrai itens do PDF usando IA
   */
  async extrairItensDoPdf(pdfBuffer: Buffer, contratoNumero?: string): Promise<Array<{
    descricao: string;
    unidade_medida: string;
    quantidade: number;
    valor_unitario: number;
    quantidade_meses?: number | null;
    valor_total?: number;
  }>> {
    try {
      this.logger.log('Extraindo texto do PDF...');
      const textoExtraido = await this.iaService.extrairTextoDoPdf(pdfBuffer);

      if (textoExtraido.trim().length >= 100) {
        this.logger.log(`Texto extraído: ${textoExtraido.length} caracteres`);
        const blocosTabela = extrairBlocosTabelaItens(textoExtraido);
        this.logger.log(`Blocos de itens detectados na tabela: ${blocosTabela.length}`);

        const itensViaParser = extrairItensTabelaTexto(textoExtraido);
        if (itensViaParser.length > 0) {
          this.logger.log(`Itens extraídos via parser textual: ${itensViaParser.length}`);
          if (blocosTabela.length > 0 && itensViaParser.length >= Math.max(10, blocosTabela.length - 3)) {
            return itensViaParser;
          }
          this.logger.warn(`Parser textual cobriu apenas ${itensViaParser.length}/${blocosTabela.length} blocos; tentando chunks via IA...`);
        }

        const itensViaChunks = await this.extrairItensViaTabelaChunked(textoExtraido, contratoNumero);
        if (itensViaChunks.length > 0) {
          return itensViaChunks;
        }

        const itensViaTexto = await this.extrairItensViaTexto(textoExtraido, contratoNumero);
        if (itensViaTexto.length > 0) {
          return itensViaTexto;
        }
        this.logger.warn('Extração via texto não encontrou itens válidos, tentando via IA Vision...');
      }

      this.logger.warn('Texto extraído muito curto ou sem itens válidos, tentando extrair via IA Vision...');
      return await this.extrairItensViaVision(pdfBuffer, contratoNumero, textoExtraido);
    } catch (error) {
      this.logger.error(`Erro ao extrair itens do PDF: ${error.message}`);
      return [];
    }
  }

  private async extrairItensViaTabelaChunked(textoExtraido: string, contratoNumero?: string): Promise<Array<any>> {
    try {
      const blocos = extrairBlocosTabelaItens(textoExtraido);
      if (!blocos.length) {
        this.logger.warn('Nenhum bloco de item foi detectado para chunking da tabela');
        return [];
      }

      const tamanhoChunk = 10;
      const itensMap = new Map<number, any>();

      for (let indice = 0; indice < blocos.length; indice += tamanhoChunk) {
        const chunk = blocos.slice(indice, indice + tamanhoChunk);
        const textoChunk = chunk
          .map((item) => normalizarBlocoItemTabela(item.bloco))
          .join('\n');

        const promptExtracaoChunk = `Você é um especialista em extrair itens de contratos públicos brasileiros.

CONTRATO: ${contratoNumero || 'não informado'}

Você receberá APENAS um trecho da tabela de itens do contrato, com itens numerados.

REGRAS:
- Extraia TODOS os itens presentes neste trecho
- Preserve o numero_item exatamente como aparece
- Cada linha numerada da tabela é um item separado
- NUNCA agrupe itens diferentes
- NUNCA invente dados
- Retorne SOMENTE JSON válido

Schema de retorno:
{
  "itens": [
    {
      "numero_item": 1,
      "descricao": "descrição completa do item",
      "unidade_medida": "M2",
      "quantidade": 6.00,
      "valor_unitario": 114.10,
      "valor_total": 684.60,
      "quantidade_meses": null
    }
  ]
}

TRECHO DA TABELA:
${textoChunk}`;

        const respostaIA = await this.iaService.chat([
          { role: 'user', content: promptExtracaoChunk },
        ]);

        const itensChunk = extrairItensNumeradosDaRespostaIA(respostaIA);
        this.logger.log(`Chunk ${Math.floor(indice / tamanhoChunk) + 1}: IA retornou ${itensChunk.length} itens para ${chunk.length} blocos`);

        for (const item of itensChunk) {
          if (!itensMap.has(item.numero_item)) {
            itensMap.set(item.numero_item, {
              descricao: item.descricao,
              unidade_medida: item.unidade_medida,
              quantidade: item.quantidade,
              valor_unitario: item.valor_unitario,
              quantidade_meses: item.quantidade_meses ?? null,
              valor_total: item.valor_total,
            });
          }
        }
      }

      // Retry: reenviar blocos cujo numero_item não foi extraído
      const blocosFaltantes = blocos.filter((b) => !itensMap.has(b.numero_item));
      if (blocosFaltantes.length > 0 && blocosFaltantes.length <= 15) {
        this.logger.log(`[retry] ${blocosFaltantes.length} itens faltantes (${blocosFaltantes.map(b => b.numero_item).join(', ')}), reenviando...`);
        const textoRetry = blocosFaltantes
          .map((item) => normalizarBlocoItemTabela(item.bloco))
          .join('\n');

        const promptRetry = `Você é um especialista em extrair itens de contratos públicos brasileiros.

CONTRATO: ${contratoNumero || 'não informado'}

ATENÇÃO: Estes itens não foram extraídos na primeira tentativa. Extraia CADA UM obrigatoriamente.

REGRAS:
- Extraia TODOS os ${blocosFaltantes.length} itens abaixo — é obrigatório retornar exatamente ${blocosFaltantes.length} itens
- Preserve o numero_item exatamente como aparece
- NUNCA invente dados
- Retorne SOMENTE JSON válido

Schema: { "itens": [{ "numero_item": 1, "descricao": "...", "unidade_medida": "UN", "quantidade": 1, "valor_unitario": 0, "valor_total": 0, "quantidade_meses": null }] }

TRECHO DA TABELA:
${textoRetry}`;

        try {
          const respostaRetry = await this.iaService.chat([{ role: 'user', content: promptRetry }]);
          const itensRetry = extrairItensNumeradosDaRespostaIA(respostaRetry);
          this.logger.log(`[retry] IA retornou ${itensRetry.length} de ${blocosFaltantes.length} itens faltantes`);

          for (const item of itensRetry) {
            if (!itensMap.has(item.numero_item)) {
              itensMap.set(item.numero_item, {
                descricao: item.descricao,
                unidade_medida: item.unidade_medida,
                quantidade: item.quantidade,
                valor_unitario: item.valor_unitario,
                quantidade_meses: item.quantidade_meses ?? null,
                valor_total: item.valor_total,
              });
            }
          }
        } catch (retryErr: any) {
          this.logger.warn(`[retry] Falhou: ${retryErr.message}`);
        }
      }

      const itens = Array.from(itensMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([numItem, item]) => ({ ...item, numero_item: numItem }));

      const faltantesFinais = blocos
        .filter((b) => !itensMap.has(b.numero_item))
        .map((b) => b.numero_item);

      if (itens.length > 0) {
        this.logger.log(`Itens extraídos via tabela chunked: ${itens.length} de ${blocos.length} blocos`);
        if (faltantesFinais.length > 0) {
          this.logger.warn(`Itens NÃO extraídos (${faltantesFinais.length}): ${faltantesFinais.join(', ')}`);
        }
      }

      // Anexar metadata ao array para o caller
      (itens as any)._meta = {
        total_blocos: blocos.length,
        faltantes: faltantesFinais,
      };

      return itens;
    } catch (error) {
      this.logger.error(`Erro na extração via tabela chunked: ${error.message}`);
      return [];
    }
  }

  private async salvarItensContrato(contratoId: string, itens: Array<{
    descricao: string;
    unidade_medida: string;
    quantidade: number;
    valor_unitario: number;
    quantidade_meses?: number | null;
    valor_total?: number;
  }>): Promise<number> {
    if (!itens.length) return 0;

    await this.itemContratoRepository.delete({ contrato_id: contratoId });

    const registros = itens.map((item, index) => {
      const itemAjustado = ajustarItemParaPersistencia(item);
      const quantidade = Number(itemAjustado.quantidade) || 1;
      const valorUnitario = Number(itemAjustado.valor_unitario) || 0;
      const valorTotal = Number(itemAjustado.valor_total) || Number((quantidade * valorUnitario).toFixed(2));
      const numeroItemOriginal = (item as any).numero_item;

      return this.itemContratoRepository.create({
        contrato_id: contratoId,
        numero_item: numeroItemOriginal > 0 ? numeroItemOriginal : index + 1,
        descricao: itemAjustado.descricao,
        descricao_detalhada: itemAjustado.descricao,
        tipo_item: TipoItemContrato.CONSUMO,
        unidade_medida: mapearUnidadeMedidaContrato(itemAjustado.unidade_medida),
        valor_unitario: valorUnitario,
        valor_total: valorTotal,
        quantidade_contratada: quantidade,
        quantidade_empenhada: 0,
        quantidade_entregue: 0,
        saldo_disponivel: quantidade,
        observacoes: 'Item importado automaticamente do Portal da Transparência',
      });
    });

    await this.itemContratoRepository.save(registros);
    return registros.length;
  }

  /**
   * Extrai itens usando IA com Vision (para PDFs escaneados).
   * Usa conversão PDF→imagens (pdftoppm) + Vision por página quando disponível.
   */
  private async extrairItensViaVision(pdfBuffer: Buffer, contratoNumero?: string, textoFallback?: string): Promise<Array<any>> {
    try {
      const promptExtracaoItens = `Você é um especialista em extrair itens de contratos públicos brasileiros.
Analise este PDF de contrato e extraia a tabela de itens/serviços do contrato ${contratoNumero || ''}.

REGRAS:
- Extraia APENAS a lista de itens/serviços do contrato
- NUNCA invente dados - use apenas o que está no documento
- Cada item deve ter: descrição completa, unidade de medida, quantidade, valor unitário, valor total
- Para contratos de serviços, a unidade pode ser: UNIDADE, MESES, CONTRATO GLOBAL, etc.
- Se houver resposta fora de JSON, converta mentalmente e retorne SOMENTE JSON válido
- Retorne APENAS JSON válido, sem texto adicional

Schema de retorno:
{
  "itens": [
    {
      "descricao": "descrição completa do item/serviço",
      "unidade_medida": "UNIDADE", 
      "quantidade": 1,
      "valor_unitario": 85000.00,
      "valor_total": 85000.00,
      "quantidade_meses": null
    }
  ],
  "observacoes": "descrição breve do que foi encontrado"
}

Se não encontrar itens, retorne: {"itens": [], "observacoes": "Nenhum item encontrado"}`;

      const respostaIA = await this.iaService.chatComPdfEscaneado(
        promptExtracaoItens,
        pdfBuffer,
      );

      const itens = extrairItensDaRespostaIA(respostaIA);
      if (itens.length === 0) {
        this.logger.warn('IA não retornou lista de itens válida');
        if (textoFallback?.trim()) {
          this.logger.warn('Tentando fallback final via texto após falha no Vision...');
          return await this.extrairItensViaTexto(textoFallback, contratoNumero);
        }
        return [];
      }

      this.logger.log(`Itens extraídos via Vision: ${itens.length}`);
      return itens;
    } catch (error) {
      this.logger.error(`Erro na extração via Vision: ${error.message}`);
      if (textoFallback?.trim()) {
        this.logger.warn('Vision falhou, tentando fallback final via texto...');
        return await this.extrairItensViaTexto(textoFallback, contratoNumero);
      }
      return [];
    }
  }

  /**
   * Extrai itens via texto extraído (para PDFs digitais).
   * Quando o texto é muito longo, divide em partes e faz múltiplas chamadas à IA.
   */
  private async extrairItensViaTexto(textoExtraido: string, contratoNumero?: string): Promise<Array<any>> {
    try {
      const trechoTabela = extrairTrechoBrutoTabelaItens(textoExtraido);
      const textoParaIA = trechoTabela || textoExtraido;

      const promptBase = `Você é um especialista em extrair itens de contratos públicos brasileiros.

CONTRATO: ${contratoNumero || 'não informado'}

REGRAS:
- Extraia TODOS os itens do contrato — não pare antes de listar todos
- NUNCA invente dados - use apenas o que está no documento
- Cada item deve ter: descrição, unidade de medida (abreviada: UN, PCT, CX, KG, LT, RL, FR, GL), quantidade, valor unitário
- Para unidade de medida, use abreviações curtas (máximo 10 caracteres)
- Para contratos contínuos (mensais), use quantidade_meses
- Se houver tabela, preserve cada linha como um item separado
- Retorne APENAS JSON válido, sem texto adicional

Schema de retorno:
{
  "itens": [
    {
      "descricao": "descrição completa do item",
      "unidade_medida": "UN", 
      "quantidade": 10,
      "valor_unitario": 100.00,
      "quantidade_meses": null,
      "valor_total": 1000.00
    }
  ],
  "observacoes": "descrição breve do que foi encontrado"
}

Se não encontrar itens, retorne: {"itens": [], "observacoes": "Nenhum item encontrado"}`;

      // Se texto curto (< 15k chars), envia tudo de uma vez com max_tokens maior
      if (textoParaIA.length < 15000) {
        const respostaIA = await this.iaService.chatComArquivoComMaxTokens(
          promptBase, undefined, undefined, textoParaIA, 8000,
        );
        const itens = extrairItensDaRespostaIA(respostaIA);
        this.logger.log(`Itens extraídos via texto: ${itens.length}`);
        return itens;
      }

      // Texto longo — dividir em partes com overlap para não perder itens na fronteira
      const chunkSize = 10000;
      const overlap = 2000;
      const step = chunkSize - overlap;
      this.logger.log(`[extrairItensViaTexto] Texto longo (${textoParaIA.length} chars), dividindo em chunks de ${chunkSize} com overlap ${overlap}`);
      const chunks: string[] = [];
      for (let i = 0; i < textoParaIA.length; i += step) {
        chunks.push(textoParaIA.slice(i, i + chunkSize));
        if (i + chunkSize >= textoParaIA.length) break;
      }

      const todosItens: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkPrompt = chunks.length > 1
          ? `${promptBase}\n\n[Parte ${i + 1} de ${chunks.length} do texto do contrato. Extraia TODOS os itens desta parte.]`
          : promptBase;

        this.logger.log(`[extrairItensViaTexto] Enviando chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
        const respostaIA = await this.iaService.chatComArquivoComMaxTokens(
          chunkPrompt, undefined, undefined, chunks[i], 8000,
        );
        const itens = extrairItensDaRespostaIA(respostaIA);
        this.logger.log(`[extrairItensViaTexto] Chunk ${i + 1}: ${itens.length} itens`);
        todosItens.push(...itens);
      }

      // Deduplicar por descrição + valor
      const vistos = new Set<string>();
      const itensDedupados = todosItens.filter((item) => {
        const chave = `${item.descricao}|${item.valor_unitario}|${item.quantidade}`;
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });

      this.logger.log(`Itens extraídos via texto: ${itensDedupados.length} (de ${todosItens.length} brutos, ${chunks.length} chunks)`);
      return itensDedupados;
    } catch (error) {
      this.logger.error(`Erro na extração via texto: ${error.message}`);
      return [];
    }
  }

  /**
   * Importa contrato com itens (fluxo completo do agente autônomo)
   */
  async importarContratoCompleto(
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato,
    onProgress?: (status: Partial<ImportacaoContratoJobStatus>) => void,
  ): Promise<{
    contrato_id?: string;
    itens_criados: number;
    itens_total_pdf?: number;
    itens_faltantes?: number[];
    pdf_baixado: boolean;
    itens_extraidos: boolean;
    mensagem: string;
    valor_contrato_referencia?: number;
    valor_itens_importados?: number;
    divergencia_valor?: number;
    percentual_divergencia?: number;
    aviso_conferencia?: string;
  }> {
    const resultado = {
      contrato_id: undefined as string | undefined,
      itens_criados: 0,
      itens_total_pdf: undefined as number | undefined,
      itens_faltantes: undefined as number[] | undefined,
      pdf_baixado: false,
      itens_extraidos: false,
      mensagem: '',
      valor_contrato_referencia: undefined as number | undefined,
      valor_itens_importados: undefined as number | undefined,
      divergencia_valor: undefined as number | undefined,
      percentual_divergencia: undefined as number | undefined,
      aviso_conferencia: undefined as string | undefined,
    };

    try {
      onProgress?.({
        progresso: 10,
        etapa: 'Verificando contrato existente',
        mensagem: 'Validando se o contrato já está cadastrado',
      });

      // 1. Verificar se contrato já existe
      try {
        const contratoExistente = await this.contratosService.findByNumero(
          contratoApi.contratoNumero,
          orgaoId
        );
        
        if (contratoExistente) {
          resultado.contrato_id = contratoExistente.id;
          resultado.mensagem = `Contrato ${contratoApi.contratoNumero} já existe`;
          return resultado;
        }
      } catch {
        // Contrato não existe, continuar
      }

      // 2. Importar contrato base (fornecedor + contrato)
      onProgress?.({
        progresso: 25,
        etapa: 'Cadastrando contrato',
        mensagem: 'Criando fornecedor e contrato base no sistema',
      });
      await this.importarContratoIndividual(orgaoId, contratoApi);
      
      // Buscar contrato criado
      onProgress?.({
        progresso: 40,
        etapa: 'Buscando contrato criado',
        mensagem: 'Obtendo o contrato criado para vincular documentos e itens',
      });
      const contratoCriado = await this.contratosService.findByNumero(
        contratoApi.contratoNumero.replace('-Contrato', ''),
        orgaoId
      );
      
      if (!contratoCriado) {
        throw new Error('Contrato não foi criado');
      }
      
      resultado.contrato_id = contratoCriado.id;
      resultado.mensagem = `Contrato ${contratoApi.contratoNumero} importado com sucesso`;

      // 3. Baixar PDF se tiver URL
      if (contratoApi.url) {
        try {
          onProgress?.({
            progresso: 55,
            etapa: 'Baixando PDF',
            mensagem: 'Baixando PDF do contrato no Portal da Transparência',
          });
          const pdfBuffer = await this.baixarPdfContrato(contratoApi.url);
          resultado.pdf_baixado = true;
          this.logger.log(`PDF baixado: ${pdfBuffer.length} bytes`);

          // 3.1 Salvar PDF em documentos do contrato
          try {
            onProgress?.({
              progresso: 65,
              etapa: 'Salvando PDF',
              mensagem: 'Salvando PDF nos documentos do contrato',
            });
            await this.salvarPdfDocumento(contratoCriado.id, pdfBuffer, contratoApi.contratoNumero);
            this.logger.log(`PDF salvo em documentos do contrato ${contratoApi.contratoNumero}`);
          } catch (docError) {
            this.logger.warn(`Erro ao salvar PDF em documentos: ${docError.message}`);
          }

          // 4. Extrair itens do PDF
          onProgress?.({
            progresso: 75,
            etapa: 'IA analisando PDF',
            mensagem: 'Agente de IA está lendo o PDF e extraindo os itens do contrato',
          });
          const itens = await this.extrairItensDoPdf(pdfBuffer, contratoApi.contratoNumero);
          const metaItens = (itens as any)?._meta as { total_blocos?: number; faltantes?: number[] } | undefined;
          if (metaItens?.total_blocos) {
            resultado.itens_total_pdf = metaItens.total_blocos;
            resultado.itens_faltantes = metaItens.faltantes;
          }

          const contratoCompleto = await this.contratoRepository.findOne({ where: { id: contratoCriado.id } });
          if (!contratoCompleto) {
            throw new Error('Contrato criado não encontrado para salvar itens');
          }

          const categoriaInferida = inferirCategoriaContrato({
            objeto: contratoCompleto.objeto,
            itens,
          });
          const modalidadeInferida = inferirModalidadeExecucaoContrato({
            categoria: categoriaInferida,
          });
          const modalidadeAlterada = contratoCompleto.modalidade_execucao !== modalidadeInferida;
          const categoriaAlterada = contratoCompleto.categoria !== categoriaInferida;

          if (modalidadeAlterada) {
            contratoCompleto.modalidade_execucao = modalidadeInferida;
          }

          if (categoriaAlterada) {
            contratoCompleto.categoria = categoriaInferida;
          }

          if (modalidadeAlterada || categoriaAlterada) {
            await this.contratoRepository.save(contratoCompleto);
            this.logger.log(`Classificação inferida/atualizada para contrato ${contratoCompleto.numero_contrato}: categoria=${categoriaInferida}, modalidade=${modalidadeInferida}`);
          }

          let valorContratoReferencia = Number(contratoCompleto.valor_global) || Number(contratoCompleto.valor_inicial) || 0;

          if (itens.length > 0) {
            const valorItensImportados = Number(itens
              .reduce((total, item) => {
                const itemAjustado = ajustarItemParaPersistencia(item);
                const quantidade = Number(itemAjustado.quantidade) || 0;
                const valorUnitario = Number(itemAjustado.valor_unitario) || 0;
                const valorTotal = Number(itemAjustado.valor_total) || Number((quantidade * valorUnitario).toFixed(2));
                return total + valorTotal;
              }, 0)
              .toFixed(2));
            resultado.valor_itens_importados = valorItensImportados;

            // Se a soma dos itens do PDF diverge muito do valor da API,
            // provavelmente a API tem dados incorretos (aditivo vinculado ao contrato errado, etc.)
            // Neste caso, atualizar o valor do contrato para refletir o PDF
            if (valorItensImportados > 0 && valorContratoReferencia > 0) {
              const divergencia = Math.abs(valorItensImportados - valorContratoReferencia);
              const percentualDiv = (divergencia / valorContratoReferencia) * 100;

              if (percentualDiv > 20 && valorItensImportados > valorContratoReferencia) {
                this.logger.warn(
                  `[importarContratoCompleto] ⚠️ DIVERGÊNCIA API vs PDF detectada! ` +
                  `Valor API: R$ ${valorContratoReferencia.toFixed(2)}, ` +
                  `Soma itens PDF: R$ ${valorItensImportados.toFixed(2)} (${percentualDiv.toFixed(1)}% maior). ` +
                  `Atualizando valor do contrato para refletir o PDF.`,
                );

                contratoCompleto.valor_global = valorItensImportados;
                contratoCompleto.valor_inicial = valorItensImportados;
                await this.contratoRepository.save(contratoCompleto);
                valorContratoReferencia = valorItensImportados;

                resultado.aviso_conferencia =
                  `O valor do Portal de Transparência (R$ ${(Number(contratoCompleto.valor_global) || 0).toFixed(2)}) ` +
                  `estava incorreto (possível aditivo vinculado ao contrato errado). ` +
                  `O valor foi corrigido para R$ ${valorItensImportados.toFixed(2)} conforme o PDF do contrato.`;
              }
            }

            resultado.valor_contrato_referencia = valorContratoReferencia;

            const divergenciaValor = Number((valorItensImportados - valorContratoReferencia).toFixed(2));
            resultado.divergencia_valor = divergenciaValor;
            resultado.percentual_divergencia = valorContratoReferencia > 0
              ? Number(((Math.abs(divergenciaValor) / valorContratoReferencia) * 100).toFixed(2))
              : undefined;

            if (Math.abs(divergenciaValor) > 0.01 && !resultado.aviso_conferencia) {
              resultado.aviso_conferencia = `A soma dos itens importados (${valorItensImportados.toFixed(2)}) difere do valor do contrato (${valorContratoReferencia.toFixed(2)}) em ${Math.abs(divergenciaValor).toFixed(2)}.`;
            }

            // 5. Criar itens conforme a modalidade do contrato
            onProgress?.({
              progresso: 85,
              etapa: 'Cadastrando itens',
              mensagem: `Cadastrando ${itens.length} itens extraídos no contrato`,
            });

            if (contratoCompleto.modalidade_execucao === ModalidadeExecucao.ITEM_QUANTIDADE) {
              resultado.itens_criados = await this.salvarItensContrato(contratoCriado.id, itens);
              onProgress?.({
                progresso: 98,
                etapa: 'Cadastrando itens',
                mensagem: `${resultado.itens_criados} itens salvos no contrato`,
                contrato_id: contratoCriado.id,
                itens_criados: resultado.itens_criados,
                valor_contrato_referencia: resultado.valor_contrato_referencia,
                valor_itens_importados: resultado.valor_itens_importados,
                divergencia_valor: resultado.divergencia_valor,
                percentual_divergencia: resultado.percentual_divergencia,
                aviso_conferencia: resultado.aviso_conferencia,
              });
            } else if (contratoCompleto.modalidade_execucao === ModalidadeExecucao.MEDICAO) {
              const etapasExistentes = await this.medicaoService.listarEtapas(contratoCriado.id);
              if (etapasExistentes.length > 0) {
                resultado.mensagem += ' (contrato com etapas existentes; revise o cronograma manualmente)';
                this.logger.warn(`Contrato ${contratoCompleto.numero_contrato} está na modalidade ${contratoCompleto.modalidade_execucao} e já possui ${etapasExistentes.length} etapas. Importação automática de itens de cronograma ignorada.`);
              } else {
              for (let i = 0; i < itens.length; i++) {
                const item = ajustarItemParaPersistencia(itens[i]);
                try {
                  await this.medicaoService.criarItemCronograma(contratoCriado.id, {
                    numero_item: (itens[i] as any).numero_item || i + 1,
                    descricao: item.descricao,
                    unidade_medida: item.unidade_medida,
                    quantidade: item.quantidade,
                    valor_unitario: item.valor_unitario,
                    quantidade_meses: item.quantidade_meses || null,
                  } as any);
                  resultado.itens_criados++;
                  onProgress?.({
                    progresso: Math.min(98, 85 + Math.round(((i + 1) / itens.length) * 13)),
                    etapa: 'Cadastrando itens',
                    mensagem: `Cadastrando item ${i + 1} de ${itens.length}`,
                    contrato_id: contratoCriado.id,
                    itens_criados: resultado.itens_criados,
                    valor_contrato_referencia: resultado.valor_contrato_referencia,
                    valor_itens_importados: resultado.valor_itens_importados,
                    divergencia_valor: resultado.divergencia_valor,
                    percentual_divergencia: resultado.percentual_divergencia,
                    aviso_conferencia: resultado.aviso_conferencia,
                  });
                } catch (err) {
                  this.logger.warn(`Erro ao criar item "${item.descricao}": ${err.message}`);
                }
              }
              }
            } else {
              resultado.mensagem += ` (modalidade inválida para importação automática: ${contratoCompleto.modalidade_execucao})`;
              this.logger.warn(`Contrato ${contratoCompleto.numero_contrato} está com modalidade fora do padrão esperado (${contratoCompleto.modalidade_execucao}).`);
            }
          } else {
            resultado.mensagem += ' (sem itens no PDF)';
          }
        } catch (pdfError) {
          this.logger.warn(`Erro no processamento do PDF: ${pdfError.message}`);
          resultado.mensagem += ' (erro ao processar PDF)';
        }
      } else {
        resultado.mensagem += ' (sem URL de PDF)';
      }

      // Aviso sobre itens faltantes
      if (resultado.itens_faltantes && resultado.itens_faltantes.length > 0) {
        const avisoFaltantes = `${resultado.itens_faltantes.length} item(ns) não foram extraídos automaticamente (nº ${resultado.itens_faltantes.join(', ')}). Adicione-os manualmente na aba Itens.`;
        resultado.aviso_conferencia = resultado.aviso_conferencia
          ? `${resultado.aviso_conferencia} | ${avisoFaltantes}`
          : avisoFaltantes;
      }

      onProgress?.({
        progresso: 99,
        etapa: 'Finalizando',
        mensagem: 'Finalizando importação e preparando redirecionamento',
        contrato_id: resultado.contrato_id,
        itens_criados: resultado.itens_criados,
        itens_total_pdf: resultado.itens_total_pdf,
        itens_faltantes: resultado.itens_faltantes,
        aviso_conferencia: resultado.aviso_conferencia,
      });

      return resultado;
    } catch (error) {
      this.logger.error(`Erro na importação completa: ${error.message}`);
      resultado.mensagem = `Erro: ${error.message}`;
      throw error;
    }
  }

  /**
   * Salva o PDF baixado em documentos do contrato (arquivo físico + registro no banco)
   */
  private async salvarPdfDocumento(
    contratoId: string,
    pdfBuffer: Buffer,
    contratoNumero: string
  ): Promise<DocumentoContrato> {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Criar diretório de upload para o contrato
      const uploadPath = path.join(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), 'contratos', contratoId);
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      // Gerar nome único para o arquivo
      const timestamp = Date.now();
      const nomeArquivo = `extrato_portal_${timestamp}.pdf`;
      const caminhoCompleto = path.join(uploadPath, nomeArquivo);

      // Salvar arquivo físico
      fs.writeFileSync(caminhoCompleto, pdfBuffer);
      this.logger.log(`PDF salvo em: ${caminhoCompleto}`);

      // Criar registro no banco de dados
      const documento = this.documentoContratoRepository.create({
        contrato_id: contratoId,
        tipo: TipoDocumentoContrato.ANEXO,
        titulo: `Extrato do Portal da Transparência - ${contratoNumero}`,
        descricao: 'Documento importado automaticamente do Portal da Transparência',
        nome_arquivo: nomeArquivo,
        nome_original: `${contratoNumero}.pdf`,
        caminho_arquivo: caminhoCompleto,
        mime_type: 'application/pdf',
        tamanho_bytes: pdfBuffer.length,
      });

      const docSalvo = await this.documentoContratoRepository.save(documento);
      this.logger.log(`Registro do documento criado no banco: ${docSalvo.id}`);

      return docSalvo;
    } catch (error) {
      this.logger.error(`Erro ao salvar PDF em documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Converte data no formato brasileiro (DD/MM/YYYY) para Date
   */
  private parseDataBrasileira(dataStr: string): Date {
    if (!dataStr) return new Date();
    
    const partes = dataStr.split('/');
    if (partes.length === 3) {
      const dia = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1; // Mês em JS é 0-11
      const ano = parseInt(partes[2], 10);
      return new Date(ano, mes, dia);
    }
    
    return new Date();
  }
}
