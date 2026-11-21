import { baseApi } from './baseApi';
import type { CommerceCategory, CommerceContract, CommercePage, CommerceProduct, CommerceQuote } from '@/types/commerce';
const root = '/zwanga-pro';
const key = encodeURIComponent;
const api = baseApi.enhanceEndpoints({ addTagTypes: ['Commerce'] }).injectEndpoints({ endpoints: b => ({
  commerceCategories: b.query<{ items: CommerceCategory[] }, void>({ query: () => `${root}/commerce/categories` }),
  commerceProducts: b.query<CommercePage<CommerceProduct>, { categoryId?: string; after?: string }>({
    query: params => ({ url: `${root}/commerce/products`, params: { limit: 20, ...params } }),
  }),
  commerceProduct: b.query<CommerceProduct, string>({ query: id => `${root}/commerce/products/${key(id)}` }),
  commerceQuote: b.query<CommerceQuote, { id: string; mode: 'cash' | 'credit'; planId?: string }>({
    query: ({ id, ...params }) => ({ url: `${root}/commerce/products/${key(id)}/quote`, params }), keepUnusedDataFor: 0,
  }),
  commerceContracts: b.query<CommercePage<CommerceContract>, string | void>({
    query: after => ({ url: `${root}/mine`, params: { limit: 25, after: after || undefined } }), providesTags: ['Commerce'], keepUnusedDataFor: 0,
  }),
  commerceContract: b.query<CommerceContract, string>({ query: id => `${root}/mine/${key(id)}`, providesTags: (_r, _e, id) => [{ type: 'Commerce', id }], keepUnusedDataFor: 0 }),
  commerceApplications: b.query<CommercePage<{ id: string; status: string; notes: string }>, string | void>({
    query: after => ({ url: `${root}/applications`, params: { limit: 25, after: after || undefined } }), providesTags: ['Commerce'], keepUnusedDataFor: 0,
  }),
  commerceApply: b.mutation<{ id: string }, { mutationId: string; productId: string; mode: 'cash' | 'credit'; planId?: string; quoteHash: string; depositMinor: string; installments: number; period: 'week' | 'month'; notes: string; evidence: { code: string; attachmentId: string }[]; vehicleId?: string; caseId?: string }>({
    query: body => ({ url: `${root}/applications`, method: 'POST', body }), invalidatesTags: ['Commerce'],
  }),
  commerceUpload: b.mutation<{ id: string }, FormData>({ query: body => ({ url: `${root}/attachments`, method: 'POST', body }) }),
  commerceAccept: b.mutation<{ id: string }, { id: string; mutationId: string; consent: true; termsHash: string; mandateUntil?: string }>({
    query: ({ id, ...body }) => ({ url: `${root}/mine/${key(id)}/accept`, method: 'POST', body }), invalidatesTags: ['Commerce'],
  }),
  commercePay: b.mutation<{ id: string }, { id: string; mutationId: string; purpose: 'deposit' | 'repayment'; amountMinor: string }>({
    query: ({ id, ...body }) => ({ url: `${root}/mine/${key(id)}/wallet-payments`, method: 'POST', body }), invalidatesTags: ['Commerce', 'Wallet'],
  }),
  commerceSettlement: b.query<{ quoteHash: string; remainingMinor: string; amountMinor: string; discountMinor: string; validUntil: string }, string>({
    query: id => `${root}/commerce/mine/${key(id)}/settlement`, keepUnusedDataFor: 0,
  }),
  commerceSettle: b.mutation<{ id: string }, { id: string; mutationId: string; quoteHash: string }>({
    query: ({ id, ...body }) => ({ url: `${root}/commerce/mine/${key(id)}/settlement`, method: 'POST', body }), invalidatesTags: ['Commerce', 'Wallet'],
  }),
  commercePlans: b.query<{ version: number; remainingMinor: string; plans: { id: string; count: number; period: 'week' | 'month'; installments: { ordinal: number; dueAt: string; amountMinor: string }[] }[] }, string>({
    query: id => `${root}/commerce/mine/${key(id)}/plans`, keepUnusedDataFor: 0,
  }),
  commerceChangePlan: b.mutation<{ id: string }, { id: string; mutationId: string; planId: string; expectedVersion: number; expectedRemainingMinor: string }>({
    query: ({ id, ...body }) => ({ url: `${root}/commerce/mine/${key(id)}/plans`, method: 'POST', body }), invalidatesTags: ['Commerce'],
  }),
}) });
export const { useCommerceCategoriesQuery, useCommerceProductsQuery, useCommerceProductQuery, useCommerceQuoteQuery,
  useCommerceContractsQuery, useCommerceContractQuery, useCommerceApplicationsQuery, useCommerceApplyMutation,
  useCommerceUploadMutation, useCommerceAcceptMutation, useCommercePayMutation, useLazyCommerceSettlementQuery,
  useCommerceSettleMutation, useLazyCommercePlansQuery, useCommerceChangePlanMutation } = api;
