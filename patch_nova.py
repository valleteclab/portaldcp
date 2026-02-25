#!/usr/bin/env python3
"""Patch nova/page.tsx for etapas flow."""
path = "frontend/src/app/orgao/almoxarifado/requisicoes/nova/page.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. validarEtapa - add etapas branch
old1 = """          if (usarItensCronograma) {
            if (!modoOS) return 'Selecione o tipo de ordem (Global ou por Demanda)';
            if (modoOS === 'ORDEM_DEMANDA') {
              const temAlgum = itensOSDemanda.some(d => d.quantidade_solicitada > 0);
              if (!temAlgum) return 'Informe a quantidade de pelo menos um item na Ordem por Demanda';
            }
          } else {
            if (!descricaoOS.trim()) return 'Informe a descrição/objeto da OS';
          }"""

new1 = """          if (usarItensCronograma) {
            if (!modoOS) return 'Selecione o tipo de ordem (Global ou por Demanda)';
            if (modoOS === 'ORDEM_DEMANDA') {
              const temAlgum = itensOSDemanda.some(d => d.quantidade_solicitada > 0);
              if (!temAlgum) return 'Informe a quantidade de pelo menos um item na Ordem por Demanda';
            }
          } else if (usarEtapasCronograma) {
            if (!modoOS) return 'Selecione o tipo de ordem (Global ou por Demanda)';
            if (modoOS === 'ORDEM_DEMANDA') {
              const temAlgum = etapasOSDemanda.some(d => (d.valor_solicitado ?? 0) > 0);
              if (!temAlgum) return 'Informe o valor de pelo menos uma etapa na Ordem por Demanda';
            }
          } else {
            if (!descricaoOS.trim()) return 'Informe a descrição/objeto da OS';
          }"""

if old1 in content:
    content = content.replace(old1, new1)
    print("Patch 1 applied: validarEtapa")
else:
    print("Patch 1: old string not found")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")
