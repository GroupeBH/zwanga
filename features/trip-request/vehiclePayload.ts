/** A single choice uses the legacy contract, including during rolling deployments.
 * Never silently reduce a multi-choice request: that would change passenger consent. */
export function compatibleVehiclePayload<T extends { vehicleType?: string; vehicleTypes?: string[] }>(payload: T): T {
  if (payload.vehicleTypes?.length !== 1) return payload;
  const { vehicleTypes, ...legacy } = payload;
  return { ...legacy, vehicleType: vehicleTypes[0] } as T;
}

export function vehicleSelectionError(error: unknown): unknown {
  const value = error as { status?: unknown; data?: { message?: unknown } };
  const messages = value?.data?.message;
  if (value?.status !== 400 || !(Array.isArray(messages) ? messages : [messages])
    .some(message => message === 'property vehicleTypes should not exist')) return error;
  return { ...value, data: { ...value.data, code: 'MULTIPLE_VEHICLE_TYPES_UNAVAILABLE',
    message: 'Le serveur ne permet pas encore plusieurs types de véhicule. Choisissez un seul type puis réessayez.' } };
}
