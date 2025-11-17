import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, AuthResponseDto } from './dto/register.dto';

/**
 * Exemple de contrôleur d'authentification pour NestJS
 * Compatible avec l'application mobile ZWANGA
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Enregistrement d'un nouvel utilisateur
   * 
   * @param registerDto - Données d'enregistrement incluant les images en base64
   * @returns Utilisateur créé avec tokens JWT
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    try {
      // Traiter les images si présentes
      const processedDto = await this.processImages(registerDto);
      
      // Créer l'utilisateur
      const result = await this.authService.register(processedDto);
      
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Traite les images base64 et les upload vers un service cloud
   * 
   * @param dto - DTO contenant potentiellement des images en base64
   * @returns DTO avec les URLs des images uploadées
   */
  private async processImages(dto: RegisterDto): Promise<RegisterDto> {
    const processedDto = { ...dto };

    try {
      // Traiter la photo de profil
      if (dto.profilePicture) {
        processedDto.profilePicture = await this.uploadImage(
          dto.profilePicture,
          'profiles',
          `profile_${Date.now()}.jpg`
        );
      }

      // Traiter l'image de la CNI
      if (dto.cniImage) {
        processedDto.cniImage = await this.uploadImage(
          dto.cniImage,
          'cni',
          `cni_${Date.now()}.jpg`
        );
      }

      // Traiter le selfie
      if (dto.selfieImage) {
        processedDto.selfieImage = await this.uploadImage(
          dto.selfieImage,
          'selfies',
          `selfie_${Date.now()}.jpg`
        );
      }

      return processedDto;
    } catch (error) {
      console.error('Erreur lors du traitement des images:', error);
      throw new Error('Impossible de traiter les images');
    }
  }

  /**
   * Upload une image base64 vers un service cloud
   * 
   * @param base64String - Image en base64
   * @param folder - Dossier de destination
   * @param filename - Nom du fichier
   * @returns URL de l'image uploadée
   */
  private async uploadImage(
    base64String: string,
    folder: string,
    filename: string
  ): Promise<string> {
    try {
      // Extraire le base64 pur (enlever le préfixe data:image/...;base64,)
      const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
      
      // Convertir en Buffer
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Valider la taille (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (imageBuffer.length > maxSize) {
        throw new Error('Image trop volumineuse');
      }

      // Upload vers votre service (S3, Cloudinary, etc.)
      // Exemple avec un service fictif:
      // const uploadService = new ImageUploadService();
      // const url = await uploadService.upload(imageBuffer, folder, filename);
      
      // Pour l'exemple, retournons une URL fictive
      const url = `https://cdn.zwanga.cd/${folder}/${filename}`;
      
      return url;
    } catch (error) {
      console.error('Erreur lors de l\'upload de l\'image:', error);
      throw error;
    }
  }
}

