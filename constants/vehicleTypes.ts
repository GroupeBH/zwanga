import type { TripRequestVehicleType } from '@/types';

export type RegisteredVehicleTypeOption = {
  id: TripRequestVehicleType;
  label: string;
  description: string;
  icon: 'car-sport-outline' | 'bicycle-outline' | 'car-outline';
};

export const REGISTERED_VEHICLE_TYPE_OPTIONS: RegisteredVehicleTypeOption[] = [
  {
    id: 'car',
    label: 'Voiture',
    description: 'Pour les trajets du quotidien et les bagages',
    icon: 'car-sport-outline',
  },
  {
    id: 'motorcycle_2_wheels',
    label: 'Moto à 2 roues',
    description: 'Format compact et agile',
    icon: 'bicycle-outline',
  },
  {
    id: 'motorcycle_3_wheels',
    label: 'Moto à 3 roues',
    description: 'Plus stable et plus spacieuse',
    icon: 'car-outline',
  },
];

const REGISTERED_VEHICLE_TYPE_LABELS: Record<TripRequestVehicleType, string> = {
  car: 'Voiture',
  motorcycle_2_wheels: 'Moto à 2 roues',
  motorcycle_3_wheels: 'Moto à 3 roues',
};

export function getRegisteredVehicleTypeLabel(
  type?: TripRequestVehicleType | null,
): string {
  return type ? REGISTERED_VEHICLE_TYPE_LABELS[type] : 'Type non renseigné';
}
