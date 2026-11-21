import { createContext, useContext } from 'react';

/** Layout + first useful data, not GPS accuracy or map-tile availability. */
export const HomePreparationContext = createContext<{ allowed: boolean; reportPrepared: () => void } | null>(null);
export const useReportHomePrepared = () => useContext(HomePreparationContext)?.reportPrepared;
export const useHomePreparationAllowed = () => useContext(HomePreparationContext)?.allowed === true;
