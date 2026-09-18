import type {
  SubscriptionPayment,
  SubscriptionPaymentMethod,
  WalletAccount,
  WalletLedgerEntry,
  WalletPaymentResponse,
  WalletSummary,
  WalletTransferResponse,
  WalletWithdrawal,
} from '../../types';
import { baseApi } from './baseApi';
import type { BaseEndpointBuilder } from './types';

type InitiateWalletTopUpPayload = {
  amount: number;
  method: SubscriptionPaymentMethod;
  phone?: string;
  approveUrl?: string;
  cancelUrl?: string;
  declineUrl?: string;
};

type TransferWalletPointsPayload = {
  amount: number;
  recipientUserId?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  note?: string;
};

const walletTag = { type: 'Wallet' as const, id: 'ME' };
const paymentHistoryTag = { type: 'PaymentHistory' as const, id: 'ME' };

type RawWalletAccount = Partial<WalletAccount> & {
  user_id?: string;
  account_type?: WalletAccount['type'] | string;
  pointsBalance?: number | string | null;
  points_balance?: number | string | null;
  tokenBalance?: number | string | null;
  token_balance?: number | string | null;
  availableBalance?: number | string | null;
  available_balance?: number | string | null;
  tokens?: number | string | null;
  points?: number | string | null;
  created_at?: string;
  updated_at?: string;
};

type RawWalletLedgerEntry = Partial<WalletLedgerEntry> & {
  account_id?: string;
  user_id?: string;
  account_type?: WalletLedgerEntry['accountType'] | string;
  balance_after?: number | string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  payment_transaction_id?: string | null;
  created_at?: string;
};

type RawSubscriptionPayment = Partial<SubscriptionPayment> & {
  transaction_id?: string | null;
  paymentMethod?: SubscriptionPaymentMethod | null;
  payment_method?: SubscriptionPaymentMethod | null;
  order_number?: string | null;
  status_code?: string | null;
  payment_url?: string | null;
};

type RawWalletSummary = Partial<WalletSummary> & {
  data?: unknown;
  wallet?: unknown;
  recent_entries?: RawWalletLedgerEntry[] | null;
  entries?: RawWalletLedgerEntry[] | null;
  ledger?: RawWalletLedgerEntry[] | null;
};

