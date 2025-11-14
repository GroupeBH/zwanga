import { IsString, IsEmail, IsOptional, IsEnum, MaxLength, MinLength, Matches } from 'class-validator';

/**
 * DTO pour l'enregistrement d'un nouvel utilisateur
 * Compatible avec l'application mobile ZWANGA
 */
export class RegisterDto {
  @IsString()
  @MinLength(10)
  @MaxLength(15)
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Le numéro de téléphone doit être au format international' })
  phone: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(['driver', 'passenger', 'both'])
  role: 'driver' | 'passenger' | 'both';

  /**
   * Photo de profil en base64
   * Format: data:image/jpeg;base64,... ou simplement la chaîne base64
   * Taille max recommandée: 5MB
   */
  @IsOptional()
  @IsString()
  @MaxLength(10485760) // ~10MB en base64
  profilePicture?: string;

  /**
   * Image de la carte d'identité en base64
   * Utilisée pour la vérification KYC
   */
  @IsOptional()
  @IsString()
  @MaxLength(10485760)
  cniImage?: string;

  /**
   * Selfie de l'utilisateur en base64
   * Utilisé pour la vérification faciale
   */
  @IsOptional()
  @IsString()
  @MaxLength(10485760)
  selfieImage?: string;
}

/**
 * DTO de réponse après enregistrement
 */
export class AuthResponseDto {
  user: {
    id: string;
    phone: string;
    name: string;
    email?: string;
    role: string;
    avatar?: string;
    identityVerified: boolean;
    verified: boolean;
    rating: number;
    totalTrips: number;
    createdAt: Date;
  };
  accessToken: string;
  refreshToken: string;
}

