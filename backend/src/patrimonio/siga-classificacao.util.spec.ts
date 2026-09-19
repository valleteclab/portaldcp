import { normalizarDescricao, sugerirTipoSiga } from './siga-classificacao.util';

describe('siga-classificacao.util', () => {
  it('normaliza acentos, maiúsculas e hífens', () => {
    expect(normalizarDescricao('AR-CONDICIONADO Split 12.000 BTUs')).toBe('ar condicionado split 12 000 btus');
    expect(normalizarDescricao('Armário de AÇO')).toBe('armario de aco');
  });

  it.each([
    ['CADEIRA GIRATÓRIA COM BRAÇOS, ESTOFADA', 1],
    ['Mesa em L para escritório 1,40 x 1,40', 1],
    ['Armário de aço 2 portas', 1],
    ['ARQUIVO DE AÇO 4 GAVETAS', 1],
    ['Sofá 3 lugares em couro sintético', 1],
    ['Balcão de atendimento em MDF', 1],
    ['Estante de aço com 6 prateleiras', 1],
    ['Quadro branco 2,00 x 1,20', 1],
    ['Grupo gerador a diesel 150 kVA', 2],
    ['Motor elétrico trifásico 5 cv', 2],
    ['Bomba d’água submersa', 2],
    ['Compressor de ar 50 litros', 2],
    ['Computador Desktop Intel Core i5 8GB', 3],
    ['NOTEBOOK DELL LATITUDE', 3],
    ['Impressora multifuncional laser', 3],
    ['Monitor LED 21,5"', 3],
    ['Estabilizador 1000VA', 3],
    ['Nobreak 1,2 kVA', 3],
    ['No-break SMS 600VA', 3],
    ['Ar-condicionado Split 18.000 BTUs', 3],
    ['Aparelho de ar condicionado de janela', 3],
    ['Telefone sem fio Intelbras', 3],
    ['Câmera fotográfica digital Canon', 3],
    ['Projetor multimídia Epson', 3],
    ['Microfone de mesa gooseneck', 3],
    ['Caixa de som amplificada 400W', 3],
    ['Mesa de som 16 canais', 3],
    ['Jogo de ferramentas com maleta', 3],
    ['Mesa para computador com suporte de teclado', 1],
    ['Livro: Constituição Federal comentada', 5],
    ['Coleção de leis municipais encadernadas', 5],
    ['Terreno urbano na Rua das Flores', 6],
    ['Prédio sede da Câmara Municipal', 6],
    ['Sala comercial nº 12', 6],
    ['Edifício anexo', 6],
    ['Quadro a óleo retratando o fundador da cidade', 7],
    ['Obra de arte em madeira', 7],
    ['Escultura em bronze', 7],
    ['Bandeira do Município', 7],
    ['Brasão da Câmara em metal', 7],
    ['Veículo Fiat Strada 2020', 9],
    ['Carro de passeio Chevrolet Onix', 9],
    ['Motocicleta Honda CG 160', 9],
    ['Moto Honda Bros', 9],
    ['Caminhonete Toyota Hilux 4x4', 9],
    ['Ônibus escolar', 9],
  ])('"%s" → %i', (descricao, tipo) => {
    expect(sugerirTipoSiga(descricao)).toBe(tipo);
  });

  it('respeita limite de palavra (motor não é moto; carrinho não é carro)', () => {
    expect(sugerirTipoSiga('Motor de portão')).toBe(2);
    expect(sugerirTipoSiga('Carrinho de limpeza')).toBeNull();
    expect(sugerirTipoSiga('Salamandra decorativa')).toBeNull();
  });

  it('descrição sem termo conhecido ou vazia → null', () => {
    expect(sugerirTipoSiga('Item diverso sem identificação')).toBeNull();
    expect(sugerirTipoSiga('')).toBeNull();
    expect(sugerirTipoSiga(null)).toBeNull();
  });

  it('casos do legado da Câmara de LEM', () => {
    expect(sugerirTipoSiga('SUPORTE PARA LIVRO EM MDF')).toBe(1);
    expect(sugerirTipoSiga('SUPORTE P/ CPU EM ARAMADO 48X24X50 PRETO')).toBe(1);
    expect(sugerirTipoSiga('PLACA DE IDENTIFICACAO DO PREDIO EM ACO INOX')).toBe(7);
    expect(sugerirTipoSiga('PLACA DE VIDEO GEFORCE')).toBe(3);
    expect(sugerirTipoSiga('PERSIANA VERTICAL EM PVC')).toBe(1);
    expect(sugerirTipoSiga('PERCIANA ROLO BLACKOUT')).toBe(1);
    expect(sugerirTipoSiga('AUTO FALANTE 6 POLEGADAS')).toBe(3);
    expect(sugerirTipoSiga('EXTINTOR PQS 4KG')).toBe(3);
    expect(sugerirTipoSiga('MIKROTIK CLOUD CORE ROUTER')).toBe(3);
    expect(sugerirTipoSiga('MAQUINA DE XEROX 3550 XD')).toBe(3);
    expect(sugerirTipoSiga('TRANSFORMADOR 5.000 VA')).toBe(2);
    expect(sugerirTipoSiga('LIXEIRA INOX 30L')).toBe(1);
  });
});
