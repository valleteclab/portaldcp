/**
 * setupFilesAfterEnv do Jest e2e — roda em cada arquivo de teste, no mesmo
 * registro de módulos do teste (o singleton `pncpMock` é o mesmo que o teste
 * importa).
 */
import { pncpMock } from './pncp-mock';
import { fecharAppsAbertos } from './app';

// Boot do AppModule + criação do schema no Postgres descartável é lento
jest.setTimeout(180_000);

// O backend usa muito console.log; sem isto a saída do Jest vira ruído.
// E2E_VERBOSE=1 devolve tudo. console.warn/error continuam aparecendo.
if (process.env.E2E_VERBOSE !== '1') {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'debug').mockImplementation(() => undefined);
}

pncpMock.instalar();

afterAll(async () => {
  // App esquecido aberto mantém crons/conexões vivos e o Jest não termina
  await fecharAppsAbertos();
  pncpMock.desinstalar();
});
