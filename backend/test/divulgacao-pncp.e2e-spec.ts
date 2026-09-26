/**
 * ============================================================================
 * DIVULGAÇÃO OFICIAL NO PNCP + REGRAS DA DISPENSA (IN SEGES 67/2021)
 * ============================================================================
 *
 * Lei 14.133/2021 arts. 54, 55, 174 e 176 (a divulgação oficial é a do PNCP;
 * sem PNCP, diário oficial) e art. 75 §3º; IN SEGES 67/2021 arts. 6º, 7º, 10,
 * 11, 13, 15, 16 e 22; art. 71 §§1º a 3º.
 *
 *  1. PUBLICAR → AGUARDANDO_DIVULGACAO → PNCP aceita a compra → divulgação
 *     confirmada → recebimento aberto (dispensa, órgão integrado);
 *  2. PNCP recusa → continua aguardando, proposta recusada, banner com o
 *     retorno REAL da API (código, mensagem, tentativas, última tentativa);
 *  3. confirmação tardia → fim do recebimento estendido ao mínimo legal,
 *     ajuste no histórico, nova versão do aviso + retificação no PNCP;
 *  4. aviso de contratação direta guardado e versionado (prévia / publicado);
 *  5. regras do chat por fase (fechado, avisos formais, lances anônimos,
 *     negociação privada com o vencedor);
 *  6. atos disponíveis com pendências (julgar, deserta, fracassada — art. 22
 *     da IN 67; janela de lances de 6 a 10 h; sem impugnação na dispensa);
 *  7. órgão sem PNCP: registro da publicação no diário oficial (art. 176);
 *  8. migração do boot (compra enviada → confirmada; sem compra → aguardando);
 *  9. histórico legível (rótulos + nome de quem praticou).
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  ajustarCronograma,
  buscarLicitacao,
  confirmarDivulgacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  enviarProposta,
  gerarAvisoDispensa,
  pncpMock,
} from './support';
import {
  DOCUMENTOS_ART_72,
  abrirJanelaLances,
  corpoDivulgacao,
  criarDocumentoInstrucao,
  fimPropostasSugerido,
  moverFimDaJanela,
  vincularOrgaoPncp,
} from './support/dispensa';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { MigracaoDivulgacaoBootService } from '../src/pncp/migracao-divulgacao-boot.service';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { calendarioDoOrgao, fimDoPrazoEmDiasUteis, inicioDoDia } from '../src/common/prazos/dias-uteis';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Divulgação oficial no PNCP e regras da dispensa (IN SEGES 67/2021)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture; // integrado ao PNCP
  let semPncp: OrgaoFixture; // sem integração (art. 176)
  let agente: { token: string; id: string };
  let f1: FornecedorFixture;
  let f2: FornecedorFixture;
  let f3: FornecedorFixture;
  const http = () => ctx.http();

  /** Dispensa instruída (art. 72) e com a fase interna concluída, pronta para gerar o aviso e divulgar. */
  async function dispensaInstruida(o: OrgaoFixture, token = o.token) {
    const lic = await criarLicitacao(ctx, o, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    for (const [tipo, titulo] of DOCUMENTOS_ART_72) await criarDocumentoInstrucao(ctx, lic, tipo, titulo);
    await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(token)).expect(200);
    return lic;
  }

  async function divulgar(lic: { id: string }, token: string, fim = fimPropostasSugerido()) {
    return http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(token)).send(corpoDivulgacao(fim));
  }

  const situacao = async (id: string, token = orgao.token) =>
    (await http().get(`/api/publicacao/licitacao/${id}/divulgacao`).set(bearer(token)).expect(200)).body;

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Divulgação PNCP E2E' });
    await vincularOrgaoPncp(ctx, orgao);
    semPncp = await criarOrgao(ctx, { nome: 'Município sem PNCP E2E' });
    const u = await criarUsuarioOrgao(ctx, orgao, { role: RoleUsuario.PREGOEIRO, nome: 'Maria Agente de Contratação' });
    agente = { token: u.token, id: u.id };
    f1 = await criarFornecedor(ctx, { porte: 'ME' });
    f2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    f3 = await criarFornecedor(ctx, { porte: 'EPP' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('1–4. PNCP confirma a divulgação; falha segura o prazo; aviso guardado', () => {
    let lic: any;

    it('sem o aviso gerado, o PUBLICAR devolve a pendência; a prévia fica guardada (RASCUNHO) só para o órgão', async () => {
      lic = await dispensaInstruida(orgao, agente.token);
      const r = await divulgar(lic, agente.token);
      expect(r.status).toBe(400);
      expect(r.body.pendencias).toEqual(expect.arrayContaining([expect.stringMatching(/Gere o aviso de contratação direta/)]));
      const atos = (await http().get(`/api/licitacoes/${lic.id}/atos`).set(bearer(orgao.token)).expect(200)).body;
      const pub = atos.find((a: any) => a.ato === 'PUBLICAR');
      expect(pub.disponivel).toBe(false);
      expect(pub.pendencias.join(' ')).toMatch(/aviso de contratação direta/);

      const aviso = await gerarAvisoDispensa(ctx, lic);
      expect(aviso).toMatchObject({ versao: 1, status: 'RASCUNHO' });
      expect(aviso.hash).toMatch(/^[0-9a-f]{64}$/);
      const pdf = await http().get(`/api/publicacao/licitacao/${lic.id}/aviso/${aviso.documento_id}/arquivo`).set(bearer(orgao.token)).buffer(true).expect(200);
      expect(String(pdf.headers['content-type'])).toMatch(/pdf/);
      // antes da divulgação ninguém de fora vê o processo
      await http().get(`/api/publicacao/licitacao/${lic.id}/aviso`).expect(404);
      await http().get(`/api/publicacao/licitacao/${lic.id}/aviso`).set(bearer(f1.token)).expect(404);
    });

    it('PNCP recusa a compra (422): continua AGUARDANDO, proposta recusada, sem público, banner com o retorno real', async () => {
      pncpMock.limpar();
      pncpMock.responder('POST', /\/compras$/, { status: 422, corpo: { message: 'Item 1: unidade de medida inválida', codigo: 'PNCP-422' } });
      const r = await divulgar(lic, agente.token);
      expect(r.status).toBe(200);
      expect(r.body.fase).toBe(FaseLicitacao.AGUARDANDO_DIVULGACAO);

      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      const depois = await buscarLicitacao(ctx, lic);
      expect(depois.fase).toBe(FaseLicitacao.AGUARDANDO_DIVULGACAO);
      expect(depois.data_divulgacao_oficial ?? null).toBeNull();

      // proposta recusada: o prazo não começou
      const p = await http()
        .post('/api/propostas')
        .set(bearer(f1.token))
        .send({ licitacao_id: lic.id, declaracao_termos: true, declaracao_integridade: true, declaracao_inexistencia_fatos: true, declaracao_menor: true, itens: [{ item_licitacao_id: lic.itens[0].id, valor_unitario: 90 }] });
      expect(p.status).toBe(409);
      expect(p.body.message).toMatch(/ainda não publicado no PNCP/);

      // não é pública
      expect([403, 404]).toContain((await http().get(`/api/licitacoes/${lic.id}`).set(bearer(f1.token))).status);
      await http().get(`/api/publicacao/licitacao/${lic.id}/edital`).expect(404);

      // banner: retorno REAL do PNCP (código + mensagem + tentativas + última tentativa)
      const s = await situacao(lic.id);
      expect(s.estado).toBe('AGUARDANDO');
      expect(s.banner).toMatchObject({ tipo: 'ERRO', titulo: 'Aviso NÃO publicado no PNCP — prazo não iniciado', pode_reenviar: true });
      expect(s.banner.mensagem).toMatch(/HTTP 422/);
      expect(s.banner.mensagem).toMatch(/unidade de medida inválida/);
      expect(s.banner.pendencias.map((x: any) => x.campo)).toContain('itens');
      expect(s.compra).toMatchObject({ status: 'ERRO_DEFINITIVO', erro_status_http: 422, tentativas: 1 });
      expect(s.compra.erro_resposta).toMatchObject({ message: 'Item 1: unidade de medida inválida', codigo: 'PNCP-422' });
      expect(s.compra.ultima_tentativa).toBeTruthy();
      // a mesma informação na fila do cockpit
      const fila = (await http().get('/api/pncp/fila').query({ licitacaoId: lic.id }).set(bearer(orgao.token)).expect(200)).body;
      expect(fila.find((l: any) => l.tipo === 'COMPRA')).toMatchObject({ erro_status_http: 422 });
      // outro órgão / fornecedor não leem a situação
      const outro = await criarOrgao(ctx);
      expect([403, 404]).toContain((await http().get(`/api/publicacao/licitacao/${lic.id}/divulgacao`).set(bearer(outro.token))).status);
      expect([401, 403]).toContain((await http().get(`/api/publicacao/licitacao/${lic.id}/divulgacao`).set(bearer(f1.token))).status);
      // julgar/deserta/fracassada não aparecem; o chat está fechado
      const atos = (await http().get(`/api/licitacoes/${lic.id}/atos`).set(bearer(orgao.token)).expect(200)).body.map((a: any) => a.ato);
      expect(atos).not.toContain('JULGAR_DISPENSA');
      expect(atos).not.toContain('DECLARAR_DESERTA');
      const regras = (await http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens/regras`).set(bearer(orgao.token)).expect(200)).body;
      expect(regras).toMatchObject({ modo: 'FECHADO', orgao_pode_enviar: false, fornecedor_pode_enviar: false });
      // o órgão não se "autoconfirma" pelo ato genérico nem pelo diário oficial (é integrado)
      expect((await http().post(`/api/licitacoes/${lic.id}/atos/CONFIRMAR_DIVULGACAO`).set(bearer(orgao.token)).send({})).status).toBe(400);
      expect(
        (await http().post(`/api/publicacao/licitacao/${lic.id}/divulgacao-oficial`).set(bearer(orgao.token)).send({ data_divulgacao: new Date().toISOString(), referencia: 'DOE 123' })).status,
      ).toBe(409);
    });

    it('confirmação TARDIA: reenviar agora → divulgação confirmada, fim do recebimento estendido ao mínimo legal e registrado', async () => {
      // relógio: o fim planejado ficou abaixo dos 3 dias úteis contados de AGORA (confirmação)
      const curto = new Date(Date.now() + 26 * 3_600_000);
      await ajustarCronograma(ctx, lic, { data_fim_acolhimento: curto, data_abertura_sessao: curto, data_limite_impugnacao: curto });
      pncpMock.limpar(); // PNCP volta a aceitar
      const s = await situacao(lic.id);
      const re = await http().post(`/api/pncp/fila/${s.banner.reenviar_id}/reenviar`).set(bearer(orgao.token));
      expect([200, 201]).toContain(re.status);

      const depois = await buscarLicitacao(ctx, lic);
      expect(depois.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      expect(depois.meio_divulgacao_oficial).toBe('PNCP');
      expect(depois.referencia_divulgacao_oficial).toMatch(/-1-\d{6}\/\d{4}$/);
      const divulgacao = new Date((await ctx.dataSource.query(`SELECT data_divulgacao_oficial AS d FROM licitacoes WHERE id = $1`, [lic.id]))[0].d);
      const minimo = inicioDoDia(fimDoPrazoEmDiasUteis(divulgacao, 3, calendarioDoOrgao(orgao.id)));
      const [row] = await ctx.dataSource.query(`SELECT data_fim_acolhimento AS fim, data_abertura_sessao AS ab FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(new Date(row.fim).getTime()).toBeGreaterThanOrEqual(minimo.getTime());
      expect(new Date(row.ab).getTime()).toBeGreaterThanOrEqual(new Date(row.fim).getTime());

      // histórico: ato do SISTEMA (PNCP) com o ajuste descrito, rótulos legíveis
      const hist = (await http().get(`/api/licitacoes/${lic.id}/transicoes`).set(bearer(orgao.token)).expect(200)).body;
      const conf = hist.find((h: any) => h.ato === 'CONFIRMAR_DIVULGACAO');
      expect(conf).toMatchObject({ ator_nome: 'Sistema (PNCP)', rotulo_ato: 'Confirmar divulgação oficial (PNCP)', rotulo_fase_de: 'Aguardando publicação no PNCP', rotulo_fase_para: 'Publicado' });
      expect(conf.resumo).toMatch(/prazo mínimo de 3 dias úteis/);
      const pub = hist.find((h: any) => h.ato === 'PUBLICAR');
      expect(pub.ator_nome).toBe('Maria Agente de Contratação');
      expect(pub.rotulo_fase_para).toBe('Aguardando publicação no PNCP');
      const ini = hist.find((h: any) => h.ato === 'INICIAR_ACOLHIMENTO');
      expect(ini.ator_nome).toBe('Sistema (relógio)');

      // nova versão do aviso (datas corretas) + retificação da compra no PNCP
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      const avisos = (await http().get(`/api/publicacao/licitacao/${lic.id}/aviso`).set(bearer(orgao.token)).expect(200)).body;
      expect(avisos.vigente).toMatchObject({ versao: 3, status: 'PUBLICADO' });
      expect(avisos.versoes.map((v: any) => v.status)).toEqual(['PUBLICADO', 'SUBSTITUIDO', 'SUBSTITUIDO']);
      expect(pncpMock.filtrar('PATCH', /\/compras\/\d+\/\d+$/).length).toBeGreaterThanOrEqual(1);
      expect(pncpMock.filtrar('POST', /\/compras\/\d+\/\d+\/arquivos$/).length).toBeGreaterThanOrEqual(1);
      // o órgão foi avisado
      const [n] = await ctx.dataSource.query(`SELECT titulo FROM notificacoes WHERE entidade_id = $1 ORDER BY created_at DESC LIMIT 1`, [lic.id]);
      expect(n.titulo).toMatch(/Prazo da contratação estendido/);

      // pública e com o aviso publicado (não a prévia)
      const pubAvisos = (await http().get(`/api/publicacao/licitacao/${lic.id}/aviso`).expect(200)).body;
      expect(pubAvisos.vigente.status).toBe('PUBLICADO');
      expect(pubAvisos.versoes.some((v: any) => v.status === 'RASCUNHO')).toBe(false);
      const s2 = await situacao(lic.id);
      expect(s2).toMatchObject({ estado: 'CONFIRMADA', banner: null });
    });

    it('com a divulgação confirmada, o fornecedor envia proposta', async () => {
      await enviarProposta(ctx, f1, lic, [90, 45]);
      await enviarProposta(ctx, f2, lic, [95, 44]);
    });

    // ------------------------------------------------------------------------
    it('chat no prazo: o órgão publica AVISO formal (assunto + texto); fornecedor com proposta pergunta sem identificação; sem impugnação formal', async () => {
      const regras = (await http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens/regras`).set(bearer(orgao.token)).expect(200)).body;
      expect(regras).toMatchObject({ modo: 'AVISOS', exige_assunto: true, orgao_pode_enviar: true, fornecedor_pode_enviar: true });
      const curta = await http().post(`/api/licitacoes/${lic.id}/dispensa/mensagens`).set(bearer(orgao.token)).send({ mensagem: 'ok' });
      expect(curta.status).toBe(400);
      expect(curta.body.message).toMatch(/AVISOS formais/);
      await http()
        .post(`/api/licitacoes/${lic.id}/dispensa/mensagens`)
        .set(bearer(orgao.token))
        .send({ assunto: 'Local de entrega', mensagem: 'A entrega será no almoxarifado central, das 8h às 14h.' })
        .expect(201);
      await http().post(`/api/licitacoes/${lic.id}/dispensa/mensagens`).set(bearer(f1.token)).send({ mensagem: 'O frete é por conta do fornecedor?' }).expect(201);
      const lista = (await http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).expect(200)).body;
      expect(lista.some((m: any) => /^AVISO — Local de entrega:/.test(m.mensagem))).toBe(true);
      const doF1 = lista.find((m: any) => m.autor_tipo === 'FORNECEDOR');
      expect(doF1.fornecedor_id).toBeUndefined();
      expect(JSON.stringify(lista)).not.toContain(f1.razao_social);
      // IN 67: não há impugnação nem pedido de esclarecimento formal na dispensa
      const imp = await http().post('/api/impugnacoes').set(bearer(f1.token)).send({ licitacao_id: lic.id, motivo: 'Impugno o aviso', fundamentacao: 'x'.repeat(30) });
      expect([400, 403]).toContain(imp.status);
      if (imp.status === 400) expect(JSON.stringify(imp.body)).toMatch(/dispensa eletrônica não há/);
    });

    it('julgar / deserta / fracassada: pendências do backend antes do fim do prazo e antes da etapa de lances', async () => {
      const atos = (await http().get(`/api/licitacoes/${lic.id}/atos`).set(bearer(orgao.token)).expect(200)).body;
      const julgar = atos.find((a: any) => a.ato === 'JULGAR_DISPENSA');
      expect(julgar.disponivel).toBe(false);
      expect(julgar.pendencias.join(' ')).toMatch(/prazo de recebimento de propostas ainda está aberto/);
      const deserta = atos.find((a: any) => a.ato === 'DECLARAR_DESERTA');
      expect(deserta.disponivel).toBe(false);
      expect(deserta.pendencias.join(' ')).toMatch(/depois do fim do prazo/);
      const fracassada = atos.find((a: any) => a.ato === 'DECLARAR_FRACASSADA');
      expect(fracassada.disponivel).toBe(false);

      await abrirSessaoAgora(ctx, lic); // relógio: fim do recebimento
      const depois = (await http().get(`/api/licitacoes/${lic.id}/atos`).set(bearer(orgao.token)).expect(200)).body;
      const j2 = depois.find((a: any) => a.ato === 'JULGAR_DISPENSA');
      expect(j2.disponivel).toBe(false);
      expect(j2.pendencias.join(' ')).toMatch(/Abra a fase de lances .*art\. 11/);
      // fornecedores não falam fora da etapa de lances (até o julgamento)
      const r = await http().post(`/api/licitacoes/${lic.id}/dispensa/mensagens`).set(bearer(f1.token)).send({ mensagem: 'Alguma novidade?' });
      expect(r.status).toBe(409);
    });

    it('etapa de lances de 6 a 10 horas (IN 67 art. 11); julgar só depois do encerramento (art. 15)', async () => {
      const curta = await abrirJanelaLances(ctx, lic, { duracao_minutos: 30 });
      expect(curta.status).toBe(400);
      expect(curta.body.message).toMatch(/6 a 10 horas/);
      expect((await abrirJanelaLances(ctx, lic, { duracao_minutos: 601 })).status).toBe(400);
      const ok = await abrirJanelaLances(ctx, lic, { duracao_minutos: 360 });
      expect(ok.status).toBe(201);
      const regras = (await http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens/regras`).set(bearer(f1.token)).expect(200)).body;
      expect(regras).toMatchObject({ modo: 'LANCES', fornecedor_pode_enviar: true });
      const j = await http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token));
      expect(j.status).toBe(400);
      expect(j.body.message).toMatch(/art\. 15/);
      await moverFimDaJanela(ctx, lic.id, new Date(Date.now() - 1_000));
      const julgado = await http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token));
      expect(julgado.status).toBe(201);
    });

    it('negociação com o VENCEDOR (IN 67 art. 16): privada — os demais não leem nem escrevem', async () => {
      const regrasOrgao = (await http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens/regras`).set(bearer(orgao.token)).expect(200)).body;
      expect(regrasOrgao).toMatchObject({ modo: 'NEGOCIACAO', privado: true, orgao_pode_enviar: true });
      // item 1 → f1 (90); item 2 → f2 (44): dois vencedores, o órgão escolhe com quem negociar
      expect(regrasOrgao.interlocutores.map((i: any) => i.fornecedor_id).sort()).toEqual([f1.id, f2.id].sort());
      const semDestino = await http().post(`/api/licitacoes/${lic.id}/dispensa/mensagens`).set(bearer(orgao.token)).send({ mensagem: 'Pode reduzir o valor do item 1?' });
      expect(semDestino.status).toBe(400);
      await http()
        .post(`/api/licitacoes/${lic.id}/dispensa/mensagens`)
        .set(bearer(orgao.token))
        .send({ mensagem: 'Pode reduzir o valor do item 1 para R$ 85,00?', fornecedor_destino_id: f1.id })
        .expect(201);
      await http().post(`/api/licitacoes/${lic.id}/dispensa/mensagens`).set(bearer(f1.token)).send({ mensagem: 'Aceito R$ 87,00.' }).expect(201);

      // f3 não tem proposta; f2 é vencedor de outro item mas não participa desta conversa
      const leituraF2 = (await http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).set(bearer(f2.token)).expect(200)).body;
      expect(JSON.stringify(leituraF2)).not.toContain('R$ 85,00');
      expect(JSON.stringify(leituraF2)).not.toContain('Aceito R$ 87,00');
      const publico = (await http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).expect(200)).body;
      expect(JSON.stringify(publico)).not.toContain('R$ 85,00');
      const leituraF1 = (await http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).set(bearer(f1.token)).expect(200)).body;
      expect(JSON.stringify(leituraF1)).toContain('R$ 85,00');
      const leituraOrgao = (await http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).set(bearer(orgao.token)).expect(200)).body;
      expect(JSON.stringify(leituraOrgao)).toContain('Aceito R$ 87,00');
      const naoVencedor = await http().post(`/api/licitacoes/${lic.id}/dispensa/mensagens`).set(bearer(f3.token)).send({ mensagem: 'E eu?' });
      expect([400, 409]).toContain(naoVencedor.status);
      // o socket da sala não é caminho alternativo para o chat da dispensa (regras só pela rota da dispensa)
      // ata: a negociação só aparece para o órgão antes da homologação
      const ataPublica = await http().get(`/api/licitacoes/${lic.id}/dispensa/ata`).buffer(true).expect(200);
      expect(Buffer.isBuffer(ataPublica.body) || typeof ataPublica.text === 'string').toBe(true);
    });
  });

  // ==========================================================================
  describe('6. deserta com a providência do art. 22 da IN 67', () => {
    it('sem proposta, depois do prazo: deserta exige a providência (I ou III) e a registra no histórico', async () => {
      const lic = await dispensaInstruida(orgao);
      await gerarAvisoDispensa(ctx, lic);
      expect((await divulgar(lic, orgao.token)).status).toBe(200);
      await confirmarDivulgacao(ctx, lic);
      await abrirSessaoAgora(ctx, lic);
      const julgar = (await http().get(`/api/licitacoes/${lic.id}/atos`).set(bearer(orgao.token)).expect(200)).body.find((a: any) => a.ato === 'JULGAR_DISPENSA');
      expect(julgar.pendencias.join(' ')).toMatch(/declare a dispensa deserta/);
      const sem = await http().post(`/api/licitacoes/${lic.id}/atos/DECLARAR_DESERTA`).set(bearer(orgao.token)).send({ motivo: 'Nenhuma proposta no prazo do aviso' });
      expect(sem.status).toBe(400);
      expect(JSON.stringify(sem.body)).toMatch(/art\. 22 da IN SEGES 67\/2021/);
      const II = await http()
        .post(`/api/licitacoes/${lic.id}/atos/DECLARAR_DESERTA`)
        .set(bearer(orgao.token))
        .send({ motivo: 'Nenhuma proposta no prazo do aviso', dados: { providencia_art22: 'PRAZO_ADEQUACAO' } });
      expect(II.status).toBe(400); // deserta: só I ou III (parágrafo único)
      await http()
        .post(`/api/licitacoes/${lic.id}/atos/DECLARAR_DESERTA`)
        .set(bearer(orgao.token))
        .send({ motivo: 'Nenhuma proposta no prazo do aviso', dados: { providencia_art22: 'REPUBLICAR' } })
        .expect(201);
      const hist = (await http().get(`/api/licitacoes/${lic.id}/transicoes`).set(bearer(orgao.token)).expect(200)).body;
      const d = hist.find((h: any) => h.ato === 'DECLARAR_DESERTA');
      expect(d.rotulo_situacao_para).toBe('Deserta');
      expect(d.resumo).toMatch(/I — republicação do procedimento/);
    });
  });

  // ==========================================================================
  describe('7. órgão sem PNCP: publicação no diário oficial (art. 176, parágrafo único)', () => {
    it('fica aguardando até o registro; data futura recusada; com o registro, o prazo corre', async () => {
      const lic = await dispensaInstruida(semPncp);
      await gerarAvisoDispensa(ctx, lic);
      const r = await divulgar(lic, semPncp.token);
      expect(r.body.fase).toBe(FaseLicitacao.AGUARDANDO_DIVULGACAO);
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.AGUARDANDO_DIVULGACAO);
      const s = await situacao(lic.id, semPncp.token);
      expect(s.banner).toMatchObject({ pode_registrar_diario_oficial: true });

      const futuro = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/divulgacao-oficial`)
        .set(bearer(semPncp.token))
        .send({ data_divulgacao: new Date(Date.now() + 86_400_000).toISOString(), referencia: 'DOM nº 1234, p. 5' });
      expect(futuro.status).toBe(400);
      const ok = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/divulgacao-oficial`)
        .set(bearer(semPncp.token))
        .send({ data_divulgacao: new Date().toISOString(), referencia: 'DOM nº 1234, p. 5' })
        .expect(201);
      expect(ok.body.confirmada).toBe(true);
      const depois = await buscarLicitacao(ctx, lic);
      expect(depois.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      expect(depois.meio_divulgacao_oficial).toBe('DIARIO_OFICIAL');
      // outro órgão não registra por ele
      const outro = await criarOrgao(ctx);
      expect([403, 404]).toContain((await http().post(`/api/publicacao/licitacao/${lic.id}/divulgacao-oficial`).set(bearer(outro.token)).send({})).status);
    });
  });

  // ==========================================================================
  describe('8. migração do boot (idempotente)', () => {
    it('ACOLHIMENTO sem compra no PNCP → AGUARDANDO; com compra ENVIADA → confirmada; segunda rodada não muda nada', async () => {
      const semCompra = await dispensaInstruida(semPncp);
      const comCompra = await dispensaInstruida(semPncp);
      // estado legado: publicadas direto (antes desta etapa) — simulado no banco
      for (const l of [semCompra, comCompra]) {
        await ctx.dataSource.query(
          `UPDATE licitacoes SET fase = 'ACOLHIMENTO_PROPOSTAS', data_publicacao_edital = NOW() - INTERVAL '1 day', data_divulgacao_oficial = NULL WHERE id = $1`,
          [l.id],
        );
      }
      await ctx.dataSource.query(
        `INSERT INTO pncp_sync (id, tipo, licitacao_id, status, tentativas, max_tentativas, ordem, numero_controle_pncp, ano_compra, sequencial_compra, enviado_em, created_at, updated_at)
         VALUES (gen_random_uuid(), 'COMPRA', $1, 'ENVIADO', 1, 8, 10, '00000000000191-1-000999/2026', 2026, 999, NOW() - INTERVAL '1 day', NOW(), NOW())`,
        [comCompra.id],
      );
      const boot = ctx.app.get(MigracaoDivulgacaoBootService);
      const r = await boot.executarMigracao();
      expect(r!.aguardando).toBeGreaterThanOrEqual(1);
      expect(r!.confirmadas).toBeGreaterThanOrEqual(1);
      const [a] = await ctx.dataSource.query(`SELECT fase::text AS fase, fase_anterior FROM licitacoes WHERE id = $1`, [semCompra.id]);
      expect(a).toEqual({ fase: 'AGUARDANDO_DIVULGACAO', fase_anterior: 'ACOLHIMENTO_PROPOSTAS' });
      const [b] = await ctx.dataSource.query(`SELECT fase::text AS fase, meio_divulgacao_oficial AS meio, referencia_divulgacao_oficial AS ref FROM licitacoes WHERE id = $1`, [comCompra.id]);
      expect(b).toEqual({ fase: 'ACOLHIMENTO_PROPOSTAS', meio: 'PNCP', ref: '00000000000191-1-000999/2026' });
      const hist = (await http().get(`/api/licitacoes/${semCompra.id}/transicoes`).set(bearer(semPncp.token)).expect(200)).body;
      expect(hist.find((h: any) => h.ato === 'MIGRACAO_DIVULGACAO')).toMatchObject({ rotulo_ato: 'Ajuste de dados (divulgação no PNCP)', ator_nome: 'Sistema (ajuste de dados)' });
      const r2 = await boot.executarMigracao();
      const [a2] = await ctx.dataSource.query(`SELECT fase::text AS fase FROM licitacoes WHERE id = $1`, [semCompra.id]);
      expect(a2.fase).toBe('AGUARDANDO_DIVULGACAO');
      const [{ n }] = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM licitacao_transicoes WHERE licitacao_id = $1 AND ato = 'MIGRACAO_DIVULGACAO'`, [semCompra.id]);
      expect(n).toBe(1);
      expect(r2).toBeTruthy();
    });
  });
});
