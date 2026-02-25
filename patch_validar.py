# patch_validar.py
path = "frontend/src/app/orgao/almoxarifado/requisicoes/nova/page.tsx"
with open(path, "r", encoding="utf-8") as f:
    c = f.read()

old = """          } else {
            if (!descricaoOS.trim()) return 'Informe a descrição/objeto da OS';
          }"""

new = """          } else if (usarEtapasCronograma) {
            if (!modoOS) return 'Selecione o tipo de ordem (Global ou por Demanda)';
            if (modoOS === 'ORDEM_DEMANDA') {
              const temAlgum = etapasOSDemanda.some(d => (d.valor_solicitado ?? 0) > 0);
              if (!temAlgum) return 'Informe o valor de pelo menos uma etapa na Ordem por Demanda';
            }
          } else {
            if (!descricaoOS.trim()) return 'Informe a descrição/objeto da OS';
          }"""

# Need more context - the "} else {" might appear multiple times
# Use the one that comes right after the itens validation
marker = "if (!temAlgum) return 'Informe a quantidade de pelo menos um item na Ordem por Demanda';"
if marker in c and old in c:
    # Find the occurrence that is in the validarEtapa block (after the marker)
    idx = c.find(marker)
    block = c[idx:idx+800]
    if "} else {" in block and "descricaoOS" in block:
        c = c.replace(old, new, 1)  # Replace first occurrence
        with open(path, "w", encoding="utf-8") as f:
            f.write(c)
        print("OK")
