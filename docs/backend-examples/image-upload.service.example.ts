import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';

/**
 * Service d'upload et de traitement d'images
 * Exemple pour l'application ZWANGA
 * 
 * Installation requise:
 * npm install sharp @aws-sdk/client-s3 (ou cloudinary, etc.)
 */
@Injectable()
export class ImageUploadService {
  
  /**
   * Upload une image vers un service cloud
   * 
   * @param imageBuffer - Buffer de l'image
   * @param folder - Dossier de destination
   * @param filename - Nom du fichier
   * @returns URL de l'image uploadée
   */
  async uploadImage(
    imageBuffer: Buffer,
    folder: string,
    filename: string
  ): Promise<string> {
    try {
      // 1. Valider l'image
      await this.validateImage(imageBuffer);
      
      // 2. Optimiser l'image
      const optimizedBuffer = await this.optimizeImage(imageBuffer, folder);
      
      // 3. Upload vers le cloud
      const url = await this.uploadToCloud(optimizedBuffer, folder, filename);
      
      return url;
    } catch (error) {
      console.error('Erreur lors de l\'upload:', error);
      throw error;
    }
  }

  /**
   * Valide qu'un buffer contient bien une image valide
   */
  private async validateImage(imageBuffer: Buffer): Promise<void> {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      
      // Vérifier le format
      const allowedFormats = ['jpeg', 'jpg', 'png', 'webp'];
      if (!allowedFormats.includes(metadata.format || '')) {
        throw new Error(`Format non supporté: ${metadata.format}`);
      }
      
      // Vérifier les dimensions
      if (!metadata.width || !metadata.height) {
        throw new Error('Dimensions de l\'image invalides');
      }
      
      // Vérifier la taille
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (imageBuffer.length > maxSize) {
        throw new Error('Image trop volumineuse');
      }
    } catch (error) {
      throw new Error(`Image invalide: ${error.message}`);
    }
  }

  /**
   * Optimise une image selon son type
   */
  private async optimizeImage(
    imageBuffer: Buffer,
    folder: string
  ): Promise<Buffer> {
    const sharpInstance = sharp(imageBuffer);
    
    switch (folder) {
      case 'profiles':
        // Photo de profil: carré 400x400, qualité 80%
        return sharpInstance
          .resize(400, 400, {
            fit: 'cover',
            position: 'center',
          })
          .jpeg({ quality: 80 })
          .toBuffer();
      
      case 'cni':
        // CNI: max 1200px de large, qualité 85%
        return sharpInstance
          .resize(1200, null, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer();
      
      case 'selfies':
        // Selfie: carré 600x600, qualité 80%
        return sharpInstance
          .resize(600, 600, {
            fit: 'cover',
            position: 'center',
          })
          .jpeg({ quality: 80 })
          .toBuffer();
      
      default:
        // Par défaut: compression légère
        return sharpInstance
          .jpeg({ quality: 85 })
          .toBuffer();
    }
  }

  /**
   * Upload vers un service cloud (S3, Cloudinary, etc.)
   * Ceci est un exemple fictif - adaptez selon votre service
   */
  private async uploadToCloud(
    imageBuffer: Buffer,
    folder: string,
    filename: string
  ): Promise<string> {
    // Exemple avec AWS S3
    /*
    import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
    
    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const key = `${folder}/${filename}`;
    
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
        ACL: 'public-read',
      })
    );

    return `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;
    */

    // Exemple avec Cloudinary
    /*
    import { v2 as cloudinary } from 'cloudinary';
    
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const result = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
      {
        folder: folder,
        public_id: filename.replace(/\.[^/.]+$/, ''),
        resource_type: 'image',
      }
    );

    return result.secure_url;
    */

    // Pour l'exemple, retournons une URL fictive
    return `https://cdn.zwanga.cd/${folder}/${filename}`;
  }

  /**
   * Supprime une image du cloud
   */
  async deleteImage(imageUrl: string): Promise<void> {
    try {
      // Extraire la clé depuis l'URL
      // const key = imageUrl.replace('https://cdn.zwanga.cd/', '');
      
      // Supprimer depuis le cloud
      // await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      
      console.log(`Image supprimée: ${imageUrl}`);
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      throw error;
    }
  }

  /**
   * Génère une miniature d'une image
   */
  async generateThumbnail(
    imageBuffer: Buffer,
    size: number = 150
  ): Promise<Buffer> {
    return sharp(imageBuffer)
      .resize(size, size, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 70 })
      .toBuffer();
  }
}

/**
 * Module pour l'upload d'images
 */
import { Module } from '@nestjs/common';

@Module({
  providers: [ImageUploadService],
  exports: [ImageUploadService],
})
export class ImageUploadModule {}

