# Enregistrement avec images

Ce document explique comment l'application gère l'envoi des images lors de l'enregistrement d'un nouvel utilisateur.

## 📸 Types d'images collectées

L'application collecte trois types d'images durant le processus d'inscription :

1. **Photo de profil** (`profilePicture`) - Optionnel
   - Image choisie par l'utilisateur depuis la caméra ou la galerie
   - Affichée dans le profil utilisateur
   - Format carré (ratio 1:1)

2. **Image de la carte d'identité** (`cniImage`) - Optionnel
   - Photo de la carte d'identité nationale scannée
   - Utilisée pour la vérification KYC (Know Your Customer)
   - Format rectangulaire (ratio 3:2)

3. **Selfie de vérification** (`selfieImage`) - Optionnel
   - Photo du visage de l'utilisateur
   - Utilisée pour vérifier la correspondance avec la carte d'identité
   - Format carré (ratio 1:1)

## 🔄 Flux d'enregistrement

### Étapes du processus

1. **Téléphone** - Saisie du numéro de téléphone
2. **SMS** - Vérification du code SMS
3. **KYC** - Saisie des informations personnelles (prénom, nom, email)
4. **Identité** - Scan de la carte d'identité et du visage
5. **Profil** - Sélection de la photo de profil et du rôle

### Collection des images

```typescript
// Étape 4: Identité
const handleIdentityComplete = (data: { idCardImage: string; faceImage: string }) => {
  setCniImage(data.idCardImage);      // Stocke l'image de la CNI
  setSelfieImage(data.faceImage);     // Stocke le selfie
  setIdentityVerified(true);
  setStep('profile');
};

// Étape 5: Profil
const handleSelectProfilePicture = async () => {
  // Permet de choisir depuis la caméra ou la galerie
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  
  if (!result.canceled && result.assets[0]) {
    setProfilePicture(result.assets[0].uri);
  }
};
```

## 📡 Envoi à l'API NestJS

### Format d'envoi

Les images sont converties en **base64** avant l'envoi à l'API :

```typescript
// Conversion des images
const imagesData = await prepareImagesForAPI({
  profilePicture: profilePicture || undefined,
  cniImage: cniImage || undefined,
  selfieImage: selfieImage || undefined,
});

// Envoi à l'API
const result = await register({
  phone,
  firstName,
  lastName,
  email: email || undefined,
  role,
  ...imagesData, // profilePicture, cniImage, selfieImage en base64
}).unwrap();
```

### Structure de la requête

```typescript
// Interface de la mutation register
register: builder.mutation<AuthResponse, {
  phone: string;
  lastName: string;
  firstName: string;
  email?: string;
  role: 'driver' | 'passenger' | 'both';
  profilePicture?: string; // Base64 de l'image
  cniImage?: string;       // Base64 de l'image
  selfieImage?: string;    // Base64 de l'image
}>
```

### Exemple de payload JSON

