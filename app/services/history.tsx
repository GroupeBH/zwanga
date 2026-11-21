import React, { useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { useGetMyProCasesQuery } from '@/store/api/proServicesApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { ServiceLayout, ServiceButton, s } from '@/features/pro-services/ServiceLayout';
import { ServiceCaseLink } from '@/features/pro-services/ServiceCatalogue';
import { proError } from '@/features/pro-services/model';

export default function ServiceHistoryScreen() {
  const active = useScreenIsActive(), enabled = useDisplayReadsEnabled(active);
  const [cursor, setCursor] = useState<string>();
  const cases = useGetMyProCasesQuery(cursor, { skip: !enabled, refetchOnMountOrArgChange: 30 });
  return <ServiceLayout title="Mes dossiers">
    {cases.isFetching && <ActivityIndicator accessibilityLabel="Chargement des dossiers" />}
    {cases.isError && <Text accessibilityRole="alert" style={s.error}>{proError(cases.error)}</Text>}
    <ServiceButton title="Actualiser mes dossiers" secondary disabled={!enabled} busy={cases.isFetching} onPress={() => { if (enabled) void cases.refetch(); }} />
    {!cases.isFetching && !cases.isError && !cases.currentData?.items.length && <Text style={s.text}>Aucun dossier pour le moment.</Text>}
    {cases.currentData?.items.map(item => <ServiceCaseLink key={item.id} item={item} />)}
    {!!cases.currentData?.nextCursor && <ServiceButton title="Dossiers suivants" secondary disabled={!enabled || cases.isFetching} onPress={() => setCursor(cases.currentData?.nextCursor ?? undefined)} />}
    {!!cursor && <ServiceButton title="Revenir aux plus récents" secondary onPress={() => setCursor(undefined)} />}
  </ServiceLayout>;
}
