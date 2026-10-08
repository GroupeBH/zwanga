/** These alerts are already displayed by APNs/FCM (unlike headless driver invitations). */
export function isRemoteRequestAcceptanceAlert(data: Record<string, unknown> | undefined): boolean {
  return data?.type === 'trip_request_accepted' && data.ringAlert === 'request-accepted-v1';
}
