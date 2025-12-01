"""
Script para converter a planilha PCA 2025.xlsx para o formato de importação do sistema.
Cria catálogo próprio com classificações e códigos baseados na descrição.
Versão 3 - Processa TODOS os itens da planilha
"""
import pandas as pd
import re
import json
from datetime import datetime

# =============================================================================
# CATÁLOGO PRÓPRIO - CLASSIFICAÇÕES E CÓDIGOS
# =============================================================================

# Estrutura: código_classe -> (nome_classe, palavras_chave, prefixo_codigo_item)
CLASSES_SERVICOS = {
    '100': ('SERVIÇOS DE UTILIDADE PÚBLICA', ['água', 'esgoto', 'energia', 'elétrica', 'telefonia', 'internet', 'link', 'fibra', 'óptica'], 'S100'),
    '200': ('SERVIÇOS DE TECNOLOGIA DA INFORMAÇÃO', ['software', 'sistema', 'licenciamento', 'antivírus', 'informática', 'ti', 'tic', 'portal', 'site', 'web', 'digital', 'certificação', 'backup', 'nuvem', 'cloud', 'hospedagem', 'domínio', 'e-mail'], 'S200'),
    '300': ('SERVIÇOS DE CONSULTORIA E ASSESSORIA', ['consultoria', 'assessoria', 'técnico especializado', 'contábil', 'jurídico', 'auditoria', 'perícia'], 'S300'),
    '400': ('SERVIÇOS DE MANUTENÇÃO PREDIAL', ['manutenção', 'elétrica', 'hidráulica', 'ar condicionado', 'elevador', 'gerador', 'pintura', 'reparo', 'calha', 'rufo', 'fachada', 'vidro', 'porta', 'janela', 'piso', 'gesso', 'impermeabilização', 'telhado', 'cobertura'], 'S400'),
    '500': ('SERVIÇOS DE LIMPEZA E CONSERVAÇÃO', ['limpeza', 'dedetização', 'desratização', 'higienização', 'conservação', 'jardinagem', 'paisagismo'], 'S500'),
    '600': ('SERVIÇOS DE RECURSOS HUMANOS', ['terceirização', 'estagiário', 'treinamento', 'seleção', 'medicina', 'segurança do trabalho', 'e-social', 'folha', 'rh', 'capacitação', 'curso'], 'S600'),
    '700': ('SERVIÇOS DE COMUNICAÇÃO E MÍDIA', ['tv', 'rádio', 'transmissão', 'sonorização', 'áudio', 'vídeo', 'imprensa', 'jornalístico', 'coffee', 'buffet', 'evento', 'cerimonial', 'fotografia', 'filmagem'], 'S700'),
    '800': ('SERVIÇOS DE ENGENHARIA E OBRAS', ['reforma', 'obra', 'engenheiro', 'construção', 'projeto', 'energia solar', 'fotovoltaica', 'laudo', 'vistoria'], 'S800'),
    '900': ('OUTROS SERVIÇOS', ['locação', 'cópia', 'chave', 'extintor', 'multifuncional', 'impressora', 'mobiliário', 'seguro', 'vigilância', 'monitoramento', 'rastreamento', 'veículo', 'transporte', 'frete', 'correio', 'malote'], 'S900'),
}

CLASSES_MATERIAIS = {
    '1000': ('MATERIAIS DE INFORMÁTICA', ['informática', 'computador', 'notebook', 'monitor', 'teclado', 'mouse', 'servidor', 'switch', 'roteador', 'hd', 'ssd', 'memória', 'processador'], 'M1000'),
    '1100': ('MÓVEIS E EQUIPAMENTOS', ['móveis', 'mesa', 'cadeira', 'armário', 'estante', 'carrinho', 'arquivo', 'bancada', 'balcão', 'sofá', 'poltrona'], 'M1100'),
    '1200': ('EQUIPAMENTOS DE CLIMATIZAÇÃO', ['ar condicionado', 'climatização', 'ventilador', 'exaustor', 'aquecedor'], 'M1200'),
    '1300': ('EQUIPAMENTOS ELETRÔNICOS', ['eletrônico', 'microfone', 'caixa de som', 'câmera', 'tv', 'torre digital', 'projetor', 'tela', 'painel', 'led'], 'M1300'),
    '1400': ('MATERIAIS DE ESCRITÓRIO', ['uniforme', 'persiana', 'cortina', 'flores', 'arranjo', 'papel', 'caneta', 'grampeador', 'pasta'], 'M1400'),
    '1500': ('PEÇAS E COMPONENTES', ['peça', 'componente', 'elevador', 'reposição', 'acessório', 'bateria', 'fonte'], 'M1500'),
    '1600': ('INFRAESTRUTURA', ['infraestrutura', 'rack', 'cabeamento', 'rede', 'cabo', 'conector', 'patch'], 'M1600'),
}

