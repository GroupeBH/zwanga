# Changelog - Ajout des images lors de l'enregistrement

## 🎯 Objectif

Permettre l'envoi de 3 types d'images lors de l'enregistrement d'un utilisateur :
- **Photo de profil** (`profilePicture`)
- **Image de la CNI** (`cniImage`) 
- **Selfie de vérification** (`selfieImage`)

## ✅ Changements effectués

### 1. API Layer (`store/api/authApi.ts`)

**Modifications :**
- Ajout des champs optionnels `profilePicture`, `cniImage`, et `selfieImage` à l'interface de la mutation `register`
- Les images sont envoyées en format base64 à l'API NestJS

```typescript
register: builder.mutation<AuthResponse, {
  phone: string;
  lastName: string;
  firstName: string;
  email?: string;
  role: 'driver' | 'passenger' | 'both';
  profilePicture?: string; // ✨ NOUVEAU
  cniImage?: string;       // ✨ NOUVEAU
  selfieImage?: string;    // ✨ NOUVEAU
}>
```

### 2. Utilitaires (`utils/imageHelpers.ts`)

**Nouveau fichier créé** contenant :
- `convertImageToBase64()` - Convertit une URI locale en base64
- `prepareImagesForAPI()` - Prépare toutes les images pour l'envoi
- `createImageFormData()` - Crée un FormData (alternative pour multipart)

**Dépendance :**
- Utilise `expo-file-system` (déjà installé)

### 3. Écran d'authentification (`app/auth.tsx`)

**Modifications :**

#### États ajoutés
```typescript
const [profilePicture, setProfilePicture] = useState<string | null>(null);
const [cniImage, setCniImage] = useState<string | null>(null);
const [selfieImage, setSelfieImage] = useState<string | null>(null);
```

#### Handlers modifiés

**`handleIdentityComplete`** - Capture les images de la CNI et du selfie
```typescript
const handleIdentityComplete = (data: { idCardImage: string; faceImage: string }) => {
  setCniImage(data.idCardImage);      // ✨ Stocke la CNI
  setSelfieImage(data.faceImage);     // ✨ Stocke le selfie
  setIdentityVerified(true);
  setStep('profile');
};
```

**`handleSelectProfilePicture`** - Nouveau handler pour sélectionner la photo de profil
```typescript
const handleSelectProfilePicture = async () => {
  // Permet de choisir depuis la caméra ou la galerie
  // Stocke l'URI dans setProfilePicture()
};
```

**`handleProfileSubmit`** - Envoi des images lors de l'inscription
```typescript
const handleProfileSubmit = async () => {
  // Convertir les images en base64
  const imagesData = await prepareImagesForAPI({
    profilePicture: profilePicture || undefined,
    cniImage: cniImage || undefined,
    selfieImage: selfieImage || undefined,
  });
  
  // Envoyer à l'API
  const result = await register({
    phone,
    firstName,
    lastName,
    email: email || undefined,
    role,
    ...imagesData, // ✨ Images en base64
  }).unwrap();
};
```

#### UI ajoutée

**Section photo de profil** dans l'étape "profile" :
- Cercle cliquable pour sélectionner/modifier la photo
- Placeholder avec icône caméra si pas de photo
- Badge "caméra" en bas à droite
- Texte d'aide explicatif

**Styles ajoutés :**
```typescript
profilePictureContainer
profilePictureButton
profilePicturePlaceholder
profilePictureImage
profilePictureEditBadge
profilePictureHint
```

### 4. Imports ajoutés

```typescript
import { Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { prepareImagesForAPI } from '@/utils/imageHelpers';
```

## 📁 Fichiers créés

### Documentation
- `docs/REGISTRATION_WITH_IMAGES.md` - Guide complet du système d'images
- `CHANGELOG_IMAGES.md` - Ce fichier

### Exemples backend (NestJS)
- `docs/backend-examples/register.dto.ts` - DTO TypeScript avec validation
- `docs/backend-examples/auth.controller.example.ts` - Contrôleur d'exemple
- `docs/backend-examples/image-upload.service.example.ts` - Service d'upload avec Sharp

## 🔄 Flux d'enregistrement mis à jour

### Avant
1. Téléphone → 2. SMS → 3. KYC → 4. Identité → 5. Profil (rôle seulement)

### Après
1. Téléphone → 2. SMS → 3. KYC → 4. Identité (**capture CNI + selfie**) → 5. Profil (**photo de profil + rôle**)

## 🎨 Améliorations UX

### Étape Identité (existante, modifiée)
- ✅ Capture l'image de la CNI
- ✅ Capture le selfie
- ✨ **NOUVEAU** : Stocke les URIs pour envoi ultérieur

### Étape Profil (enrichie)
- ✨ **NOUVEAU** : Section pour ajouter une photo de profil
- Choix entre caméra ou galerie
- Prévisualisation en temps réel
- Photo optionnelle (peut être ajoutée plus tard)
- Sélection du rôle (inchangé)

## 📡 Format d'envoi API

### Requête POST /auth/register

