import fitz
import re

doc = fitz.open('../docs/contratos/035_2025-Contrato (2).pdf')

print('='*70)
print('CONTRATO 035/2025 - EXTRATO DE ITENS')
print('='*70)
print('Contratante: Câmara Municipal de Luís Eduardo Magalhaes/BA')
print('Contratada: AIANA MARIA DE AMORIM SILVA (CNPJ 55.517.286/0001-79)')
print('Valor Total: R$ 27.499,24')
print('Objeto: Aquisicao e instalacao de cortinas persianas rolo')
print('='*70)
print('')

# Todos os itens têm a mesma descrição base
descricao_base = 'Persiana rolo, sem bando com tela solar 1%, cor bege'
valor_unitario = 114.10

# Extrair todas as linhas de todas as páginas
todas_linhas = []
for pagina_num in range(len(doc)):
    page = doc[pagina_num]
    texto = page.get_text()
    linhas = texto.split('\n')
    for linha in linhas:
        l = linha.strip()
        if l:
            todas_linhas.append((pagina_num+1, l))

# Procurar por sequência de itens
itens_encontrados = []
for i, (pag, linha) in enumerate(todas_linhas):
    # Verificar se é início de item (número seguido de Persiana ou na próxima linha)
    if re.match(r'^\d{1,3}$', linha):  # Apenas número
        num = int(linha)
        if 1 <= num <= 100:
            # Pegar próximas linhas até encontrar valor monetário ou M2
            desc = ''
            local = ''
            metragem = ''
            valor_total = ''
            fixacao = ''
            
            for j in range(i+1, min(i+10, len(todas_linhas))):
                _, texto = todas_linhas[j]
                
                if 'Persiana rolo' in texto:
                    desc = texto
                elif any(x in texto for x in ['TETO', 'PAREDE', 'EMBUTIDA']):
                    fixacao = texto
                elif 'M2' in texto and not metragem:
                    # Extrair metragem e valores
                    partes = texto.replace(',', '.').split()
                    for k, p in enumerate(partes):
                        if p.replace('.', '').isdigit():
                            if not metragem:
                                metragem = p
                            elif not valor_total:
                                valor_total = p
                elif re.search(r'R?\$?\s*\d+[.,]\d{2}', texto) and not local:
                    if not any(x in texto for x in ['M2', 'Persiana', 'TETO', 'PAREDE']):
                        local = texto
                
                if metragem and valor_total:
                    break
            
            if metragem and valor_total:
                itens_encontrados.append({
                    'num': num,
                    'fixacao': fixacao.replace('fixação: ', '').replace('.', '') if fixacao else 'N/A',
                    'm2': metragem,
                    'valor': valor_total
                })

print(f'Total de itens encontrados: {len(itens_encontrados)}')
print('')
print(f"{'Item':<6} {'Fixacao':<12} {'Metragem':<10} {'Valor Total':<15}")
print('-'*50)

for item in itens_encontrados[:75]:
    print(f"{item['num']:<6} {item['fixacao']:<12} {item['m2']:<10} R$ {item['valor']:<12}")

print('')
print(f'Descricao de todos os itens: {descricao_base}')
print(f'Valor unitario: R$ {valor_unitario:.2f}/M2')