# Contador para gerar códigos únicos de itens
contadores_codigo = {}

def classificar_item(descricao: str, categoria: str):
    """
    Classifica o item baseado na descrição e retorna:
    - codigo_classe
    - nome_classe  
    - codigo_item
    """
    descricao_lower = descricao.lower()
    
    # Escolher dicionário de classes baseado na categoria
    if 'material' in categoria.lower() or 'aquisição' in descricao_lower:
        classes = CLASSES_MATERIAIS
    else:
        classes = CLASSES_SERVICOS
    
    # Buscar a melhor classe baseada nas palavras-chave
    melhor_classe = None
    melhor_score = 0
    
    for codigo, (nome, palavras, prefixo) in classes.items():
        score = 0
        for palavra in palavras:
            if palavra in descricao_lower:
                score += 1
        if score > melhor_score:
            melhor_score = score
            melhor_classe = (codigo, nome, prefixo)
    
    # Se não encontrou, usar classe genérica
    if melhor_classe is None:
        if 'material' in categoria.lower():
            melhor_classe = ('1400', 'MATERIAIS DE ESCRITÓRIO', 'M1400')
        else:
            melhor_classe = ('900', 'OUTROS SERVIÇOS', 'S900')
    
    codigo_classe, nome_classe, prefixo = melhor_classe
    
    # Gerar código único do item
    if prefixo not in contadores_codigo:
        contadores_codigo[prefixo] = 0
    contadores_codigo[prefixo] += 1
    codigo_item = f"{prefixo}{contadores_codigo[prefixo]:04d}"
    
    return codigo_classe, nome_classe, codigo_item


# =============================================================================
# PROCESSAMENTO DO ARQUIVO EXCEL
# =============================================================================

# Ler o arquivo Excel - usando a primeira linha como cabeçalho
df = pd.read_excel('PCA 2025.xlsx')

print(f"Colunas encontradas: {list(df.columns)}")
print(f"Total de linhas: {len(df)}")

dados = []
numero_item = 0
itens_ignorados = 0

