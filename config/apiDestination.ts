export const PRODUCTION_API_URL = 'https://compute-api.zwanga-app.com/api/v1';
// RFC-reserved domain: a missing development/staging config can never mutate production.
export const UNCONFIGURED_API_URL = 'https://configuration-missing.invalid/api/v1';
export function apiDestination(explicit: unknown, dev: boolean, environment: unknown) {
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  return dev || environment === 'development' || environment === 'staging' || environment === 'test'
    ? UNCONFIGURED_API_URL : PRODUCTION_API_URL;
}
