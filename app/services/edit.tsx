import React, { useEffect, useState } from 'react';
import type { ProCase } from '@/types/proServices';
import { ActivityIndicator, Text } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useGetProCaseQuery, useGetProOfferingsQuery } from '@/store/api/proServicesApi';
import { ServiceRequestForm } from '@/features/pro-services/ServiceRequestForm';
import { ServiceButton, ServiceLayout, s } from '@/features/pro-services/ServiceLayout';
import { proError } from '@/features/pro-services/model';

export default function EditServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const active = useScreenIsActive();
  const result = useGetProCaseQuery(id, { skip: !id || !active, refetchOnMountOrArgChange: true });
  const catalogue = useGetProOfferingsQuery(undefined, { skip: !active });
  const item = result.currentData;
  const [snapshot, setSnapshot] = useState<ProCase>();
  useEffect(() => {
    if (item?.id === id && item.canEdit && !result.isFetching && !result.isError)
      setSnapshot(previous => previous?.id === id ? previous : item);
  }, [id, item, result.isFetching, result.isError]);
  const offering = catalogue.data?.find(entry => entry.code === snapshot?.serviceCode);
  // A refetch must not erase an in-progress draft or an uncertain mutation.
  // The backend checks the snapshot timestamp again under the dossier lock.
  if (snapshot?.id === id && offering)
    return <ServiceRequestForm key={snapshot.id} existing={snapshot}
      offering={offering} initial={snapshot.application} active={active} />;
  return <ServiceLayout title="Modifier ma demande">
    {result.isFetching || catalogue.isFetching ? <ActivityIndicator /> : <>
      <Text style={s.text}>{result.isError || catalogue.isError
        ? proError(result.error ?? catalogue.error)
        : 'Cette demande ne peut pas être modifiée. Consultez le dossier ou contactez l’assistance.'}</Text>
      <ServiceButton title="Réessayer" disabled={!id || !active} onPress={() => { void result.refetch(); void catalogue.refetch(); }} />
      <ServiceButton title="Voir mon dossier" secondary onPress={() => router.replace((id ? `/services/${id}` : '/services') as Href)} />
    </>}
  </ServiceLayout>;
}
