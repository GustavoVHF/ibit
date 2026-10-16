import { config } from './config.js';
import { evolution } from './evolution.js';
import { createServer } from './server.js';
import { startScheduler } from './scheduler.js';
import { ensureWebhook } from './webhook.js';
import { logger } from './logger.js';

async function ensureInstanceWithRetry() {
  // A Evolution API pode demorar para subir junto com o Docker.
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const created = await evolution.ensureInstance();
      logger.info(created ? `Instância "${config.evolutionInstance}" criada. Leia o QR em /whatsapp/qr.` : `Instância "${config.evolutionInstance}" encontrada.`);
      await ensureWebhook();
      return;
    } catch (e) {
      logger.warn(`Aguardando Evolution API (${attempt}/30): ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  logger.error('Evolution API não respondeu. A automação segue rodando e tenta de novo nas próximas execuções.');
}

async function main() {
  const app = createServer();
  app.listen(config.port, () => logger.info(`Automação IBIT ouvindo na porta ${config.port}`));

  await ensureInstanceWithRetry();
  startScheduler();
}

process.on('unhandledRejection', (e) => logger.error(`unhandledRejection: ${e instanceof Error ? e.stack : String(e)}`));

main().catch((e) => {
  logger.error(`Falha ao iniciar: ${e instanceof Error ? e.stack : String(e)}`);
  process.exit(1);
});
