// Explicit response fixtures for the server-owned v1 journey contract.
function profileState(nextAction = 'none', overrides = {}) {
  const steps = {
    start: ['not_requested', 'not_started', 0, false],
    verify_identity: ['identity_required', 'not_started', 0, true],
    add_vehicle: ['vehicle_required', 'approved', 0, true],
    wait: ['identity_pending', 'pending', 1, true],
    activate: ['ready_to_activate', 'approved', 1, true],
    none: ['active', 'approved', 1, true],
    contact_support: ['restricted', 'approved', 1, true],
  };
  const [status, identity, activeVehicleCount, requested] = steps[nextAction];
  return { version: 1, userId: 'account', ...overrides,
    identity: { status: identity, rejectionReason: null, ...overrides.identity },
    driver: { status, nextAction, activeVehicleCount, requested, canPublish: nextAction === 'none', ...overrides.driver } };
}
module.exports = { profileState };
