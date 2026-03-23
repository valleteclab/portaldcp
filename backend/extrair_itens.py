import fitz
import re

doc = fitz.open('../docs/contratos/035_2025-Contrato (2).pdf')

print('=== RESUMO DO CONTRATO 035/2025 ===')
print('Contratada: AIANA MARIA DE AMORIM SILVA (CNPJ 55.517.286/0001-79)')
print('Objeto: Aquisição e instalação de cortinas persianas rolo')
print('Valor Total: R$ 27.499,24')
print('Vigência: 22/12/2025 a 22/03/2026')
print('')

# Extrair usando blocks para preservar layout
todos_itens = []
for pagina_num in range(1, 8):  # Páginas 2-8 contêm os itens
    if pagina_num >= len(doc):
        break
    page = doc[pagina_num]
    
    # Extrair texto com posições
    blocks = page.get_text("blocks")
    
    # Agrupar por linhas baseado na posição Y
    linhas_y = {}
    for block in blocks:
        x0, y0, x1, y1, text, block_no = block
        y_key = round(y0, 1)  # Agrupar por posição Y aproximada
        if y_key not in linhas_y:
            linhas_y[y_key] = []
        linhas_y[y_key].append((x0, text.strip()))
    
    # Ordenar por posição Y e processar cada linha
    for y in sorted(linhas_y.keys()):
        # Ordenar por posição X (esquerda para direita)
        partes = sorted(linhas_y[y], key=lambda x: x[0])
        texto_linha = ' | '.join([p[1] for p in partes])
        
        # Procurar padrão de item: número seguido de Persiana
        if re.search(r'\b(\d{1,3})\b.*Persiana rolo', texto_linha):
            # Extrair número do item
            match_num = re.search(r'\b(\d{1,3})\b', texto_linha)
            if match_num:
                num = int(match_num.group(1))
                if 1 <= num <= 100:
                    # Limpar e formatar
                    texto_limpo = texto_linha.replace(' | ', ' ').strip()
                    if len(texto_limpo) > 20:
                        todos_itens.append({'num': num, 'linha': texto_limpo})

# Remover duplicatas e ordenar
itens_unicos = {item['num']: item for item in todos_itens}
itens_ordenados = sorted(itens_unicos.values(), key=lambda x: x['num'])

print(f'=== LISTA DE ITENS ({len(itens_ordenados)} itens) ===')
print('Todos os itens: Persiana rolo, sem bando, tela solar 1%, cor bege')
print('Valor unitário: R$ 114,10/M2')
print('')

for item in itens_ordenados:
    # Extrair metragem (padrão: número antes de M2 ou depois de medidas)
    metragem = ''
    m_match = re.search(r'(\d+[,.]?\d*)\s*M2', item['linha'])
    if m_match:
        metragem = m_match.group(1) + ' M2'
    
    # Extrair valor total do item (último valor monetário na linha)
    valores = re.findall(r'R?\$?\s*(\d+[,.]\d{2})', item['linha'])
    valor_total = valores[-1] if valores else ''
    
    print(f"Item {item['num']:>2}: {metragem:<10} - Valor: R$ {valor_total:<10} - {item['linha'][:70]}")

print('')
print(f'Total: {len(itens_ordenados)} itens')

