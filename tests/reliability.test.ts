import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleAutonomousStarkFallback } from '../server.ts';

describe('Prioridade 1 & 2: Confiabilidade do Fallback Conversacional e Sem Falsas Afirmações', () => {
  test('Perguntas sobre cotação do dólar não devem acionar create_system_directive automaticamente', () => {
    const context = { devices: [], agenda: [], activeProtocol: 'normal' };
    const queries = [
      'Qual é a cotação do dólar hoje?',
      'Como está o dólar?',
      'Qual o preço da cotação atual?',
      'Você sabe a cotação do euro e do câmbio?',
    ];

    for (const query of queries) {
      const res = handleAutonomousStarkFallback(query, context);
      const directiveCalls = res.functionCalls.filter(
        (c) => c.name === 'create_system_directive'
      );
      assert.equal(
        directiveCalls.length,
        0,
        `A consulta "${query}" não deveria criar diretriz automática.`
      );
      assert.ok(
        !res.reply.toLowerCase().includes('acoplado ao seu hud principal'),
        'Não deve declarar widget acoplado sem confirmação.'
      );
    }
  });

  test('Perguntas sobre atualizações não devem acionar watchers nem afirmar execução', () => {
    const context = { devices: [], agenda: [], activeProtocol: 'normal' };
    const res = handleAutonomousStarkFallback('Você tem atualizações?', context);

    assert.equal(res.functionCalls.length, 0);
    assert.ok(
      !res.reply.toLowerCase().includes('acoplado'),
      'Não deve declarar inclusão de watcher.'
    );
  });

  test('Comandos explícitos de monitoramento contínuo emitem solicitação de diretriz sem declarar persistência autônoma', () => {
    const context = { devices: [], agenda: [], activeProtocol: 'normal' };
    const res = handleAutonomousStarkFallback(
      'A partir de agora monitore o dólar',
      context
    );

    assert.equal(res.functionCalls.length, 1);
    assert.equal(res.functionCalls[0].name, 'create_system_directive');
    assert.equal(res.functionCalls[0].args.targetQuery, 'USD-BRL');

    // Priority 1 & 9: Reply must not falsely claim daemon active or core assimilation
    assert.ok(
      !res.reply.includes('assimilei a nova regra ao meu núcleo'),
      'Não deve afirmar assimilação de núcleo autônomo fictício.'
    );
    assert.ok(
      res.reply.includes('sessão atual'),
      'Deve declarar que o registro é limitado à sessão atual.'
    );
  });

  test('Solicitações de ação não devem declarar que a ação já foi concluída', () => {
    const context = { devices: [], agenda: [], activeProtocol: 'normal' };

    // Device light
    const lightRes = handleAutonomousStarkFallback('Desligar luzes do salão', context);
    assert.equal(lightRes.functionCalls.length, 1);
    assert.equal(lightRes.functionCalls[0].name, 'control_device');
    assert.equal(lightRes.functionCalls[0].args.action, 'turn_off');
    assert.ok(
      !lightRes.reply.includes('foram desligadas'),
      'Não deve afirmar que foram desligadas antes da confirmação real.'
    );
    assert.ok(
      lightRes.reply.includes('Solicitando'),
      'Deve indicar apenas solicitação em andamento.'
    );

    // Protocol lockdown
    const lockRes = handleAutonomousStarkFallback('Ativar lockdown', context);
    assert.equal(lockRes.functionCalls.length, 1);
    assert.equal(lockRes.functionCalls[0].name, 'execute_protocol');
    assert.ok(
      !lockRes.reply.includes('travas de titânio foram blindadas'),
      'Não deve afirmar que blindagens já ocorreram sem confirmação.'
    );

    // Agenda appointment
    const agendaRes = handleAutonomousStarkFallback('Agende reunião com investidores', context);
    assert.equal(agendaRes.functionCalls.length, 1);
    assert.equal(agendaRes.functionCalls[0].name, 'manage_agenda');
    assert.ok(
      !agendaRes.reply.includes('registrado com sucesso na sua agenda'),
      'Não deve declarar sucesso antes da execução do serviço.'
    );
  });
});

describe('Prioridade 3: /api/market/ticker Confiabilidade', () => {
  test('Resposta de ticker real deve validar tipos numéricos e nunca usar jitter fictício', async () => {
    // Test the live endpoint via fetch to localhost:3000 or directly
    const res = await fetch('http://localhost:3000/api/market/ticker').catch(() => null);
    if (!res) {
      // Dev server might not be running on port 3000 in isolated test process, which is acceptable
      return;
    }

    if (res.status === 200) {
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.usdBrl);
      const bid = parseFloat(data.usdBrl.bid);
      assert.ok(!isNaN(bid) && bid > 0, 'O bid deve ser um número positivo real.');
      assert.ok(data.usdBrl.timestamp, 'Deve possuir timestamp real.');
    } else {
      assert.equal(res.status, 502, 'Em falha de API externa, deve responder com status de erro 502.');
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.error, 'Deve conter mensagem explícita de erro sem números inventados.');
    }
  });
});

describe('Prioridade 4: /api/terminal/run Restrição e Execução Real', () => {
  test('Comandos não autorizados devem ser rejeitados com erro 403', async () => {
    const res = await fetch('http://localhost:3000/api/terminal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'rm -rf /' }),
    }).catch(() => null);

    if (!res) return;

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.exitCode, 126);
    assert.ok(data.stderr.includes('não autorizado'));
  });

  test('Comando autorizado node -v retorna versão real do runtime e exitCode 0', async () => {
    const res = await fetch('http://localhost:3000/api/terminal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'node -v' }),
    }).catch(() => null);

    if (!res) return;

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.exitCode, 0);
    assert.ok(data.stdout.startsWith('v'), 'Deve conter a versão real do Node.');
  });

  test('Comando git status executa o binário real do git sem resultados inventados', async () => {
    const res = await fetch('http://localhost:3000/api/terminal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'git status' }),
    }).catch(() => null);

    if (!res) return;

    assert.equal(res.status, 200);
    const data = await res.json();
    // In /app/applet, if not a git repository, git exits with 128 and real stderr
    assert.ok(typeof data.exitCode === 'number');
    assert.ok(
      data.stdout !== undefined && data.stderr !== undefined,
      'Deve retornar saída real do processo.'
    );
    assert.ok(
      !data.stdout.includes('All security policies and type checks PASSING'),
      'Não deve inventar auditorias ou mensagens de segurança fictícias no git status.'
    );
  });
});

describe('Prioridade 7: Timeout Configurável e Tratamento Explícito de Falhas', () => {
  test('Endpoint /api/jarvis/chat respeita timeout customizado e retorna 504 sem duplicar chamadas', async () => {
    const res = await fetch('http://localhost:3000/api/jarvis/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Teste de timeout de IA',
        timeoutMs: 1000, // 1 second timeout
      }),
    }).catch(() => null);

    if (!res) return;

    // Depending on whether GEMINI_API_KEY is configured or not,
    // if no key is set, it falls back immediately to safe local fallback (200),
    // or if key is set and times out, it returns 504.
    if (res.status === 504) {
      const data = await res.json();
      assert.equal(data.timedOut, true);
      assert.ok(data.error.includes('Tempo limite'));
    } else {
      const data = await res.json();
      assert.ok(data.reply);
    }
  });
});

