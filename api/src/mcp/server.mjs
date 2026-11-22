import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { eventService } from '../services/eventService.mjs';
import { registrationSchema } from '../validation/schemas.mjs';
import { AppError } from '../errors/AppError.mjs';

const result = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
function tool(work) {
  return async (input) => {
    try { return result(await work(input)); }
    catch (error) {
      return { ...result({ error: error instanceof AppError ? error.message : 'The request could not be completed' }), isError: true };
    }
  };
}

export function createMcpServer() {
  const server = new McpServer({ name: 'campus-events', version: '2.0.0' });
  for (const [name, past] of [['get_upcoming_events', false], ['get_past_events', true]]) {
    server.registerTool(name, {
      description: past ? 'List events that started before now.' : 'List events starting now or later. Use their IDs to register people.',
      inputSchema: {}, annotations: { readOnlyHint: true }
    }, tool(async () => {
      const { events } = await eventService.snapshot();
      const now = Date.now();
      return events.filter((event) => (new Date(event.startsAt).getTime() < now) === past)
        .map((event) => ({ ...event, spotsLeft: Math.max(event.capacity - event.registered, 0) }));
    }));
  }
  server.registerTool('register_for_event', {
    description: 'Register one or more people for an event ID. Ask for each person’s name and email and resolve the event with the list tools first. The whole group succeeds or nobody is registered.',
    inputSchema: {
      eventId: z.number().int().positive(),
      people: z.array(registrationSchema).min(1).max(20)
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }, tool(async ({ eventId, people }) => {
    const registrations = await eventService.registerPeople(eventId, people);
    return { eventId, registered: registrations.length, registrationIds: registrations.map((row) => row.id) };
  }));
  return server;
}
