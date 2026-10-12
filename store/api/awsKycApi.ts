import { baseApi } from './baseApi';
import type { AwsKycSession, AwsLivenessStart } from '@/features/identity/awsKycContracts';
export const awsKycApi = baseApi.injectEndpoints({
  endpoints: builder => ({
    awsKycCapabilities: builder.query<{ enabled: boolean; consentVersion: string }, void>({
      query: () => '/users/kyc/aws/capabilities', keepUnusedDataFor: 0,
    }),
    currentAwsKyc: builder.query<AwsKycSession, void>({
      query: () => '/users/kyc/aws/sessions/current', keepUnusedDataFor: 0,
    }),
    createAwsKyc: builder.mutation<AwsKycSession, FormData>({
      query: body => ({ url: '/users/kyc/aws/sessions', method: 'POST', body, timeout: 60_000 }),
    }),
    startAwsLiveness: builder.mutation<AwsLivenessStart, string>({
      query: id => ({ url: `/users/kyc/aws/sessions/${id}/liveness`, method: 'POST' }),
    }),
    completeAwsKyc: builder.mutation<AwsKycSession, string>({
      query: id => ({ url: `/users/kyc/aws/sessions/${id}/complete`, method: 'POST' }),
    }),
  }),
});
export const { useLazyAwsKycCapabilitiesQuery, useCurrentAwsKycQuery,
  useCreateAwsKycMutation, useStartAwsLivenessMutation, useCompleteAwsKycMutation } = awsKycApi;
