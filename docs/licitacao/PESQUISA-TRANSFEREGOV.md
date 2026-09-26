# Pesquisa — Homologar o Portal DCP no Transferegov.br

> 26/09/2026 · Fontes: portal do Transferegov (gov.br/transferegov), Comunicados 07/2020 e 40/2020, e a especificação da API no ambiente de validação (`val-siconv.np.estaleiro.serpro.gov.br/maisbrasil-api/v2/api-docs`, versão 1.3.4 da API), lida diretamente.
> Status: **pesquisa**. Nada foi implementado.

## 1. O que é e por que importa

- O **Transferegov.br** (antiga Plataforma +Brasil / Siconv) é onde a União controla as **transferências voluntárias**: convênios com estados, municípios e consórcios.
- Quando um município compra com dinheiro de convênio, o **processo de compra precisa estar registrado no Transferegov**, vinculado ao convênio.
- O órgão pode registrar à mão no Transferegov, ou usar um **sistema de compras externo integrado por API**, que envia os processos sozinho.
  - Por isso a BLL anuncia a "integração completa ao TransfereGov".
  - O regulamento da Câmara de LEM (Portaria 089/2024, art. 72) exige sistema "integrado com a plataforma +Brasil" para a dispensa eletrônica.
- **Base normativa** citada pelo próprio Transferegov:
  - Decreto 10.024/2019 (pregão eletrônico obrigatório nas transferências voluntárias, com uso de sistemas do mercado integrados);
  - Decreto 10.035/2019;
  - IN SEGES 206/2019.
  - Para convênios sob a Lei 14.133: **conferir o Decreto 11.531/2023** e as portarias conjuntas vigentes antes de implementar.

**Para o Portal DCP**, estar integrado ao Transferegov é requisito para atender órgãos que executam convênios. É o mesmo tipo de diferencial que o PNCP.

## 2. Como funciona a homologação (diferente do PNCP)

| | PNCP | Transferegov |
|---|---|---|
| Quem pede | cada órgão, com o próprio acesso | **um órgão cliente** manda ofício pedindo o cadastro do **sistema** |
| Credencial | por órgão | **por sistema** (token): um cadastro serve para todos os clientes |
| Ambiente de teste | treinamento do PNCP | ambiente de **validação** (`val-siconv…`) |

**Passo a passo** (Comunicado 07/2020):

1. **Ofício** de um órgão estadual ou municipal cliente para a **SEGES**, pelo e-mail **seges.api-transferegov@gestao.gov.br**, pedindo o cadastro do sistema externo. Dados exigidos:
   - nome do sistema;
   - **CNPJ da empresa proprietária** (a Valletec);
   - **CPF, nome, telefone e e-mail do responsável técnico**.
2. **Só uma entidade precisa pedir.** Com o sistema cadastrado, ele pode enviar processos de **qualquer** ente que o use (FAQ, Comunicado 40/2020).
3. A SEGES libera o **ambiente de testes** e manda o **token** por e-mail.
4. Fazemos a integração e os testes no ambiente de validação.
5. **Produção:** token de produção. O sistema entra na lista de "Sistemas Eletrônicos de Compras integrados ao Transferegov.br", publicada no portal.

## 3. A API (lida no swagger de validação)

- REST/JSON, com token no cabeçalho `Authorization`.
- Só **2 serviços**:
  - `POST /v1/services/public/processo-compra`: envia **e atualiza** um processo de compra ligado a um convênio em execução;
  - `GET /v1/services/public/processo-compra/consultar?numeroInstrumento&anoInstrumento&numeroProcesso&anoProcesso[&situacaoMaisBrasil]`: consulta o que foi enviado.

**O que se envia** (ProcessoCompra):

