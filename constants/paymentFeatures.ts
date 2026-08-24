export const ELECTRONIC_PAYMENTS_ENABLED = true;

const configuredPointValueCdf = Number(
  process.env.EXPO_PUBLIC_ZWANGA_POINT_VALUE_CDF ?? 100,
);

// Doit rester aligne avec ZWANGA_POINT_VALUE_CDF cote backend.
export const ZWANGA_POINT_VALUE_CDF =
  Number.isFinite(configuredPointValueCdf) && configuredPointValueCdf > 0
    ? configuredPointValueCdf
    : 100;
