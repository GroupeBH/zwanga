import type { NavigationState } from '@react-navigation/native';

export const STARTUP_ROUTES = new Set([
  'index', 'splash', 'onboarding', 'background-location-disclosure',
]);
const PUBLIC_ROUTES = new Set([...STARTUP_ROUTES, 'auth-entry', 'auth']);

/** Repair only the root history, retaining active screens, params and nested navigators. */
export function getHomeRootState(state: NavigationState | undefined, hasSession: boolean): NavigationState | null {
  if (!hasSession || !state || state.type !== 'stack' || !state.routeNames.includes('(tabs)')) return null;
  const active = state.routes[state.index];
  if (!active || PUBLIC_ROUTES.has(active.name)) return null;

  const history = state.routes.slice(0, state.index + 1);
  // A later visit to Home starts a new back chain; don't expose the previous trip/form again.
  const homeIndex = history.findLastIndex(route => route.name === '(tabs)');
  const home = homeIndex >= 0 ? history[homeIndex] : { key: `${state.key}-home`, name: '(tabs)' };
  const details = history.slice(homeIndex + 1).filter(route => !PUBLIC_ROUTES.has(route.name));
  const routes = [home, ...details];
  if (routes.length === state.routes.length && routes.every((route, index) => route === state.routes[index])) return null;

  return { ...state, routes, index: routes.length - 1 };
}
