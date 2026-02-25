# Fix isOS references in requisicoes-os page
path = 'frontend/src/app/orgao/requisicoes-os/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Remove OS progress bar block (isOS && ...) - we only have requisitions
import re
# Pattern: from "Barra de progresso (OS)" through the closing })}  until "Requisição: atendida"
pattern = r'\s*\{/\* Barra de progresso \(OS\) \*/\}\s*\{isOS && [^}]+\}\s*\([^)]+\)[^}]*\}\s*\}\s*'
# Simpler: replace isOS && with false && to never show, and !isOS && with nothing
c = c.replace('{isOS && ', '{false && ')
c = c.replace('{!isOS && ', '{')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
