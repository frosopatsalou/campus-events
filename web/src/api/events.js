import { request } from './client.js';
import { connectLive } from './live.js';

export const getEvents = () => request('/events');
export const getEvent = (id) => request(`/events/${id}`);
export const createEvent = (event) => request('/events', { method: 'POST', body: event });
export const deleteEvent = (id) => request(`/events/${id}`, { method: 'DELETE' });

export const getRegistrations = (eventId) => request(`/events/${eventId}/registrations`);
export const register = (eventId, participant) =>
  request(`/events/${eventId}/registrations`, { method: 'POST', body: participant });

export const getStats = () => request('/stats');
export const subscribeToEvents = (handlers) => connectLive('/api/live', handlers);
