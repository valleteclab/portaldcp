// Teste do cálculo de ano comercial
const hoje = new Date(); // 09/03/2026
console.log('Hoje:', hoje);

// Exemplo: contrato de 01/01/2025 a 31/12/2025
const vigenciaInicio = new Date('2025-01-01');
const vigenciaFim = new Date('2025-12-31');

console.log('Vigência Início:', vigenciaInicio);
console.log('Vigência Fim:', vigenciaFim);

// Cálculo atual do código
const diffMeses = (vigenciaFim.getFullYear() - vigenciaInicio.getFullYear()) * 12 + 
                 (vigenciaFim.getMonth() - vigenciaInicio.getMonth()) + 1;

console.log('diffMeses (total de meses):', diffMeses);
console.log('totalDias (diffMeses * 30):', diffMeses * 30);

// Cálculo dos meses executados
let mesesExecutados = (hoje.getFullYear() - vigenciaInicio.getFullYear()) * 12 + 
                      (hoje.getMonth() - vigenciaInicio.getMonth());

console.log('mesesExecutados (bruto):', mesesExecutados);

if (mesesExecutados === 0 && hoje.getDate() >= vigenciaInicio.getDate()) {
  mesesExecutados = 1;
}

console.log('mesesExecutados (ajustado):', mesesExecutados);

const mesesExecutadosLimitados = Math.min(mesesExecutados, diffMeses);
const diasExecutados = mesesExecutadosLimitados * 30;
const diasRestantes = (diffMeses * 30) - diasExecutados;

console.log('Resultado final:');
console.log('- total_dias:', diffMeses * 30);
console.log('- dias_executados:', diasExecutados);
console.log('- dias_restantes:', diasRestantes);
console.log('- meses_executados:', Math.floor(diasExecutados / 30));
console.log('- dias_executados_extra:', diasExecutados % 30);
console.log('- meses_restantes:', Math.floor(diasRestantes / 30));
console.log('- dias_restantes_extra:', diasRestantes % 30);