type RawWalletPaymentResponse = Partial<WalletPaymentResponse> & {
  data?: unknown;
  wallet?: unknown;
  walletAccount?: RawWalletAccount | null;
  wallet_account?: RawWalletAccount | null;
  transaction?: RawSubscriptionPayment | null;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' ? (value as Record<string, any>) : {};

const unwrapResponseData = (value: unknown) => {
  const root = asRecord(value);
  return root.data && typeof root.data === 'object' ? asRecord(root.data) : root;
};

const pickFirstDefined = (...values: unknown[]) =>
  values.find((value) => value !== undefined && value !== null);

const mapWalletAccount = (value: unknown): WalletAccount => {
  const account = asRecord(value) as RawWalletAccount;

  return {
    id: String(account.id ?? ''),
    userId: String(account.userId ?? account.user_id ?? ''),
    type: 'points',
    balance: pickFirstDefined(
      account.balance,
      account.pointsBalance,
      account.points_balance,
      account.tokenBalance,
      account.token_balance,
      account.availableBalance,
      account.available_balance,
      account.tokens,
      account.points,
      0,
    ) as number | string,
    currency: String(account.currency ?? 'PTS'),
    withdrawableBalance: Number(account.withdrawableBalance ?? 0),
    reservedWithdrawalBalance: Number(account.reservedWithdrawalBalance ?? 0),
    withdrawalsBlocked: account.withdrawalsBlocked === true,
    createdAt: String(account.createdAt ?? account.created_at ?? ''),
    updatedAt: String(account.updatedAt ?? account.updated_at ?? ''),
  };
};

const mapWalletLedgerEntry = (value: unknown): WalletLedgerEntry => {
  const entry = asRecord(value) as RawWalletLedgerEntry;

  return {
    id: String(entry.id ?? ''),
    accountId: String(entry.accountId ?? entry.account_id ?? ''),
    userId: String(entry.userId ?? entry.user_id ?? ''),
    accountType: 'points',
    type: (entry.type ?? 'top_up') as WalletLedgerEntry['type'],
    amount: pickFirstDefined(entry.amount, 0) as number | string,
    withdrawableAmount: entry.withdrawableAmount ?? null,
    balanceAfter: pickFirstDefined(entry.balanceAfter, entry.balance_after, 0) as number | string,
    currency: String(entry.currency ?? 'PTS'),
    relatedEntityType: entry.relatedEntityType ?? entry.related_entity_type ?? null,
    relatedEntityId: entry.relatedEntityId ?? entry.related_entity_id ?? null,
    paymentTransactionId: entry.paymentTransactionId ?? entry.payment_transaction_id ?? null,
    description: entry.description ?? null,
    createdAt: String(entry.createdAt ?? entry.created_at ?? ''),
  };
};

const mapSubscriptionPayment = (value: unknown): SubscriptionPayment => {
  const payment = asRecord(value) as RawSubscriptionPayment;

  return {
    transactionId: payment.transactionId ?? payment.transaction_id ?? null,
    method: payment.method ?? payment.paymentMethod ?? payment.payment_method ?? null,
    reference: payment.reference ?? null,
    orderNumber: payment.orderNumber ?? payment.order_number ?? null,
    status: payment.status ?? null,
    statusCode: payment.statusCode ?? payment.status_code ?? null,
    message: payment.message ?? null,
    paymentUrl: payment.paymentUrl ?? payment.payment_url ?? null,
    amount: Number(pickFirstDefined(payment.amount, 0)),
    currency: String(payment.currency ?? 'CDF'),
  };
};

const mapWalletSummary = (response: RawWalletSummary): WalletSummary => {
  const root = unwrapResponseData(response) as RawWalletSummary;
  const wallet = asRecord(root.wallet);
  const account = root.account ?? wallet.account ?? root.wallet ?? root;
  const entries =
    root.recentEntries ??
    root.recent_entries ??
    root.entries ??
    root.ledger ??
    wallet.recentEntries ??
    wallet.recent_entries ??
    wallet.entries ??
    wallet.ledger ??
    [];

  return {
    account: mapWalletAccount(account),
    recentEntries: Array.isArray(entries) ? entries.map(mapWalletLedgerEntry) : [],
    withdrawal: root.withdrawal,
  };
};

const mapWalletPaymentResponse = (response: RawWalletPaymentResponse): WalletPaymentResponse => {
  const root = unwrapResponseData(response) as RawWalletPaymentResponse;
  const wallet = asRecord(root.wallet);

  return {
    account: mapWalletAccount(
      root.account ?? wallet.account ?? root.wallet ?? root.walletAccount ?? root.wallet_account ?? root,
    ),
    payment: mapSubscriptionPayment(root.payment ?? root.transaction ?? root),
  };
};

const isWalletPaymentSucceeded = (response: WalletPaymentResponse) =>
  response.payment.status === 'succeeded';

export const walletApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder: BaseEndpointBuilder) => ({
    getWalletWithdrawals: builder.query<WalletWithdrawal[], void>({
      query: () => '/wallet/withdrawals', providesTags: [walletTag],
    }),
    requestWalletWithdrawal: builder.mutation<WalletWithdrawal, { tokens: number; phone: string; idempotencyKey: string }>({
      query: (body) => ({ url: '/wallet/withdrawals', method: 'POST', body }),
      invalidatesTags: [walletTag, paymentHistoryTag],
    }),
    checkWalletWithdrawal: builder.mutation<WalletWithdrawal, string>({
      query: (id) => ({ url: `/wallet/withdrawals/${encodeURIComponent(id)}/status`, method: 'GET' }),
      invalidatesTags: [walletTag, paymentHistoryTag],
    }),
    getMyWallet: builder.query<WalletSummary, void>({
      query: () => '/wallet/me',
      providesTags: [walletTag],
      transformResponse: (response: RawWalletSummary) => mapWalletSummary(response),
    }),
    getWalletLedger: builder.query<WalletLedgerEntry[], void>({
      query: () => '/wallet/ledger',
      providesTags: [walletTag],
      transformResponse: (
        response:
          | RawWalletLedgerEntry[]
          | { data?: unknown; entries?: RawWalletLedgerEntry[]; ledger?: RawWalletLedgerEntry[] },
      ) => {
        const root = unwrapResponseData(response);
        const entries = Array.isArray(response) ? response : (root.entries ?? root.ledger ?? []);
        return entries.map(mapWalletLedgerEntry);
      },
    }),
    initiateWalletTopUp: builder.mutation<WalletPaymentResponse, InitiateWalletTopUpPayload>({
      query: (body) => ({
        url: '/wallet/topups',
        method: 'POST',
        body,
      }),
      transformResponse: (response: RawWalletPaymentResponse) => mapWalletPaymentResponse(response),
      invalidatesTags: [walletTag, paymentHistoryTag],
    }),
    checkWalletTopUpStatus: builder.query<WalletPaymentResponse, string>({
      query: (orderNumber) => `/wallet/topups/${encodeURIComponent(orderNumber)}/status`,
      providesTags: [walletTag],
      transformResponse: (response: RawWalletPaymentResponse) => mapWalletPaymentResponse(response),
      async onQueryStarted(_orderNumber, { queryFulfilled, dispatch }) {
        try {
          const { data } = await queryFulfilled;
          if (isWalletPaymentSucceeded(data)) {
            dispatch(walletApi.util.invalidateTags([walletTag, paymentHistoryTag]));
          }
        } catch {
          // La vérification côté écran garde la référence et permettra de réessayer.
        }
      },
    }),
    transferWalletPoints: builder.mutation<WalletTransferResponse, TransferWalletPointsPayload>({
      query: (body) => ({
        url: '/wallet/transfers',
        method: 'POST',
        body,
      }),
      invalidatesTags: [walletTag],
    }),
  }),
});

export const {
  useGetMyWalletQuery,
  useGetWalletLedgerQuery,
  useInitiateWalletTopUpMutation,
  useLazyCheckWalletTopUpStatusQuery,
  useTransferWalletPointsMutation,
  useGetWalletWithdrawalsQuery,
  useRequestWalletWithdrawalMutation,
  useCheckWalletWithdrawalMutation,
} = walletApi;
