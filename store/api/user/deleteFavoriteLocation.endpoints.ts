import { favoriteLocationsListTag } from './identityContracts';
import { removeFavoriteLocationNote } from './profileMapper';
import type { BaseEndpointBuilder } from '../types';

export function buildDeleteFavoriteLocationEndpoints(builder: BaseEndpointBuilder) {
  return {
// Supprimer un lieu favori
    deleteFavoriteLocation: builder.mutation<{ message: string }, string>({
      queryFn: async (id: string, _api, _extraOptions, baseQuery) => {
        const result = await baseQuery({
          url: `/favorite-places/${id}`,
          method: 'DELETE',
        });

        if (result.error) {
          return { error: result.error } as any;
        }

        await removeFavoriteLocationNote(id);

        return { data: result.data as { message: string } } as any;
      },
      invalidatesTags: (_result, _error, id) => [
        { type: 'FavoriteLocations', id },
        favoriteLocationsListTag,
      ],
    })
  };
}
