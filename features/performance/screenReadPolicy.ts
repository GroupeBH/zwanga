/** Fresh cached data is reused on quick tab switches; stale reads resume on focus.
 * This controls display reads only, never mutations or payment reconciliation.
 */
export const SCREEN_READ_STALE_SECONDS = 30;

export function screenReadOptions(active: boolean) {
  return {
    skip: !active,
    pollingInterval: 0,
    refetchOnFocus: false,
    refetchOnReconnect: false,
    refetchOnMountOrArgChange: SCREEN_READ_STALE_SECONDS,
  } as const;
}
