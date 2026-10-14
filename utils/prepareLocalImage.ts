import { Image, NativeModules, Platform } from 'react-native';

type BoundedImageModule = { prepare(uri: string, maxEdge: number, quality: number): Promise<string> };

/** Android decodes at bounded resolution; iOS keeps its existing image preparation. */
export async function prepareLocalImage(uri: string, maxEdge: number, quality: number): Promise<string> {
  if (!Number.isFinite(maxEdge) || maxEdge < 1 || maxEdge > 2048 ||
      !Number.isFinite(quality) || quality < 0 || quality > 1) throw new Error('Paramètres de photo invalides.');
  if (Platform.OS === 'android') {
    const native = NativeModules.ZwangaBoundedImage as BoundedImageModule | undefined;
    if (native?.prepare) return native.prepare(uri, maxEdge, quality);
  }
  const { width, height } = await Image.getSize(uri);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('Cette photo ne peut pas être ouverte.');
  // Older binaries must not silently fall back to decoding a large original.
  if (Platform.OS === 'android' && Math.max(width, height) > 2048)
    throw new Error('Mettez Zwanga à jour ou choisissez une photo plus petite.');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  const context = ImageManipulator.manipulate(uri);
  let image: import('expo-image-manipulator').ImageRef | undefined;
  try {
    const ratio = Math.min(1, maxEdge / Math.max(width, height));
    context.resize({ width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) });
    image = await context.renderAsync();
    return (await image.saveAsync({ format: SaveFormat.JPEG, compress: quality })).uri;
  } finally {
    image?.release(); context.release();
  }
}
