import { baseApi } from './baseApi';
import type { Vehicle } from '../../types';

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
  endpoints: (builder) => ({
    getVehicles: builder.query<Vehicle[], void>({
      query: () => '/vehicles',
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Vehicle' as const, id })), 'Vehicle']
          : ['Vehicle'],
    }),
    createVehicle: builder.mutation<Vehicle, CreateVehiclePayload>({
      query: (body) => ({
        url: '/vehicles',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Vehicle', 'User'],
    }),
    updateVehicle: builder.mutation<Vehicle, { id: string; data: UpdateVehiclePayload }>({
      query: ({ id, data }) => ({
        url: `/vehicles/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Vehicle', id }, 'Vehicle', 'User'],
    }),
    deleteVehicle: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/vehicles/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [{ type: 'Vehicle', id }, 'Vehicle', 'User'],
    }),
  }),
});

export const {
  useGetVehiclesQuery,
  useCreateVehicleMutation,
  useUpdateVehicleMutation,
  useDeleteVehicleMutation,
} = vehicleApi;

