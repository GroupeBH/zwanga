# Quick Start - Images lors de l'enregistrement

## ✅ Résumé des modifications

Votre application ZWANGA peut maintenant envoyer **3 types d'images** lors de l'enregistrement :

1. 📸 **Photo de profil** (`profilePicture`) - Optionnel
2. 🪪 **Carte d'identité** (`cniImage`) - Optionnel  
3. 🤳 **Selfie de vérification** (`selfieImage`) - Optionnel

## 🎯 Ce qui a été fait

### Frontend (React Native + Expo)

✅ **API Layer** (`store/api/authApi.ts`)
- Ajout des champs images à la mutation `register`
- Les images sont envoyées en base64

✅ **Utilitaires** (`utils/imageHelpers.ts`)
- Fonctions de conversion URI → base64
- Prêt pour l'envoi à l'API NestJS

✅ **Interface utilisateur** (`app/auth.tsx`)
- Nouvelle section pour la photo de profil
- Capture automatique de la CNI et du selfie
- UI intuitive avec prévisualisation

### Backend (Exemples NestJS fournis)

📚 **Documentation complète** dans `/docs` :
- Guide détaillé du système
- DTO TypeScript avec validation
- Contrôleur d'exemple
- Service d'upload avec Sharp
- Exemples S3 et Cloudinary

## 🚀 Utilisation

### 1. Côté Frontend (déjà prêt ✅)

L'utilisateur suit simplement le flux d'inscription :
1. Saisit son téléphone
2. Vérifie le code SMS
3. Remplit ses informations (prénom, nom, email)
4. **Scanne sa carte d'identité** → `cniImage`
5. **Prend un selfie** → `selfieImage`
6. **Ajoute une photo de profil** (optionnel) → `profilePicture`
7. Choisit son rôle
8. ✨ **Toutes les images sont envoyées automatiquement !**

### 2. Côté Backend (à implémenter)

#### Étape 1 : Créer le DTO

```typescript
// src/auth/dto/register.dto.ts
export class RegisterDto {
  @IsString() phone: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @IsEmail() email?: string;
  @IsEnum(['driver', 'passenger', 'both']) role: string;
  
  @IsOptional() @IsString() profilePicture?: string; // base64
  @IsOptional() @IsString() cniImage?: string;       // base64
  @IsOptional() @IsString() selfieImage?: string;    // base64
}
```

#### Étape 2 : Traiter les images dans le contrôleur

```typescript
// src/auth/auth.controller.ts
@Post('register')
async register(@Body() dto: RegisterDto) {
  // Décoder et uploader les images
  if (dto.profilePicture) {
    const buffer = Buffer.from(dto.profilePicture, 'base64');
    dto.profilePicture = await this.uploadService.upload(buffer, 'profiles');
  }
  
  if (dto.cniImage) {
    const buffer = Buffer.from(dto.cniImage, 'base64');
    dto.cniImage = await this.uploadService.upload(buffer, 'cni');
  }
  
  if (dto.selfieImage) {
    const buffer = Buffer.from(dto.selfieImage, 'base64');
    dto.selfieImage = await this.uploadService.upload(buffer, 'selfies');
  }
  
  return this.authService.register(dto);
}
```

#### Étape 3 : Créer le service d'upload

Voir l'exemple complet dans : `docs/backend-examples/image-upload.service.example.ts`

```typescript
// Installation
npm install sharp @aws-sdk/client-s3
// ou
npm install cloudinary
```

## 📦 Format des données

### Requête envoyée par l'app

```json
{
  "phone": "+243812345678",
  "firstName": "Jean",
  "lastName": "Mukendi",
  "email": "jean@example.com",
  "role": "driver",
  "profilePicture": "iVBORw0KGgoAAAANSUhEUgAA...",
  "cniImage": "iVBORw0KGgoAAAANSUhEUgAA...",
  "selfieImage": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

### Réponse attendue par l'app

```json
{
  "user": {
    "id": "uuid",
    "phone": "+243812345678",
    "name": "Jean Mukendi",
    "avatar": "https://cdn.zwanga.cd/profiles/photo.jpg",
    "identityVerified": true,
    // ... autres champs
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## 🧪 Test rapide

### 1. Tester l'app
```bash
npm start
```

1. Ouvrir l'app
2. Cliquer sur "S'inscrire"
3. Suivre le flux complet
4. Vérifier que les images sont bien capturées
5. Observer la requête dans les DevTools

### 2. Tester l'API (avec curl)

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+243812345678",
    "firstName": "Jean",
    "lastName": "Mukendi",
    "role": "driver",
    "profilePicture": "iVBORw0KGgo..."
  }'
```

## 📚 Documentation complète

- 📖 **Guide complet** : `docs/REGISTRATION_WITH_IMAGES.md`
- 📝 **Changelog détaillé** : `CHANGELOG_IMAGES.md`
- 💻 **Exemples backend** : `docs/backend-examples/`

## ⚠️ Points importants

### Taille des images
- Les images sont compressées (quality: 0.8)
- Format recommandé : JPEG
- Taille maximale recommandée backend : **10MB par image**

### Sécurité
- ✅ Permissions caméra/galerie demandées
- ✅ Validation côté frontend
- ⚠️ **À faire côté backend** : validation format, taille, malware scan

### Performance
- Les images sont converties en base64 automatiquement
- L'upload se fait en une seule requête
- Temps d'upload : 2-5 secondes selon la connexion

## 🔧 Configuration backend

### Variables d'environnement nécessaires

```env
# AWS S3 (si utilisé)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=zwanga-images

# OU Cloudinary (si utilisé)
CLOUDINARY_CLOUD_NAME=your_cloud
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
```

### Augmenter la limite de payload (NestJS)

```typescript
// main.ts
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Augmenter la limite pour les images base64
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });
  
  await app.listen(3000);
}
```

## 🐛 Dépannage

### Problème : Images non reçues côté backend
**Solution** : Vérifier que `body-parser` accepte les payloads volumineux

### Problème : Erreur 413 (Payload Too Large)
**Solution** : Augmenter la limite dans `main.ts` (voir ci-dessus)

### Problème : Images corrompues
**Solution** : Vérifier l'encodage base64, retirer le préfixe `data:image/...;base64,`

### Problème : Timeout
**Solution** : Compresser davantage ou implémenter un upload progressif

## 🎉 Prêt à utiliser !

✅ Frontend : **Complètement prêt**  
⏳ Backend : **Exemples fournis, à adapter à votre infrastructure**

## 📞 Support

Pour toute question :
1. Consulter `docs/REGISTRATION_WITH_IMAGES.md`
2. Voir les exemples dans `docs/backend-examples/`
3. Contacter l'équipe de développement

---

**Bon développement ! 🚀**