| Grupo | Campos |
|---|---|
| Vínculo com o convênio | `tipoInstrumento`=CONVENIO, `numeroInstrumento`, `anoInstrumento`, `tipoTransferencia`=VOLUNTARIAS |
| Ente | `uf`, `codigoMunicipio` (IBGE), `cpfUsuario` (agente/comissão responsável) |
| Processo | `numero`, `ano`, `numeroProcesso`, `objeto`, `justificativa`, `valorGlobal` |
| Enquadramento | `modalidade` (DISPENSA, PREGAO, CONCORRENCIA, INEXIGIBILIDADE, CONCURSO, LEILAO, DIALOGO_COMPETI…); `legislacao` (para a 14.133 o código é **`LEI14113`**, grafado assim na API); `inciso` (dispensa/inexigibilidade); `criterioJulgamento` (MP, MD, TP, MT…); `formaRealizacao` (E/P); `formaCompra` (SISPP/SRP) |
| Datas e link | `dataPublicacaoEdital`, `dataAberturaLicitacao`, `dataEncerramentoLicitacao`, `dataSolRecDispensa`, `linkEdital` |
| Situação | `situacao` (a nossa, livre) e `situacaoMaisBrasil` = EM_ANDAMENTO ou **CONCLUIDO** |
| Homologação | `dataHomologacao` e `cpfResponsavelHomologacao` (obrigatórios ao concluir) |
| Itens | `numeroItem`, `numeroLoteItem`, `descricao`, `quantidadeSolicitada`, `unidadeFornecimento`, `tipoItem` (MATERIAL/SERVICO), situação do item, data e CPF da homologação do item |
| Fornecedores por item | CPF/CNPJ, razão social, tipo (F/J/E), quantidade ofertada, valor unitário e total, desconto, **vencedor**, **posição**, marca e fabricante |

**Regra de conclusão:** o processo só conta como concluído quando `situacaoMaisBrasil` do processo **e de todos os itens** = CONCLUIDO, com preços e vencedores definidos. Deserto, fracassado e cancelado também são reportados.

## 4. O que o Portal DCP já tem e o que falta

**Já temos:** processo, itens (CATMAT/CATSER → MATERIAL/SERVICO), modalidade, `fundamento_legal` (→ `inciso`), critério, datas, propostas e ranking (→ fornecedores com posição e vencedor), homologação pela autoridade, página pública do edital (→ `linkEdital`). Também temos o **padrão de fila de envio do PNCP** (`backend/src/pncp/fila/`), que pode ser reaproveitado.

**Falta:**
1. **Vínculo do processo ao convênio:** número e ano do instrumento no Transferegov, marcado pelo órgão quando a compra usa recurso de transferência voluntária. Um processo pode ter recurso próprio e de convênio; verificar o tratamento.
2. **CPF** do agente responsável e de quem homologou (o cadastro de usuários precisa ter o CPF).
3. **Código IBGE** do município do órgão (verificar se já existe para o PNCP).
4. **Mapeamentos:** modalidade → código do Transferegov; `fundamento_legal` → `inciso`; credenciamento não tem código (verificar como tratar).
5. **Fila de envio** (reaproveitar o padrão do PNCP):
   - EM_ANDAMENTO na publicação;
   - atualizações;
   - CONCLUIDO na homologação (ou deserto/fracassado/revogado);
   - retorno real da API guardado (como fizemos na Etapa A do PNCP).
6. **Credencial por sistema** guardada cifrada (mesmo cuidado do `PNCP_ENCRYPTION_KEY`), com a troca validação → produção.

## 5. Próximos passos sugeridos

1. **Escolher o órgão cliente que vai pedir o cadastro**, de preferência uma **prefeitura** que tenha convênio ativo. Câmaras raramente recebem transferências voluntárias.
2. **Preparar o ofício** (modelo curto: pedido de cadastro do sistema externo "Portal DCP", CNPJ da Valletec, responsável técnico) e enviar para seges.api-transferegov@gestao.gov.br.
3. Enquanto o token não chega, **implementar a integração** contra o swagger de validação (entrega própria: vínculo ao convênio, CPF, IBGE, mapeamentos, fila e tela "Transferegov" no processo, ao lado do PNCP), com testes contra um simulador, como fizemos com o PNCP.
4. Recebido o token de teste: **rodar os cenários** (dispensa e pregão, em andamento → concluído, deserto) no ambiente de validação.
5. Pedir o **token de produção** e a inclusão na lista oficial de sistemas integrados.

## Fontes
- Transferegov — Sistemas de Compras: https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras
- Comunicado 07/2020 (cadastramento de sistemas): https://www.gov.br/transferegov/pt-br/comunicados/comunicados-gerais/2020/comunicado-no-07-2020-2013-orientacoes-iniciais-para-o-cadastramento-de-sistemas-proprios-ou-outros-sistemas-de-compras-eletronicas-disponiveis-no-mercado-a-plataforma-brasil
- Comunicado 40/2020 (perguntas frequentes): https://www.gov.br/transferegov/pt-br/comunicados/comunicados-gerais/2020/comunicado-no-40-2020-2013-perguntas-frequentes-2013-integracao-de-sistemas-proprios-ou-outros-sistemas-de-compras-eletronicas-disponiveis-no-mercado-a-plataforma-brasil
- Swagger (validação): https://val-siconv.np.estaleiro.serpro.gov.br/maisbrasil-api/swagger/index.html
