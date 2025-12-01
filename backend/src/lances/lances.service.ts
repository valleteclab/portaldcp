import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lance } from './entities/lance.entity';
import { MensagemChat } from './entities/mensagem-chat.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { SessaoDisputa, StatusSessao, EtapaSessao } from '../sessao/entities/sessao-disputa.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';

/**
 * Estado da sessão em tempo real (gerenciado em memória para performance)
 * Em produção, usar Redis para persistência e escalabilidade
 */
interface SessaoEmMemoria {
  licitacaoId: string;
  sessaoId: string;
  status: StatusSessao;
  etapa: EtapaSessao;
  itemAtualId: string | null;
  tempoRestante: number; // segundos
  emTempoAleatorio: boolean;
  tempoAleatorioSorteado: number | null;
  ultimoLanceEm: Date | null;
  participantesOnline: Map<string, { id: string; nome: string; tipo: 'PREGOEIRO' | 'FORNECEDOR'; socketId: string }>;
}

// Estrutura para lances de demonstração em memória
interface LanceDemo {
  id: string;
  fornecedorId: string;
  fornecedorNome: string;
  valor: number;
  horario: Date;
}

// Estrutura para mensagens de demonstração em memória
interface MensagemDemo {
  id: string;
  remetente: string;
  mensagem: string;
  horario: Date;
  tipo: 'PREGOEIRO' | 'FORNECEDOR' | 'SISTEMA';
}

@Injectable()
export class LancesService {
  // Estado das sessões ativas em memória (em produção usar Redis)
  private sessoesAtivas: Map<string, SessaoEmMemoria> = new Map();
  
  // Lances de demonstração em memória (por licitacaoId)
  private lancesDemo: Map<string, LanceDemo[]> = new Map();
  
  // Mensagens de demonstração em memória (por licitacaoId)
  private mensagensDemo: Map<string, MensagemDemo[]> = new Map();
  
  // Callbacks para notificar o gateway sobre mudanças
  private onSessaoUpdate: ((licitacaoId: string, estado: any) => void) | null = null;

  constructor(
    @InjectRepository(Lance)
    private readonly lanceRepository: Repository<Lance>,
    @InjectRepository(MensagemChat)
    private readonly mensagemRepository: Repository<MensagemChat>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepository: Repository<SessaoDisputa>,
    @InjectRepository(ItemLicitacao)
    private readonly itemRepository: Repository<ItemLicitacao>,
  ) {}

  setUpdateCallback(callback: (licitacaoId: string, estado: any) => void) {
    this.onSessaoUpdate = callback;
  }

  // ==================== GERENCIAMENTO DE SESSÃO ====================