```json
{
  "phone": "+243812345678",
  "firstName": "Jean",
  "lastName": "Mukendi",
  "email": "jean@example.com",
  "role": "driver",
  "profilePicture": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "cniImage": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "selfieImage": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

## 🔧 Configuration backend (NestJS)

### Recommandations pour l'API

1. **Validation des images**
   ```typescript
   @IsOptional()
   @IsString()
   @MaxLength(10485760) // Max 10MB en base64
   profilePicture?: string;
   
   @IsOptional()
   @IsString()
   cniImage?: string;
   
   @IsOptional()
   @IsString()
   selfieImage?: string;
   ```

2. **Traitement des images**
   - Décoder le base64
   - Valider le format (JPEG, PNG)
   - Redimensionner si nécessaire
   - Uploader vers un service de stockage (S3, Cloudinary, etc.)
   - Stocker l'URL dans la base de données

3. **Exemple de traitement**
   ```typescript
   @Post('register')
   async register(@Body() dto: RegisterDto) {
     // Décoder et valider les images
     if (dto.profilePicture) {
       const imageBuffer = Buffer.from(dto.profilePicture, 'base64');
       const profileUrl = await this.uploadService.upload(imageBuffer, 'profiles');
       dto.profilePicture = profileUrl;
     }
     
     if (dto.cniImage) {
       const imageBuffer = Buffer.from(dto.cniImage, 'base64');
       const cniUrl = await this.uploadService.upload(imageBuffer, 'cni');
       dto.cniImage = cniUrl;
     }
     
     if (dto.selfieImage) {
       const imageBuffer = Buffer.from(dto.selfieImage, 'base64');
       const selfieUrl = await this.uploadService.upload(imageBuffer, 'selfies');
       dto.selfieImage = selfieUrl;
     }
     
     return this.authService.register(dto);
   }
   ```

## 📁 Fichiers modifiés

### Frontend

- `store/api/authApi.ts` - Ajout des champs images à la mutation register
- `app/auth.tsx` - Collecte et envoi des images
- `utils/imageHelpers.ts` - Utilitaires de conversion base64
- `components/IdentityVerification.tsx` - Composant pour scanner CNI et visage

### Utilitaires

```typescript
// utils/imageHelpers.ts
export async function prepareImagesForAPI(images: {
  profilePicture?: string;
  cniImage?: string;
  selfieImage?: string;
}): Promise<{...}> {
  // Convertit les URIs locales en base64
  // Prêt pour l'envoi à l'API
}
```

## 🔐 Sécurité

### Recommandations

1. **Taille maximale** : Limiter la taille des images à 5-10MB
2. **Format** : Accepter uniquement JPEG et PNG
3. **Validation** : Vérifier que c'est bien une image valide
4. **Stockage sécurisé** : Utiliser un service cloud avec encryption
5. **Suppression** : Implémenter une politique de rétention des images

### Permissions requises

```json
{
  "expo": {
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "L'application a besoin d'accéder à vos photos pour votre photo de profil et la vérification d'identité.",
          "cameraPermission": "L'application a besoin d'accéder à votre caméra pour prendre des photos."
        }
      ]
    ]
  }
}
```

## 🧪 Tests

### Test du flux complet

1. Lancer l'application
2. Choisir "S'inscrire"
3. Saisir le numéro de téléphone
4. Vérifier le code SMS
5. Remplir les informations KYC
6. Scanner la carte d'identité
7. Prendre un selfie
8. **Ajouter une photo de profil** (nouvelle étape)
9. Choisir le rôle
10. Terminer l'inscription

### Vérifications

- ✅ Les images sont bien capturées
- ✅ Les images sont converties en base64
- ✅ Les images sont envoyées dans la requête
- ✅ Le backend reçoit les images correctement
- ✅ Les images sont stockées et les URLs retournées

## 📚 Documentation API

### POST /auth/register

**Body**
```json
{
  "phone": "string",
  "firstName": "string",
  "lastName": "string",
  "email": "string (optional)",
  "role": "driver | passenger | both",
  "profilePicture": "string (base64, optional)",
  "cniImage": "string (base64, optional)",
  "selfieImage": "string (base64, optional)"
}
```

**Response**
```json
{
  "user": {
    "id": "string",
    "phone": "string",
    "name": "string",
    "email": "string",
    "role": "string",
    "avatar": "string (URL)",
    "identityVerified": "boolean",
    "verified": "boolean",
    "rating": 0,
    "totalTrips": 0
  },
  "accessToken": "string",
  "refreshToken": "string"
}
```

## 🎨 Interface utilisateur

### Étape Profile avec photo de profil

L'interface affiche :
- Un cercle cliquable pour la photo de profil
- Un placeholder avec icône caméra si pas de photo
- Un badge "caméra" en bas à droite pour modifier
- Un texte d'aide expliquant l'utilité
- Les cartes de sélection de rôle en dessous

### Composant IdentityVerification

Deux étapes :
1. **Scan de la carte d'identité**
   - Choix caméra ou galerie
   - Prévisualisation avec possibilité de reprendre
   
2. **Scan du visage**
   - Caméra uniquement
   - Prévisualisation circulaire
   - Validation automatique

## 🚀 Prochaines étapes

1. Implémenter l'upload côté backend
2. Ajouter la compression d'images côté frontend
3. Implémenter le redimensionnement automatique
4. Ajouter la validation de format d'image
5. Gérer les erreurs d'upload réseau
6. Ajouter un indicateur de progression d'upload
7. Implémenter le retry automatique en cas d'échec

## 📞 Support

Pour toute question ou problème, contactez l'équipe de développement.

