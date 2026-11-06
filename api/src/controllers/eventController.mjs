import { eventService as service } from '../services/eventService.mjs';
export const controller = {
  health: async (_req, res) => res.json(await service.health()),
  list: async (_req, res) => res.json(await service.list()),
  detail: async (req, res) => res.json(await service.detail(req.validated.params.id)),
  create: async (req, res) => { const event = await service.create(req.validated.body); res.status(201).location('/api/events/' + event.id).json(event); },
  update: async (req, res) => res.json(await service.update(req.validated.params.id, req.validated.body)),
  remove: async (req, res) => { await service.remove(req.validated.params.id); res.status(204).send(); },
  registrations: async (req, res) => res.json(await service.registrations(req.validated.params.id)),
  register: async (req, res) => res.status(201).json(await service.register(req.validated.params.id, req.validated.body)),
  stats: async (_req, res) => res.json(await service.stats())
};
