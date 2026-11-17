import React from 'react';
import type { Trip, Vehicle } from '@/types';
import { TripEditModal, type TripEditModalProps } from '@/features/trip-detail/TripEditModal';

type TripsEditModalProps = Omit<TripEditModalProps,
  'trip' | 'editTripModalVisible' | 'editVehiclesLoading' | 'activeEditVehicles' |
  'editRequiresPassengerKyc' | 'setEditRequiresPassengerKyc'> & {
  editingTrip: Trip | null;
  editModalSuspended: boolean;
  vehiclesLoading: boolean;
  activeUserVehicles: Vehicle[];
};

/** Reuse the detail editor without changing list mutations or map-picker suspension. */
export function TripsEditModal(props: TripsEditModalProps) {
  return <TripEditModal {...props} trip={props.editingTrip ?? undefined}
    editTripModalVisible={Boolean(props.editingTrip) && !props.editModalSuspended}
    editVehiclesLoading={props.vehiclesLoading} activeEditVehicles={props.activeUserVehicles} />;
}
