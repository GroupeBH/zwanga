import type { Trip, TripRequest } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';

export type SearchResultListItem={ kind: 'trip'; trip: Trip; }|
{ kind: 'request'; request: TripRequest; };
export const MIN_SEARCH_SEATS=1;
export const MAX_SEARCH_SEATS=4;
export const EMPTY_SEARCH_TRIPS: Trip[]=[];
export const EMPTY_SEARCH_REQUESTS: TripRequest[]=[];
export const vehicleLabel: Record<Trip['vehicleType'],string>={
  car: 'Voiture',
  moto: 'Moto',
  tricycle: 'Keke',
};
const requestVehicleLabel: Record<TripRequest['vehicleType'],string>={
  car: 'Voiture',
  motorcycle_2_wheels: 'Moto',
  motorcycle_3_wheels: 'Keke',
};
const SEARCH_STOP_WORDS=new Set([
  'a',
  'au',
  'aux',
  'chez',
  'd',
  'dans',
  'de',
  'des',
  'du',
  'en',
  'et',
  'la',
  'le',
  'les',
  'pour',
  'sur',
  'vers',
]);
export function parseNumberParam(value: unknown): number|undefined {
  const raw=Array.isArray(value)? value[0]:value;

  if(typeof raw!=='string'||raw.length===0) {
    return undefined;
  }

  const parsed=Number(raw);
  return Number.isFinite(parsed)? parsed:undefined;
}
export function clampSearchSeats(value: number|undefined) {
  if(typeof value!=='number'||!Number.isFinite(value)) {
    return MIN_SEARCH_SEATS;
  }

  return Math.min(MAX_SEARCH_SEATS,Math.max(MIN_SEARCH_SEATS,Math.floor(value)));
}
export function formatPrice(price?: number|null) {
  const safePrice=Number(price??0);

  if(!Number.isFinite(safePrice)||safePrice<=0) {
    return 'Gratuit';
  }

  return `${String(Math.round(safePrice)).replace(/\B(?=(\d{3})+(?!\d))/g,'.')} FC`;
}
export function formatDurationMinutes(startIso: string,endIso?: string|null) {
  const start=new Date(startIso).getTime();
  const end=endIso? new Date(endIso).getTime():Number.NaN;

  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) {
    return 'Durée à confirmer';
  }

  const totalMinutes=Math.max(1,Math.round((end-start)/60000));
  const hours=Math.floor(totalMinutes/60);
  const minutes=totalMinutes%60;

  if(hours>0&&minutes>0) {
    return `${hours}h ${minutes} min`;
  }

  if(hours>0) {
    return `${hours}h`;
  }

  return `${minutes} min`;
}
export function getInitials(name?: string|null) {
  if(!name) {
    return 'ZW';
  }

  return name
    .split(' ')
    .filter(Boolean)
    .slice(0,2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
export function getPlaceName(place?: Trip['departure']|TripRequest['departure']) {
  return place?.name||place?.address||'Adresse à préciser';
}
export function getVehicleName(trip: Trip) {
  if(trip.vehicle?.brand||trip.vehicle?.model) {
    return `${trip.vehicle.brand??''} ${trip.vehicle.model??''}`.trim();
  }

  return trip.vehicleInfo||vehicleLabel[trip.vehicleType||'car'];
}
function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase();
}
function getSearchTerms(value: string) {
  return Array.from(
    new Set(
      normalizeSearchText(value)
        .split(/[^a-z0-9]+/)
        .map((term) => term.trim())
        .filter((term) => term.length>=2&&!SEARCH_STOP_WORDS.has(term))
    )
  ).slice(0,8);
}
export function matchesSearch(value: string|undefined,query: string) {
  const terms=getSearchTerms(query);

  if(terms.length===0) {
    return true;
  }

  const normalizedValue=normalizeSearchText(value??'');
  return terms.some((term) => normalizedValue.includes(term));
}
export function getSafeTripId(trip: Trip|null|undefined) {
  const tripId=String(trip?.id??'').trim();
  return tripId.length>0? tripId:null;
}
export function getSafeTripRequestId(request: TripRequest|null|undefined) {
  const requestId=String(request?.id??'').trim();
  return requestId.length>0? requestId:null;
}
export function getTripRequestVehicleName(request: TripRequest) {
  return requestVehicleLabel[request.vehicleType]??'Véhicule';
}
export function formatTripRequestWindow(request: TripRequest) {
  const start=formatDateWithRelativeLabel(request.departureDateMin,true);
  const end=formatDateWithRelativeLabel(request.departureDateMax,true);

  if(start===end) {
    return start;
  }

  return `${start} - ${end}`;
}