for idx, row in df.iterrows():
    # Pegar valores das colunas
    requisitante = str(row.iloc[0]) if pd.notna(row.iloc[0]) else ''
    objetivo = str(row.iloc[1]) if pd.notna(row.iloc[1]) else ''
    quantidade = str(row.iloc[2]) if pd.notna(row.iloc[2]) else ''
    expectativa = str(row.iloc[3]) if pd.notna(row.iloc[3]) else ''
    valor = row.iloc[4] if pd.notna(row.iloc[4]) else 0
    programacao = str(row.iloc[5]) if pd.notna(row.iloc[5]) else ''
    justificativa = str(row.iloc[6]) if len(row) > 6 and pd.notna(row.iloc[6]) else ''
    
    # Verificar se é uma linha de dados válida (tem objetivo e não é cabeçalho)
    if objetivo and objetivo != 'nan' and objetivo != 'OBJETIVO' and len(objetivo) > 10:
        numero_item += 1
        
        # Limpar objetivo
        objetivo_limpo = objetivo.replace('\n', ' ').replace('\r', ' ').strip()
        objetivo_limpo = re.sub(r'\s+', ' ', objetivo_limpo)  # Remove espaços múltiplos
        objetivo_lower = objetivo_limpo.lower()
        
        # Determinar categoria
        if 'aquisição' in objetivo_lower or 'compra' in objetivo_lower or 'material' in objetivo_lower:
            categoria = 'MATERIAL'
            classificacao = '1-Material'
        elif 'obra' in objetivo_lower or 'reforma' in objetivo_lower or 'construção' in objetivo_lower:
            categoria = 'SERVICO'
            classificacao = '2-Serviço'
        else:
            categoria = 'SERVICO'
            classificacao = '2-Serviço'
        
        # Classificar item e gerar códigos
        codigo_classe, nome_classe, codigo_item = classificar_item(objetivo_limpo, categoria)
        
        # Extrair valor numérico
        if isinstance(valor, (int, float)):
            valor_num = float(valor)
        else:
            valor_str = str(valor).replace('R$', '').replace('.', '').replace(',', '.').strip()
            try:
                valor_num = float(valor_str)
            except:
                valor_num = 0
        
        # Extrair quantidade
        qtd_str = str(quantidade).replace(' Meses', '').replace(' meses', '').replace('Meses', '').strip()
        try:
            # Tentar extrair número
            qtd_match = re.search(r'(\d+)', qtd_str)
            if qtd_match:
                qtd_num = float(qtd_match.group(1))
            else:
                qtd_num = 12
        except:
            qtd_num = 12
        
        # Determinar unidade de medida
        if 'meses' in str(quantidade).lower() or 'mes' in str(quantidade).lower():
            unidade = 'MES'
        elif 'unidade' in str(quantidade).lower() or 'und' in str(quantidade).lower():
            unidade = 'UND'
        else:
            unidade = 'UND'
        
        # Calcular valor unitário
        valor_unitario = valor_num / qtd_num if qtd_num > 0 else valor_num
        
        # Extrair data da expectativa
        data_match = re.search(r'(\w+)/(\d{2})', str(expectativa))
        if data_match:
            meses = {
                'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
                'abril': '04', 'maio': '05', 'junho': '06',
                'julho': '07', 'agosto': '08', 'setembro': '09',
                'outubro': '10', 'novembro': '11', 'dezembro': '12'
            }
            mes_nome = data_match.group(1).lower()
            ano = '20' + data_match.group(2)
            mes = meses.get(mes_nome, '01')
            trimestre = (int(mes) - 1) // 3 + 1
        else:
            trimestre = 1
        
        # Determinar se é renovação
        renovacao = 'SIM' if 'renovação' in objetivo_lower or 'manutenção' in programacao.lower() else 'NAO'
        
        # Limpar requisitante
        req_limpo = requisitante.split(' - ')[0].strip() if ' - ' in requisitante else requisitante.strip()
        req_limpo = req_limpo.replace('\n', ' ').replace('\r', ' ')
        req_limpo = re.sub(r'\s+', ' ', req_limpo)
        
        # Limpar justificativa
        just_limpa = justificativa.replace('\n', ' ').replace('\r', ' ').strip()
        just_limpa = re.sub(r'\s+', ' ', just_limpa)
        
        # Formato PNCP - 20 colunas
        dados.append({
            'Numero Item*': numero_item,
            'Categoria do Item*': f'2-Serviço' if categoria == 'SERVICO' else '1-Material',
            'Catálogo Utilizado*': '2-Outros',
            'Classificação do Catálogo*': f'2-Serviço' if categoria == 'SERVICO' else '1-Material',
            'Código da Classificação Superior (Classe/Grupo)*': codigo_classe,
            'Classificacao Superior Nome*': nome_classe,
            'Código do PDM do Item': '',
            'Nome do PDM do Item': '',
            'Código do Item': codigo_item,
            'Descrição do Item': objetivo_limpo[:500],
            'Unidade de Fornecimento': unidade,
            'Quantidade Estimada*': qtd_num,
            'Valor Unitário Estimado (R$)*': f'R$ {valor_unitario:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.'),
            'Valor Total Estimado (R$)*': f'R$ {valor_num:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.'),
            'Valor orçamentário estimado para o exercício (R$)*': f'R$ {valor_num:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.'),
            'Renovação Contrato*': '1-Sim' if renovacao == 'SIM' else '2-Não',
            'Data Desejada*': f'01/0{trimestre * 3}/2025' if trimestre else '01/01/2025',
            'Unidade Requisitante': req_limpo[:100],
            'Grupo Contratação Codigo': '',
            'Grupo Contratação Nome': ''
        })
    else:
        if objetivo and objetivo != 'nan':
            itens_ignorados += 1

# Criar DataFrame
df_saida = pd.DataFrame(dados)

# Salvar como CSV para o sistema (formato PNCP)
df_saida.to_csv('PCA_2025_PNCP.csv', sep=';', index=False, encoding='utf-8-sig')

# Salvar também como JSON para importação direta
with open('PCA_2025_Importacao.json', 'w', encoding='utf-8') as f:
    json.dump(dados, f, ensure_ascii=False, indent=2)

print(f'\n=== RESULTADO DA CONVERSÃO ===')
print(f'Arquivo convertido com sucesso!')
print(f'Total de itens processados: {len(dados)}')
print(f'Itens ignorados (cabeçalhos/vazios): {itens_ignorados}')

print(f'\n=== CLASSES UTILIZADAS ===')
for prefixo, qtd in sorted(contadores_codigo.items()):
    print(f'  {prefixo}: {qtd} itens')

print(f'\n=== VALOR TOTAL ===')
# Calcular valor total a partir dos valores formatados
def parse_valor(v):
    try:
        return float(v.replace('R$', '').replace('.', '').replace(',', '.').strip())
    except:
        return 0
valor_total = sum(parse_valor(item['Valor Total Estimado (R$)*']) for item in dados)
print(f'  R$ {valor_total:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.'))

print(f'\n=== PRIMEIROS 10 ITENS ===')
for item in dados[:10]:
    print(f"  {item['Numero Item*']:3d}. [{item['Código do Item']}] {item['Descrição do Item'][:60]}...")

print(f'\n=== ARQUIVOS GERADOS ===')
print(f'  - PCA_2025_PNCP.csv (formato CSV padrão PNCP)')
print(f'  - PCA_2025_Importacao.json (formato JSON para importação)')
