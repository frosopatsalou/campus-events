import { Op } from 'sequelize';
import { MailJob } from '../models/index.mjs';
import { withDatabase } from './eventRepository.mjs';
export const mailRepository = {
  due: () => withDatabase(async () => (await MailJob.findAll({
    where: { sentAt: null, nextAttemptAt: { [Op.lte]: new Date() } },
    order: [['id', 'ASC']], limit: 20
  })).map((job) => job.toJSON())),
  sent: (id) => withDatabase(() => MailJob.update({ sentAt: new Date() }, { where: { id } })),
  retry: (job) => withDatabase(() => MailJob.update({
    attempts: job.attempts + 1,
    nextAttemptAt: new Date(Date.now() + Math.min(3600000, 5000 * 2 ** Math.min(job.attempts, 10)))
  }, { where: { id: job.id } }))
};
