import type { DriverCategory } from '@/types';

export const DRIVER_CATEGORIES = [
  { value: 'private', label: 'Conducteur privé', hint: 'Transport hors activité taxi' },
  { value: 'transport', label: 'Taxi / moto-taxi', hint: 'Transport de passagers comme activité' },
] as const;

export function readDriverCategory(value: unknown): DriverCategory | null {
  return value === 'private' || value === 'transport' ? value : null;
}
export const driverCategoryLabel = (value: unknown) => DRIVER_CATEGORIES.find(item => item.value === value)?.label;
