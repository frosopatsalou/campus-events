import { Event, Registration, MailJob } from '../models/index.mjs';
import { sequelize } from '../db/connection.mjs';

// SQLite shares one connection in tests. Serialize access so readers cannot see
// another request's uncommitted writes, and seat checks cannot race.
let tail = Promise.resolve();
export function withDatabase(work) {
  const pending = tail.then(work);
  tail = pending.catch(() => {});
  return pending;
}
const plain = (row) => row?.toJSON() ?? null;
function scoped(transaction) {
  const options = { transaction };
  return {
    summaries: async () => {
      const events = await Event.findAll({ ...options, order: [['startsAt', 'ASC']] });
      const totals = await Registration.findAll({ ...options,
        attributes: ['eventId', [sequelize.fn('COUNT', sequelize.col('id')), 'registered']],
        group: ['eventId'], raw: true
      });
      const counts = new Map(totals.map((row) => [row.eventId, Number(row.registered)]));
      return events.map((event) => ({ ...plain(event), registered: counts.get(event.id) ?? 0 }));
    },
    list: async () => (await Event.findAll({ ...options, order: [['startsAt', 'ASC']] })).map(plain),
    find: async (id) => plain(await Event.findByPk(id, options)),
    create: async (data) => plain(await Event.create(data, options)),
    update: async (id, data) => { await Event.update(data, { ...options, where: { id } }); return plain(await Event.findByPk(id, options)); },
    remove: (id) => Event.destroy({ ...options, where: { id } }),
    count: (eventId) => Registration.count({ ...options, where: { eventId } }),
    registrations: async (eventId) => (await Registration.findAll({ ...options, where: { eventId }, order: [['createdAt', 'ASC'], ['id', 'ASC']] })).map(plain),
    registered: async (eventId, email) => plain(await Registration.findOne({ ...options, where: { eventId, email } })),
    register: async (data) => plain(await Registration.create(data, options)),
    enqueue: (payload) => MailJob.create({ payload }, options)
  };
}
export const eventRepository = Object.fromEntries(Object.entries(scoped()).map(([name, fn]) => [name, (...args) => withDatabase(() => fn(...args))]));
eventRepository.transaction = (work) => withDatabase(() => sequelize.transaction((transaction) => work(scoped(transaction))));
export const checkDatabase = () => withDatabase(() => sequelize.authenticate());
