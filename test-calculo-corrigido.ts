// Teste do cálculo CORRIGIDO de ano comercial
const hoje = new Date(); // 09/03/2026
console.log('Hoje:', hoje);

// Exemplo: contrato de 01/01/2025 a 31/12/2025
const vigenciaInicio = new Date('2025-01-01');
const vigenciaFim = new Date('2025-12-31');

console.log('Vigência Início:', vigenciaInicio);
console.log('Vigência Fim:', vigenciaFim);

// Cálculo CORRIGIDO
const diffMeses = (vigenciaFim.getFullYear() - vigenciaInicio.getFullYear()) * 12 + 
                 (vigenciaFim.getMonth() - vigenciaInicio.getMonth()) + 1;

console.log('diffMeses (bruto):', diffMeses);

// Para ano comercial, forçar 12 meses para contratos anuais
const totalDias = diffMeses === 13 ? 360 : diffMeses * 30;
console.log('totalDias (CORRIGIDO):', totalDias);

// Cálculo dos meses executados
let mesesExecutados = (hoje.getFullYear() - vigenciaInicio.getFullYear()) * 12 + 
                      (hoje.getMonth() - vigenciaInicio.getMonth());

if (mesesExecutados === 0 && hoje.getDate() >= vigenciaInicio.getDate()) {
  mesesExecutados = 1;
}

const mesesExecutadosLimitados = Math.min(mesesExecutados, 12); // Forçar limite de 12
const diasExecutados = mesesExecutadosLimitados * 30;
const diasRestantes = 360 - diasExecutados; // Total fixo de 360 dias

console.log('\nResultado CORRIGIDO:');
console.log('- total_dias:', totalDias);
console.log('- dias_executados:', diasExecutados);
console.log('- dias_restantes:', diasRestantes);
console.log('- meses_executados:', Math.floor(diasExecutados / 30));
console.log('- dias_executados_extra:', diasExecutados % 30);
console.log('- meses_restantes:', Math.floor(diasRestantes / 30));
console.log('- dias_restantes_extra:', diasRestantes % 30);
