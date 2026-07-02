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

const vehicleListTag = { type: 'Vehicle' as const, id: 'LIST' };
const currentUserTag = { type: 'User' as const, id: 'CURRENT' };

export const vehicleApi = baseApi.injectEndpoints({
  endpoints: (builder: BaseEndpointBuilder) => ({
    getVehicles: builder.query<Vehicle[], void>({
      query: () => '/vehicles',
      providesTags: (result: Vehicle[] | undefined) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Vehicle' as const, id })), vehicleListTag]
          : [vehicleListTag],
    }),
    createVehicle: builder.mutation<Vehicle, CreateVehiclePayload>({
      query: (body: CreateVehiclePayload) => ({
        url: '/vehicles',
        method: 'POST',
        body,
      }),
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        try {
          const { data: createdVehicle } = await queryFulfilled;

          dispatch(
            vehicleApi.util.updateQueryData('getVehicles', undefined, (draft) => {
              const alreadyExists = draft.some((vehicle) => vehicle.id === createdVehicle.id);
              if (!alreadyExists) {
                draft.unshift(createdVehicle);
              }
            }),
          );
        } catch {
          // L'erreur est gérée par le composant appelant.
        }
      },
      invalidatesTags: [vehicleListTag, currentUserTag],
    }),
    updateVehicle: builder.mutation<Vehicle, { id: string; data: UpdateVehiclePayload }>({
      query: ({ id, data }: { id: string; data: UpdateVehiclePayload }) => ({
        url: `/vehicles/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }: { id: string }) => [
        { type: 'Vehicle', id },
        vehicleListTag,
        currentUserTag,
      ],
    }),
    deleteVehicle: builder.mutation<{ message: string }, string>({
      query: (id: string) => ({
        url: `/vehicles/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id: string) => [
        { type: 'Vehicle', id },
        vehicleListTag,
        currentUserTag,
      ],
    }),
  }),
});

export const {
  useGetVehiclesQuery,
  useCreateVehicleMutation,
  useUpdateVehicleMutation,
  useDeleteVehicleMutation,
} = vehicleApi;

