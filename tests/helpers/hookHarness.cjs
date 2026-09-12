// Deterministic hook lifecycle harness. Native rendering remains a device-test concern.
function hookHarness(id = 'form') {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const changed = (previous, next) => !previous || !next || next.some((value, index) => !Object.is(value, previous[index]));
  const react = {
    useId: () => id,
    useState(initial) {
      const index = cursor++;
      slots[index] ??= {
        value: typeof initial === 'function' ? initial() : initial,
        setter: (next) => {
          slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
        },
      };
      return [slots[index].value, slots[index].setter];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (changed(slots[index]?.dependencies, dependencies)) {
        slots[index] = { value: factory(), dependencies };
      }
      return slots[index].value;
    },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (changed(slots[index]?.dependencies, dependencies)) {
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  return {
    react,
    render(hook) {
      cursor = 0;
      effects = [];
      const result = hook();
      for (const effect of effects) effect();
      return result;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
module.exports = { hookHarness };
