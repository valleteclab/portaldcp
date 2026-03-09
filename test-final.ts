// Teste FINAL do cálculo de ano comercial
const hoje = new Date('2026-03-09'); // 09/03/2026
console.log('Hoje:', hoje.toLocaleDateString('pt-BR'));

// Exemplo do usuário: 22/03/2025 a 22/03/2026
const vigenciaInicio = new Date('2025-03-22');
const vigenciaFim = new Date('2026-03-22');

console.log('Vigência Início:', vigenciaInicio.toLocaleDateString('pt-BR'));
console.log('Vigência Fim:', vigenciaFim.toLocaleDateString('pt-BR'));

// Cálculo FINAL com ano comercial preciso
const totalDias = 360;
let diasExecutados = 0;

if (hoje >= vigenciaInicio) {
  const dataFimExecucao = hoje > vigenciaFim ? vigenciaFim : hoje;
  
  // Se mesmo mês
  if (vigenciaInicio.getFullYear() === dataFimExecucao.getFullYear() && 
      vigenciaInicio.getMonth() === dataFimExecucao.getMonth()) {
    diasExecutados = Math.min(dataFimExecucao.getDate() - vigenciaInicio.getDate() + 1, 30);
  } else {
    // Calcular usando ano comercial
    const anoInicio = vigenciaInicio.getFullYear();
    const mesInicio = vigenciaInicio.getMonth();
    const diaInicio = vigenciaInicio.getDate();
    
    const anoFim = dataFimExecucao.getFullYear();
    const mesFim = dataFimExecucao.getMonth();
    const diaFim = dataFimExecucao.getDate();
    
    // Dias no primeiro mês (ano comercial)
    const diasPrimeiroMes = Math.min(30 - diaInicio + 1, 30);
    
    // Meses completos no meio
    let mesesCompletos = 0;
    if (anoFim > anoInicio || mesFim > mesInicio + 1) {
      mesesCompletos = (anoFim - anoInicio) * 12 + (mesFim - mesInicio - 1);
    }
    
    // Dias no último mês (ano comercial)
    const diasUltimoMes = Math.min(diaFim, 30);
    
    diasExecutados = diasPrimeiroMes + (mesesCompletos * 30) + diasUltimoMes;
  }
  
  diasExecutados = Math.min(diasExecutados, 360);
}

const diasRestantes = 360 - diasExecutados;

console.log('\nCálculo detalhado:');
console.log('- Dia início:', vigenciaInicio.getDate());
console.log('- Dia fim:', hoje.getDate());
console.log('- diasPrimeiroMes:', Math.min(30 - 22 + 1, 30));
console.log('- mesesCompletos:', (2026 - 2025) * 12 + (2 - 3 - 1));
console.log('- diasUltimoMes:', Math.min(9, 30));
console.log('- diasExecutados:', diasExecutados);

console.log('\nResultado final:');
console.log('- total_dias:', totalDias);
console.log('- dias_executados:', diasExecutados);
console.log('- dias_restantes:', diasRestantes);
console.log('- meses_executados:', Math.floor(diasExecutados / 30));
console.log('- dias_executados_extra:', diasExecutados % 30);
console.log('- meses_restantes:', Math.floor(diasRestantes / 30));
console.log('- dias_restantes_extra:', diasRestantes % 30);

console.log('\nVerificação manual:');
console.log('- 9 dias (22-30/03/2025)');
console.log('- 11 meses (abr/2025 a fev/2026) = 330 dias');
console.log('- 9 dias (01-09/03/2026)');
console.log('- Total esperado: 9 + 330 + 9 = 348 dias');
console.log('- Total calculado:', diasExecutados, 'dias');