```json
{
  "phone": "+243812345678",
  "firstName": "Jean",
  "lastName": "Mukendi",
  "email": "jean@example.com",
  "role": "driver",
  "profilePicture": "iVBORw0KGgoAAAANSUhEUgAA...", // base64
  "cniImage": "iVBORw0KGgoAAAANSUhEUgAA...",       // base64
  "selfieImage": "iVBORw0KGgoAAAANSUhEUgAA..."    // base64
}
```

### Réponse

```json
{
  "user": {
    "id": "uuid",
    "phone": "+243812345678",
    "name": "Jean Mukendi",
    "email": "jean@example.com",
    "role": "driver",
    "avatar": "https://cdn.zwanga.cd/profiles/profile_123.jpg",
    "identityVerified": true,
    "verified": true,
    "rating": 0,
    "totalTrips": 0,
    "createdAt": "2025-11-12T..."
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
}
```

## 🔐 Sécurité

### Frontend
- ✅ Validation des permissions caméra/galerie
- ✅ Compression des images (quality: 0.8)
- ✅ Redimensionnement lors de la sélection
- ✅ Format carré pour profil et selfie (ratio 1:1)
- ✅ Format rectangulaire pour CNI (ratio 3:2)

### Backend (recommandations)
- ⚠️ Valider le format d'image (JPEG, PNG uniquement)
- ⚠️ Limiter la taille (max 10MB par image)
- ⚠️ Vérifier que c'est bien une image valide
- ⚠️ Scanner pour malware
- ⚠️ Générer un nom de fichier unique
- ⚠️ Stocker dans un service cloud sécurisé (S3, Cloudinary)
- ⚠️ Retourner l'URL publique

## 🧪 Tests à effectuer

### Frontend
- [ ] Sélectionner une photo de profil depuis la caméra
- [ ] Sélectionner une photo de profil depuis la galerie
- [ ] Scanner la CNI
- [ ] Prendre un selfie
- [ ] Compléter l'inscription avec toutes les images
- [ ] Compléter l'inscription sans images (optionnelles)
- [ ] Vérifier que les images sont converties en base64
- [ ] Vérifier que le payload est correct

### Backend
- [ ] Recevoir les images en base64
- [ ] Décoder les images correctement
- [ ] Uploader vers le cloud
- [ ] Retourner les URLs dans la réponse
- [ ] Gérer les erreurs d'upload
- [ ] Valider les formats d'image
- [ ] Limiter la taille des images

## 🐛 Problèmes potentiels et solutions

### Problème 1 : Payload trop volumineux
**Symptôme** : Erreur 413 (Payload Too Large)
**Solution** : 
- Augmenter la limite dans NestJS : `body-parser` limit
- Compresser davantage les images côté frontend
- Utiliser multipart/form-data au lieu de base64

### Problème 2 : Timeout réseau
**Symptôme** : L'upload prend trop de temps
**Solution** :
- Implémenter un upload progressif
- Ajouter un indicateur de progression
- Permettre le retry automatique

### Problème 3 : Images corrompues
**Symptôme** : Les images ne s'affichent pas côté backend
**Solution** :
- Vérifier l'encodage base64
- Valider le préfixe data:image/...
- Tester avec une image simple

## 📦 Dépendances

### Existantes
- `expo-image-picker` - ✅ Déjà installé
- `expo-file-system` - ✅ Déjà installé
- `expo-camera` - ✅ Déjà installé

### Backend (recommandées)
- `sharp` - Traitement d'images
- `@aws-sdk/client-s3` - Upload vers S3 (si AWS)
- `cloudinary` - Upload vers Cloudinary (alternative)
- `multer` - Parsing multipart/form-data (si nécessaire)

## 🚀 Déploiement

### Frontend
1. Aucune migration nécessaire
2. Les utilisateurs existants ne sont pas affectés
3. Les nouveaux utilisateurs peuvent ajouter des images (optionnelles)

### Backend
1. Ajouter les champs `profilePicture`, `cniImage`, `selfieImage` au DTO
2. Implémenter le service d'upload d'images
3. Configurer le service cloud (S3, Cloudinary)
4. Tester l'endpoint `/auth/register`
5. Déployer progressivement

## 📝 Notes

- Les images sont **optionnelles** - l'utilisateur peut s'inscrire sans
- La conversion base64 se fait automatiquement
- Les images sont compressées (quality: 0.8) pour réduire la taille
- Le format base64 est compatible avec tous les backends
- Alternative : utiliser multipart/form-data si préféré

## 🎓 Ressources

- [Documentation ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- [Documentation FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [Sharp - Image Processing](https://sharp.pixelplumbing.com/)
- [AWS S3 SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Cloudinary](https://cloudinary.com/documentation)

## ✨ Prochaines améliorations

1. **Compression progressive** - Réduire automatiquement la qualité si trop volumineuse
2. **Upload en arrière-plan** - Continuer même si l'app est fermée
3. **Retry automatique** - Réessayer en cas d'échec réseau
4. **Prévisualisation améliorée** - Zoom, rotation, recadrage
5. **Indicateur de progression** - Barre de progression d'upload
6. **Cache local** - Stocker temporairement pour retry
7. **Format WebP** - Support du format moderne plus léger

---

**Date de modification** : 12 novembre 2025  
**Auteur** : Équipe ZWANGA  
**Version** : 1.0.0

