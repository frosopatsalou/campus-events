import { mailRepository } from '../repositories/mailRepository.mjs';
import { logger } from '../config/logger.mjs';
import { env } from '../config/env.mjs';
export function createMailWorker(sender, repository = mailRepository) {
  let active;
  let timer;
  async function deliver() {
    for (const job of await repository.due()) {
      try {
        await sender.send(job);
        await repository.sent(job.id);
      } catch {
        await repository.retry(job);
        logger.warn('Confirmation email deferred', { jobId: job.id, attempts: job.attempts + 1 });
      }
    }
  }
  function runOnce() {
    active ??= deliver().finally(() => { active = undefined; });
    return active;
  }
  return {
    runOnce,
    start() {
      const tick = () => runOnce().catch(() => logger.error('Mail queue could not be processed'));
      tick();
      timer = setInterval(tick, env.MAIL_POLL_MS);
      timer.unref();
    },
    async stop() { clearInterval(timer); await active; sender.close?.(); }
  };
}
