function nativeAppState() {
  const listeners = new Map();
  return {
    currentState: 'active',
    addEventListener(event, callback) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
      return { remove: () => listeners.get(event)?.delete(callback) };
    },
    emit(event, state) {
      if (event === 'change') this.currentState = state;
      for (const callback of listeners.get(event) ?? []) callback(state);
    },
    count: () => [...listeners.values()].reduce((sum, callbacks) => sum + callbacks.size, 0),
  };
}
module.exports = { nativeAppState };
