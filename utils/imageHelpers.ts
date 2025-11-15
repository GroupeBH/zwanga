import * as FileSystem from 'expo-file-system/legacy';

/**
 * Convertit une image locale en base64
 * @param imageUri URI de l'image locale
 * @returns String base64 de l'image
 */
export async function convertImageToBase64(imageUri: string): Promise<string> {
  try {
    // Check if FileSystem is available
    if (!FileSystem || !FileSystem.readAsStringAsync) {
      throw new Error('FileSystem module is not available');
    }
    
    // Use string literal for encoding to avoid enum issues
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType?.Base64 || ('base64' as any),
    });
    return base64;
  } catch (error) {
    console.error('Erreur lors de la conversion de l\'image en base64:', error);
    throw error;
  }
}

/**
 * Crée un objet FormData pour l'upload d'images
 * @param images Objet contenant les URIs des images
 * @returns FormData prêt pour l'envoi
 */
export function createImageFormData(images: {
  profilePicture?: string;
  cniImage?: string;
  selfieImage?: string;
}): FormData {
  const formData = new FormData();

  if (images.profilePicture) {
    formData.append('profilePicture', {
      uri: images.profilePicture,
      type: 'image/jpeg',
      name: 'profile.jpg',
    } as any);
  }

  if (images.cniImage) {
    formData.append('cniImage', {
      uri: images.cniImage,
      type: 'image/jpeg',
      name: 'cni.jpg',
    } as any);
  }

  if (images.selfieImage) {
    formData.append('selfieImage', {
      uri: images.selfieImage,
      type: 'image/jpeg',
      name: 'selfie.jpg',
    } as any);
  }

  return formData;
}

/**
 * Prépare les images pour l'envoi à l'API
 * Convertit les URIs en base64 si nécessaire
 * @param images Objet contenant les URIs des images
 * @returns Objet avec les images en base64
 */
export async function prepareImagesForAPI(images: {
  profilePicture?: string;
  cniImage?: string;
  selfieImage?: string;
}): Promise<{
  profilePicture?: string;
  cniImage?: string;
  selfieImage?: string;
}> {
  const result: {
    profilePicture?: string;
    cniImage?: string;
    selfieImage?: string;
  } = {};

  try {
    if (images.profilePicture) {
      result.profilePicture = await convertImageToBase64(images.profilePicture);
    }

    if (images.cniImage) {
      result.cniImage = await convertImageToBase64(images.cniImage);
    }

    if (images.selfieImage) {
      result.selfieImage = await convertImageToBase64(images.selfieImage);
    }

    return result;
  } catch (error) {
    console.error('Erreur lors de la préparation des images:', error);
    throw error;
  }
}

