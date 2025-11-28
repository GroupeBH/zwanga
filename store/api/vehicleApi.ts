import { baseApi } from './baseApi';
import type { Vehicle } from '../../types';
import type { BaseEndpointBuilder } from './types';

type CreateVehiclePayload = {
  brand: string;
  model: string;
  color: string;
  licensePlate: string;
  photoUrl?: string;
};

type UpdateVehiclePayload = Partial<CreateVehiclePayload> & {
  isActive?: boolean;
};

export const vehicleApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    getVehicles: builder.query<Vehicle[], void>({
      query: () => '/vehicles',
      providesTags: (result: Vehicle[] | undefined) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Vehicle' as const, id })), 'Vehicle']
          : ['Vehicle'],
    }),
    createVehicle: builder.mutation<Vehicle, CreateVehiclePayload>({
      query: (body: CreateVehiclePayload) => ({
        url: '/vehicles',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Vehicle', 'User'],
    }),
    updateVehicle: builder.mutation<Vehicle, { id: string; data: UpdateVehiclePayload }>({
      query: ({ id, data }: { id: string; data: UpdateVehiclePayload }) => ({
        url: `/vehicles/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }: { id: string }) => [
        { type: 'Vehicle', id },
        'Vehicle',
        'User',
      ],
    }),
    deleteVehicle: builder.mutation<{ message: string }, string>({
      query: (id: string) => ({
        url: `/vehicles/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id: string) => [{ type: 'Vehicle', id }, 'Vehicle', 'User'],
    }),
  }),
});

export const {
  useGetVehiclesQuery,
  useCreateVehicleMutation,
  useUpdateVehicleMutation,
  useDeleteVehicleMutation,
} = vehicleApi;

