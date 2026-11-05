/** Explicit paid pilot. Synthetic questions only; usage is still subject to the configured app caps. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { createAssistantService } from '../src/modules/assistant/assistant.service.js';
import { createAssistantTools } from '../src/modules/assistant/assistant.tools.js';
import { visitorHash } from '../src/modules/assistant/assistant.repo.js';
import { getCatalog } from '../src/modules/catalog/catalog.service.js';

if (!process.argv.includes('--allow-paid')) {
  console.error(
    'This pilot makes paid OpenAI requests. Configure a key, enable the assistant, set budgets, then explicitly run with --allow-paid.'
  );
  process.exitCode = 1;
} else {
  const report = [];
  try {
    if (
      !config.assistant.enabled ||
      !config.assistant.apiKey ||
      !config.assistant.dailyBudgetMicro ||
      !config.assistant.monthlyBudgetMicro
    )
      throw new Error('Enable and configure the assistant, API key and spending limits before the paid pilot.');
    const catalog = await getCatalog();
    const pkg = catalog.packages.find((p) => p.visible !== false && !p.archived && p.kind !== 'rental');
    if (!pkg) throw new Error('A published catering package is required for this evaluation.');
    const cases = JSON.parse(
      await readFile(path.join(config.apiRoot, 'tests/fixtures/assistant-evaluation.json'), 'utf8')
    );
    const eventDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    for (const scenario of cases) {
      const toolCalls = [];
      const service = createAssistantService({
        toolsFactory: (options) => {
          const tools = createAssistantTools(options);
          const wrapped = {
            ...tools,
            get bookingDraft() {
              return tools.bookingDraft;
            },
            run: async (name, args) => {
              toolCalls.push(name);
              return tools.run.call(wrapped, name, args);
            }
          };
          return wrapped;
        }
      });
      let session;
      const started = Date.now();
      try {
        session = await service.open({});
        const question = scenario.question.replaceAll('{packageName}', pkg.name).replaceAll('{eventDate}', eventDate);
        const result = await service.answer(
          { visitorHash: visitorHash(session.visitorToken) },
          session.conversationId,
          { requestId: randomUUID(), text: question, source: 'text' }
        );
        report.push({
          id: scenario.id,
          question,
          toolCalls,
          durationMs: Date.now() - started,
          toolExpectationMet: scenario.tools.every((name) => toolCalls.includes(name)),
          review: scenario.review,
          humanVerdict: null,
          response: result.messages.at(-1)?.response
        });
      } catch (error) {
        report.push({
          id: scenario.id,
          outcome: error.code || 'unavailable',
          durationMs: Date.now() - started,
          review: scenario.review
        });
        if (error.code === 'RATE_LIMITED' || error.code === 'ASSISTANT_UNAVAILABLE') break;
      } finally {
        if (session?.visitorToken) {
          await pool.query('DELETE FROM assistant_conversations WHERE id = ?', [session.conversationId]);
          await pool.query('DELETE FROM assistant_allowances WHERE id = ?', [`g:${visitorHash(session.visitorToken)}`]);
        }
      }
    }
    const folder = path.resolve(config.apiRoot, '../../tmp/assistant-evaluation');
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, `pilot-${Date.now()}.json`);
    await writeFile(file, JSON.stringify(report, null, 2));
    console.log(`Saved ${report.length} evaluation outcomes for human review: ${file}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