  /**
   * Verifica se uma string é um UUID válido
   */
  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Inicializa ou recupera uma sessão de disputa
   */
  async inicializarSessao(licitacaoId: string): Promise<SessaoEmMemoria> {
    // Verifica se já existe em memória
    if (this.sessoesAtivas.has(licitacaoId)) {
      return this.sessoesAtivas.get(licitacaoId)!;
    }

    // Se não for UUID válido, cria sessão de demonstração em memória
    if (!this.isValidUUID(licitacaoId)) {
      console.log(`Criando sessão de demonstração para ID: ${licitacaoId}`);
      const estadoDemo: SessaoEmMemoria = {
        licitacaoId,
        sessaoId: `demo-${licitacaoId}`,
        status: StatusSessao.EM_ANDAMENTO,
        etapa: EtapaSessao.DISPUTA_LANCES,
        itemAtualId: 'item-demo-1',
        tempoRestante: 180, // 3 minutos
        emTempoAleatorio: false,
        tempoAleatorioSorteado: null,
        ultimoLanceEm: null,
        participantesOnline: new Map(),
      };
      this.sessoesAtivas.set(licitacaoId, estadoDemo);
      return estadoDemo;
    }

    // Busca ou cria sessão no banco
    let sessao = await this.sessaoRepository.findOne({
      where: { licitacao_id: licitacaoId },
      relations: ['licitacao', 'item_atual'],
    });

    if (!sessao) {
      // Cria nova sessão
      const licitacao = await this.licitacaoRepository.findOne({
        where: { id: licitacaoId },
        relations: ['itens'],
      });

      if (!licitacao) {
        throw new BadRequestException('Licitação não encontrada');
      }

      const primeiroItem = licitacao.itens?.[0];

      sessao = this.sessaoRepository.create({
        licitacao_id: licitacaoId,
        status: StatusSessao.EM_ANDAMENTO,
        etapa: EtapaSessao.DISPUTA_LANCES,
        item_atual_id: primeiroItem?.id || undefined,
        tempo_inatividade_minutos: 3, // 3 minutos padrão
        data_hora_inicio_real: new Date(),
      });

      await this.sessaoRepository.save(sessao);
    }

    // Cria estado em memória
    const estadoMemoria: SessaoEmMemoria = {
      licitacaoId,
      sessaoId: sessao.id,
      status: sessao.status,
      etapa: sessao.etapa,
      itemAtualId: sessao.item_atual_id,
      tempoRestante: sessao.tempo_inatividade_minutos * 60, // converte para segundos
      emTempoAleatorio: sessao.status === StatusSessao.RANDOM_ENCERRANDO,
      tempoAleatorioSorteado: sessao.tempo_aleatorio_sorteado,
      ultimoLanceEm: sessao.ultimo_lance_em,
      participantesOnline: new Map(),
    };

    this.sessoesAtivas.set(licitacaoId, estadoMemoria);
    return estadoMemoria;
  }

