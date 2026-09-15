// One-time, body-preserving extraction of the search screen's three responsibilities.
const fs = require('node:fs');
const path = require('node:path');
const sourcePath = 'app/search.tsx';
const source = fs.readFileSync(sourcePath, 'utf8').replaceAll('\r\n', '\n');
function between(text, start, end) {
  const left = text.indexOf(start), right = text.indexOf(end, left + start.length);
  if (left < 0 || right < left) throw new Error(`Missing range ${start}`);
  return text.slice(left, right);
}
const head = source.slice(0, source.indexOf('export default function SearchScreen()'));
let controller = between(source, '  const router = useRouter();', '  const renderSearchResult =');
const navigationState = between(controller, '  const [openingTripId,', '  const [searchTripsByCoordinates,');
const focus = between(controller, '  useFocusEffect(', '  const {\n    data: remoteTrips,');
const navigationActions = controller.slice(controller.indexOf('  const handleOpenTrip ='));
const results = between(controller, '  const baseTrips =', '  const requestSearchError =');
const renderItem = between(source, '  const renderSearchResult =', '  const searchResultData =');
const resultSummary = between(source, '  const searchResultData =', '  return (\n    <SafeAreaView');
const render = source.slice(source.indexOf('  return (\n    <SafeAreaView'));
controller = controller.replace(navigationState,
  '  const { openingTripId, openingRequestId, handleOpenTrip, handleOpenTripRequest } = useSearchNavigation({ router, showDialog });\n');
controller = controller.replace(focus, '').replace(navigationActions, '').replace(results,
  '  const { baseTrips, filteredTrips, filteredTripRequests } = useSearchResults({\n' +
  '    advancedTrips, remoteTrips, storedTrips, searchMode, departure, arrival, desiredSeats,\n' +
  '    sortMode, driverCoordinate, availableTripRequests, isDriverAccount, currentUser,\n' +
  '  });\n\n');
const exposed = [
  'router', 'firstName', 'avatarUri', 'openingTripId', 'openingRequestId',
  'handleOpenTrip', 'handleOpenTripRequest', 'searchResultData', 'draftDeparture',
  'draftArrival', 'setDraftDeparture', 'setDraftArrival', 'desiredSeats', 'updateDesiredSeats',
  'searchMode', 'setSearchMode', 'sortMode', 'setSortMode', 'resultsCountLabel', 'isRefreshingResults',
  'isLoadingResults', 'currentError', 'handleRetry', 'handleApplySearch', 'filteredTrips',
  'filteredTripRequests', 'handleCreateTripRequest', 'isDriverAccount',
];
const exposedLines = [];
for (let index = 0; index < exposed.length; index += 4) exposedLines.push(`    ${exposed.slice(index, index + 4).join(', ')},`);
const files = {
  'hooks/search/useSearchNavigation.ts': `import { useCallback, useRef, useState } from 'react';
import { InteractionManager, Keyboard, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { useRouter } from 'expo-router';
import type { useDialog } from '@/components/ui/DialogProvider';
import type { Trip, TripRequest } from '@/types';
import { trackEvent } from '@/services/analytics';
import { getSafeTripId, getSafeTripRequestId } from '@/features/search/searchModel';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';

interface Params {
  router: ReturnType<typeof useRouter>;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
}

export function useSearchNavigation({ router, showDialog }: Params) {
${navigationState}${focus}${navigationActions}  return { openingTripId, openingRequestId, handleOpenTrip, handleOpenTripRequest };
}
`,
  'hooks/search/useSearchResults.ts': `import { useMemo } from 'react';
import type { SearchMode, SearchSortMode as SortMode } from '@/components/search/SearchResultsToolbar';
import type { Trip, TripRequest, User } from '@/types';
import type { selectUserCoordinates } from '@/store/selectors';
import { rankRequestsByProximity } from '@/features/trip-request/requestPriority';
import { EMPTY_SEARCH_TRIPS, EMPTY_SEARCH_REQUESTS, getSafeTripId, getSafeTripRequestId, matchesSearch } from '@/features/search/searchModel';

interface Params {
  advancedTrips: Trip[] | null;
  remoteTrips: Trip[] | undefined;
  storedTrips: Trip[];
  searchMode: SearchMode;
  departure: string;
  arrival: string;
  desiredSeats: number;
  sortMode: SortMode;
  driverCoordinate: ReturnType<typeof selectUserCoordinates>;
  availableTripRequests: TripRequest[];
  isDriverAccount: boolean;
  currentUser: User | undefined;
}

export function useSearchResults({ advancedTrips, remoteTrips, storedTrips, searchMode,
  departure, arrival, desiredSeats, sortMode, driverCoordinate, availableTripRequests,
  isDriverAccount, currentUser }: Params) {
${results}  return { baseTrips, filteredTrips, filteredTripRequests };
}
`,
  'hooks/search/useSearchController.ts': `import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDialog } from '@/components/ui/DialogProvider';
import type { SearchMode, SearchSortMode as SortMode } from '@/components/search/SearchResultsToolbar';
import type { Trip } from '@/types';
import { useAppSelector } from '@/store/hooks';
import { selectTrips, selectUserCoordinates } from '@/store/selectors';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useGetAvailableTripRequestsQuery } from '@/store/api/tripRequestApi';
import { useGetTripsQuery, useSearchTripsByCoordinatesMutation, type TripSearchParams, type TripSearchByPointsPayload } from '@/store/api/tripApi';
import { trackEvent } from '@/services/analytics';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { MIN_SEARCH_SEATS, EMPTY_SEARCH_REQUESTS, clampSearchSeats, parseNumberParam, type SearchResultListItem } from '@/features/search/searchModel';
import { useSearchNavigation } from './useSearchNavigation';
import { useSearchResults } from './useSearchResults';

export function useSearchController() {
${controller}${resultSummary}  return {
${exposedLines.join('\n')}
  };
}
`,
};
const screen = `import { useSearchController } from '@/hooks/search/useSearchController';\n${head}export default function SearchScreen() {\n  const {\n${exposedLines.join('\n')}\n  } = useSearchController();\n${renderItem}${render}`;
for (const [file, content] of Object.entries(files)) {
  if (fs.existsSync(file)) throw new Error(`Refusing to overwrite ${file}`);
  if (content.split('\n').length > 400) throw new Error(`Module over budget: ${file}`);
}
if (screen.split('\n').length > 400) throw new Error('Screen over budget');
if (process.argv.includes('--write')) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  fs.writeFileSync(sourcePath, screen);
}
console.log(JSON.stringify(Object.fromEntries(Object.entries({ ...files, [sourcePath]: screen }).map(([file, content]) => [file, content.split('\n').length]))));
