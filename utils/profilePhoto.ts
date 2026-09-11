import { Image } from 'react-native';

export const PROFILE_PHOTO_MAX_EDGE = 1024;

export function chooseProfilePictureSize(sizes: string[]): string | undefined {
  const available = sizes.flatMap((size) => {
    const match = /^(\d+)x(\d+)$/.exec(size);
    if (!match) return [];
    const width = Number(match[1]), height = Number(match[2]);
    return width > 0 && height > 0 ? [{ size, edge: Math.max(width, height), pixels: width * height }] : [];
  }).sort((a, b) => a.pixels - b.pixels);
  const bounded = available.filter((item) => item.edge <= 2048);
  return bounded[bounded.length - 1]?.size ?? available[0]?.size;
}

export function getProfilePhotoSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Cette photo ne peut pas être ouverte. Choisissez une autre photo.');
  }
  const ratio = Math.min(1, PROFILE_PHOTO_MAX_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** Resize before preview/upload; never crop the user's photo or overwrite the original. */
export async function prepareProfilePhoto(uri: string): Promise<string> {
  const { width, height } = await Image.getSize(uri);
  // Lazy loading lets older development clients start even without the new native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  const context = ImageManipulator.manipulate(uri);
  let image: import('expo-image-manipulator').ImageRef | undefined;
  try {
    context.resize(getProfilePhotoSize(width, height));
    image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    return result.uri;
  } finally {
    image?.release();
    context.release();
  }
}
