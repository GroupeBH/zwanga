import { baseApi } from './baseApi';

export type BaseEndpointBuilder = Parameters<typeof baseApi['injectEndpoints']>[0] extends {
  endpoints: (builder: infer B) => any;
}
  ? B
  : never;