  /**
   * Obtém estado completo da sessão para enviar ao cliente
   */
  async getEstadoSessao(licitacaoId: string) {
    const sessaoMem = await this.inicializarSessao(licitacaoId);
    
    // Se for sessão de demonstração, retorna dados mockados
    if (!this.isValidUUID(licitacaoId)) {
      return this.getEstadoSessaoDemo(licitacaoId, sessaoMem);
    }
    
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['itens', 'orgao'],
    });

    const lances = await this.getLancesAtivos(licitacaoId);
    const mensagens = await this.getMensagens(licitacaoId);
    
    // Busca item atual
    let itemAtual = null;
    if (sessaoMem.itemAtualId) {
      itemAtual = await this.itemRepository.findOneBy({ id: sessaoMem.itemAtualId });
    }

    // Formata lances com posição
    const lancesFormatados = lances.map((lance, index) => ({
      id: lance.id,
      fornecedorId: lance.fornecedor_identificador,
      fornecedorNomeExibicao: this.mascararFornecedor(lance.fornecedor_identificador),
      valor: Number(lance.valor),
      valorTotal: Number(lance.valor) * (itemAtual?.quantidade || 1),
      horario: new Date(lance.created_at).toLocaleTimeString('pt-BR'),
      posicao: index + 1,
    }));

    // Formata mensagens
    const mensagensFormatadas = mensagens.map(msg => ({
      id: msg.id,
      remetente: msg.remetente,
      mensagem: msg.conteudo,
      horario: new Date(msg.created_at).toLocaleTimeString('pt-BR'),
      tipo: msg.is_pregoeiro ? 'PREGOEIRO' : (msg.remetente === 'SISTEMA' ? 'SISTEMA' : 'FORNECEDOR'),
    }));

    // Formata itens
    const itensFormatados = (licitacao?.itens || []).map(item => ({
      id: item.id,
      numero: item.numero_item,
      descricao: item.descricao_resumida,
      quantidade: item.quantidade,
      unidade: item.unidade_medida,
      valorReferencia: Number(item.valor_unitario_estimado),
      status: item.id === sessaoMem.itemAtualId ? 'EM_DISPUTA' : 'AGUARDANDO',
    }));

    // Participantes online
    const participantes = Array.from(sessaoMem.participantesOnline.values()).map(p => ({
      id: p.id,
      nomeExibicao: p.tipo === 'PREGOEIRO' ? 'PREGOEIRO' : this.mascararFornecedor(p.nome),
      tipo: p.tipo,
      online: true,
    }));

    return {
      licitacaoId,
      licitacaoNumero: licitacao?.numero_edital || 'PE 001/2025',
      orgaoNome: licitacao?.orgao?.nome || 'Órgão Público',
      pregoeiroNome: 'Pregoeiro',
      status: sessaoMem.status,
      etapa: sessaoMem.etapa,
      itemAtualId: sessaoMem.itemAtualId,
      tempoRestante: sessaoMem.tempoRestante,
      emTempoAleatorio: sessaoMem.emTempoAleatorio,
      itens: itensFormatados,
      lances: lancesFormatados,
      mensagens: mensagensFormatadas,
      participantes,
    };
  }

  /**
   * Retorna estado de demonstração para sessões de teste
   */
  private getEstadoSessaoDemo(licitacaoId: string, sessaoMem: SessaoEmMemoria) {
    // Participantes online
    const participantes = Array.from(sessaoMem.participantesOnline.values()).map(p => ({
      id: p.id,
      nomeExibicao: p.tipo === 'PREGOEIRO' ? 'PREGOEIRO' : this.mascararFornecedor(p.nome),
      tipo: p.tipo,
      online: true,
    }));

    // Itens de demonstração
    const itensDemo = [
      {
        id: 'item-demo-1',
        numero: 1,
        descricao: 'Computador Desktop Core i7, 16GB RAM, SSD 512GB',
        quantidade: 50,
        unidade: 'UN',
        valorReferencia: 4500.00,
        status: 'EM_DISPUTA' as const,
      },
      {
        id: 'item-demo-2',
        numero: 2,
        descricao: 'Monitor LED 24 polegadas Full HD',
        quantidade: 50,
        unidade: 'UN',
        valorReferencia: 850.00,
        status: 'AGUARDANDO' as const,
      },
      {
        id: 'item-demo-3',
        numero: 3,
        descricao: 'Teclado USB ABNT2',
        quantidade: 100,
        unidade: 'UN',
        valorReferencia: 45.00,
        status: 'AGUARDANDO' as const,
      },
    ];

    // Busca lances de demonstração armazenados em memória
    const lancesArmazenados = this.lancesDemo.get(licitacaoId) || [];
    
    // Ordena por valor (menor primeiro) e formata
    const lancesFormatados = lancesArmazenados
      .sort((a, b) => a.valor - b.valor)
      .map((lance, index) => ({
        id: lance.id,
        fornecedorId: lance.fornecedorId,
        fornecedorNomeExibicao: this.mascararFornecedor(lance.fornecedorNome),
        valor: lance.valor,
        valorTotal: lance.valor * 50, // quantidade do item demo
        horario: lance.horario.toLocaleTimeString('pt-BR'),
        posicao: index + 1,
      }));

    // Busca mensagens de demonstração armazenadas em memória
    const mensagensArmazenadas = this.mensagensDemo.get(licitacaoId) || [];
    
    // Mensagens iniciais + mensagens enviadas
    const mensagensIniciais = [
      {
        id: 'msg-1',
        remetente: 'SISTEMA',
        mensagem: 'Sessão de disputa iniciada',
        horario: '14:00:00',
        tipo: 'SISTEMA' as const,
      },
      {
        id: 'msg-2',
        remetente: 'PREGOEIRO',
        mensagem: 'Bem-vindos à sessão de disputa. Item 1 em disputa.',
        horario: '14:00:15',
        tipo: 'PREGOEIRO' as const,
      },
    ];
    
    const mensagensFormatadas = [
      ...mensagensIniciais,
      ...mensagensArmazenadas.map(msg => ({
        id: msg.id,
        remetente: msg.remetente,
        mensagem: msg.mensagem,
        horario: msg.horario.toLocaleTimeString('pt-BR'),
        tipo: msg.tipo,
      })),
    ];

    return {
      licitacaoId,
      licitacaoNumero: 'PE 001/2025',
      orgaoNome: 'Prefeitura Municipal de Exemplo',
      pregoeiroNome: 'Maria Silva',
      status: sessaoMem.status,
      etapa: sessaoMem.etapa,
      itemAtualId: sessaoMem.itemAtualId,
      tempoRestante: sessaoMem.tempoRestante,
      emTempoAleatorio: sessaoMem.emTempoAleatorio,
      itens: itensDemo,
      lances: lancesFormatados,
      mensagens: mensagensFormatadas,
      participantes,
    };
  }

  /**
   * Mascara identificador do fornecedor para exibição
   */
  private mascararFornecedor(identificador: string): string {
    // Se for CNPJ, mascara
    if (identificador.length >= 14) {
      return `***${identificador.slice(-4)}`;
    }
    // Se for nome, mostra parcial
    return identificador.length > 10 
      ? `${identificador.substring(0, 3)}***` 
      : identificador;
  }

  /**
   * Adiciona participante à sessão
   */
  async adicionarParticipante(
    licitacaoId: string, 
    participanteId: string, 
    nome: string, 
    tipo: 'PREGOEIRO' | 'FORNECEDOR',
    socketId: string
  ) {
    const sessao = await this.inicializarSessao(licitacaoId);
    sessao.participantesOnline.set(socketId, { id: participanteId, nome, tipo, socketId });
  }

  /**
   * Remove participante da sessão
   */
  removerParticipante(licitacaoId: string, socketId: string) {
    const sessao = this.sessoesAtivas.get(licitacaoId);
    if (sessao) {
      sessao.participantesOnline.delete(socketId);
    }
  }

  /**
   * Processa tick do timer (chamado a cada segundo pelo gateway)
   */
  async processarTick(licitacaoId: string): Promise<{ mudouEstado: boolean; novoEstado?: any }> {
    const sessao = this.sessoesAtivas.get(licitacaoId);
    if (!sessao || sessao.status !== StatusSessao.EM_ANDAMENTO) {
      return { mudouEstado: false };
    }

    sessao.tempoRestante--;

    if (sessao.tempoRestante <= 0) {
      if (!sessao.emTempoAleatorio) {
        // Inicia tempo aleatório (2 a 30 minutos)
        const tempoAleatorio = Math.floor(Math.random() * 28 + 2) * 60; // em segundos
        sessao.emTempoAleatorio = true;
        sessao.tempoAleatorioSorteado = tempoAleatorio;
        sessao.tempoRestante = tempoAleatorio;

        // Persiste no banco apenas se for UUID válido
        if (this.isValidUUID(licitacaoId)) {
          await this.sessaoRepository.update(sessao.sessaoId, {
            status: StatusSessao.RANDOM_ENCERRANDO,
            tempo_aleatorio_sorteado: tempoAleatorio / 60,
            inicio_tempo_aleatorio: new Date(),
          });
        }

        // Envia mensagem de sistema
        await this.enviarMensagemSistema(licitacaoId, 
          '⚠️ ATENÇÃO: Iniciado tempo aleatório de encerramento. O item pode encerrar a qualquer momento!');

        return { mudouEstado: true, novoEstado: await this.getEstadoSessao(licitacaoId) };
      } else {
        // Tempo aleatório acabou - encerra item
        await this.encerrarItemAtual(licitacaoId);
        return { mudouEstado: true, novoEstado: await this.getEstadoSessao(licitacaoId) };
      }
    }

    return { mudouEstado: false };
  }

  /**
   * Reseta o timer quando um lance é enviado
   */
  async resetarTimer(licitacaoId: string) {
    const sessao = this.sessoesAtivas.get(licitacaoId);
    if (sessao) {
      // Se estava em tempo aleatório, volta ao normal
      if (sessao.emTempoAleatorio) {
        sessao.emTempoAleatorio = false;
        sessao.tempoAleatorioSorteado = null;
        
        // Persiste apenas se for UUID válido
        if (this.isValidUUID(licitacaoId)) {
          await this.sessaoRepository.update(sessao.sessaoId, {
            status: StatusSessao.EM_ANDAMENTO,
            tempo_aleatorio_sorteado: undefined,
            inicio_tempo_aleatorio: undefined,
          });
        }
      }
      
      // Reseta para 3 minutos
      sessao.tempoRestante = 180;
      sessao.ultimoLanceEm = new Date();

      // Persiste apenas se for UUID válido
      if (this.isValidUUID(licitacaoId)) {
        await this.sessaoRepository.update(sessao.sessaoId, {
          ultimo_lance_em: new Date(),
        });
      }
    }
  }

  /**
   * Encerra o item atual
   */
  async encerrarItemAtual(licitacaoId: string) {
    const sessao = this.sessoesAtivas.get(licitacaoId);
    if (!sessao) return;

    // Envia mensagem de encerramento
    await this.enviarMensagemSistema(licitacaoId, 
      `✅ Item encerrado. Melhor lance registrado.`);

    // TODO: Avançar para próximo item ou encerrar sessão
    sessao.status = StatusSessao.ENCERRADA;
    sessao.etapa = EtapaSessao.ENCERRAMENTO;

    // Só persiste no banco se for UUID válido
    if (this.isValidUUID(licitacaoId)) {
      await this.sessaoRepository.update(sessao.sessaoId, {
        status: StatusSessao.ENCERRADA,
        etapa: EtapaSessao.ENCERRAMENTO,
        data_hora_encerramento: new Date(),
      });
    }
  }

  /**
   * Envia mensagem de sistema
   */
  async enviarMensagemSistema(licitacaoId: string, conteudo: string) {
    // Se for sessão de demonstração, não persiste
    if (!this.isValidUUID(licitacaoId)) {
      return {
        id: `demo-msg-${Date.now()}`,
        licitacao_id: licitacaoId,
        remetente: 'SISTEMA',
        conteudo,
        is_pregoeiro: false,
        created_at: new Date(),
      } as unknown as MensagemChat;
    }
    
    const msg = this.mensagemRepository.create({
      licitacao_id: licitacaoId,
      remetente: 'SISTEMA',
      conteudo,
      is_pregoeiro: false,
    });
    return await this.mensagemRepository.save(msg);
  }

  async registrarLance(
    licitacaoId: string,
    fornecedorIdentificador: string,
    valor: number,
    ip: string,
  ): Promise<Lance | null> {
    // Se for sessão de demonstração, armazena em memória
    if (!this.isValidUUID(licitacaoId)) {
      console.log(`Lance de demonstração: ${fornecedorIdentificador} - R$ ${valor}`);
      
      // Inicializa array se não existir
      if (!this.lancesDemo.has(licitacaoId)) {
        this.lancesDemo.set(licitacaoId, []);
      }
      
      const lanceDemo: LanceDemo = {
        id: `demo-lance-${Date.now()}`,
        fornecedorId: fornecedorIdentificador,
        fornecedorNome: fornecedorIdentificador,
        valor: valor,
        horario: new Date(),
      };
      
      this.lancesDemo.get(licitacaoId)!.push(lanceDemo);
      
      // Retorna um lance simulado
      return {
        id: lanceDemo.id,
        licitacao_id: licitacaoId,
        fornecedor_identificador: fornecedorIdentificador,
        valor: valor,
        ip_origem: ip,
        cancelado: false,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as Lance;
    }

    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) {
      throw new BadRequestException('Licitacao nao encontrada');
    }

    const meuUltimoLance = await this.lanceRepository.findOne({
      where: { licitacao_id: licitacaoId, fornecedor_identificador: fornecedorIdentificador, cancelado: false },
      order: { created_at: 'DESC' },
    });

    if (meuUltimoLance && valor >= Number(meuUltimoLance.valor)) {
      throw new BadRequestException(
        `Seu lance deve ser menor que seu lance anterior (R$ ${meuUltimoLance.valor})`
      );
    }

    const lance = this.lanceRepository.create({
      licitacao_id: licitacaoId,
      fornecedor_identificador: fornecedorIdentificador,
      valor,
      ip_origem: ip,
      cancelado: false,
    });

    return await this.lanceRepository.save(lance);
  }

  async cancelarLance(lanceId: string): Promise<Lance | null> {
    // Se for lance de demonstração, apenas retorna null
    if (lanceId.startsWith('demo-')) {
      return null;
    }
    
    const lance = await this.lanceRepository.findOneBy({ id: lanceId });
    if (!lance) {
      throw new BadRequestException('Lance nao encontrado');
    }

    lance.cancelado = true;
    return await this.lanceRepository.save(lance);
  }

  async getLances(licitacaoId: string): Promise<Lance[]> {
    // Se for sessão de demonstração, retorna array vazio
    if (!this.isValidUUID(licitacaoId)) {
      return [];
    }
    return await this.lanceRepository.find({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'DESC' },
    });
  }

  async getLancesAtivos(licitacaoId: string): Promise<Lance[]> {
    // Se for sessão de demonstração, retorna array vazio
    if (!this.isValidUUID(licitacaoId)) {
      return [];
    }
    return await this.lanceRepository.find({
      where: { licitacao_id: licitacaoId, cancelado: false },
      order: { valor: 'ASC' },
    });
  }

  async getMelhorLance(licitacaoId: string): Promise<Lance | null> {
    // Se for sessão de demonstração, retorna null
    if (!this.isValidUUID(licitacaoId)) {
      return null;
    }
    return await this.lanceRepository.findOne({
      where: { licitacao_id: licitacaoId, cancelado: false },
      order: { valor: 'ASC' },
    });
  }

  async enviarMensagem(
    licitacaoId: string,
    remetenteNome: string,
    conteudo: string,
    isPregoeiro: boolean,
  ): Promise<MensagemChat> {
    // Se for sessão de demonstração, armazena em memória
    if (!this.isValidUUID(licitacaoId)) {
      // Inicializa array se não existir
      if (!this.mensagensDemo.has(licitacaoId)) {
        this.mensagensDemo.set(licitacaoId, []);
      }
      
      const msgDemo: MensagemDemo = {
        id: `demo-msg-${Date.now()}`,
        remetente: isPregoeiro ? 'PREGOEIRO' : 'FORNECEDOR', // Anônimo conforme lei
        mensagem: conteudo,
        horario: new Date(),
        tipo: isPregoeiro ? 'PREGOEIRO' : 'FORNECEDOR',
      };
      
      this.mensagensDemo.get(licitacaoId)!.push(msgDemo);
      
      return {
        id: msgDemo.id,
        licitacao_id: licitacaoId,
        remetente: 'FORNECEDOR', // Anônimo conforme lei
        conteudo,
        is_pregoeiro: isPregoeiro,
        created_at: new Date(),
      } as unknown as MensagemChat;
    }
    
    const msg = this.mensagemRepository.create({
      licitacao_id: licitacaoId,
      remetente: isPregoeiro ? 'PREGOEIRO' : 'FORNECEDOR', // Anônimo conforme lei
      conteudo,
      is_pregoeiro: isPregoeiro,
    });

    return await this.mensagemRepository.save(msg);
  }

  async getMensagens(licitacaoId: string): Promise<MensagemChat[]> {
    // Se for sessão de demonstração, retorna array vazio
    if (!this.isValidUUID(licitacaoId)) {
      return [];
    }
    return await this.mensagemRepository.find({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'ASC' },
    });
  }
}
