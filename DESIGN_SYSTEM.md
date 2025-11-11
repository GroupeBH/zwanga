# ZWANGA Design System

## 🎨 Palette de Couleurs

### Couleurs Principales

#### Primary (Orange)
- **Default**: `#FF6B35` - Couleur principale de la marque
- **Light**: `#FF8C5A` - Variante claire
- **Dark**: `#E65A2E` - Variante foncée
- **Usage**: Boutons principaux, liens, accents importants

#### Secondary (Jaune)
- **Default**: `#F7B801` - Couleur secondaire
- **Light**: `#FFD93D` - Variante claire
- **Dark**: `#E6A600` - Variante foncée
- **Usage**: Badges, statuts "À venir", étoiles de notation

### Couleurs Sémantiques

#### Success (Vert)
- **Default**: `#2ECC71` - Validation, succès
- **Light**: `#5AD97E`
- **Dark**: `#27AE60`
- **Usage**: Messages de succès, points de départ, vérifié

#### Info (Bleu)
- **Default**: `#3498DB` - Information
- **Light**: `#5DADE2`
- **Dark**: `#2980B9`
- **Usage**: Statuts "En cours", notifications informatives

#### Danger (Rouge)
- **Default**: `#EF4444` - Erreur, danger
- **Light**: `#FCA5A5`
- **Dark**: `#DC2626`
- **Usage**: Signalements, annulations, erreurs

### Couleurs Neutres (Gray)

- **Gray 50**: `#F8F9FA` - Arrière-plans très clairs
- **Gray 100**: `#F1F3F5` - Arrière-plans légers
- **Gray 200**: `#E9ECEF` - Bordures
- **Gray 300**: `#DEE2E6` - Bordures actives
- **Gray 400**: `#CED4DA` - Texte désactivé
- **Gray 500**: `#ADB5BD` - Placeholder
- **Gray 600**: `#6C757D` - Texte secondaire
- **Gray 700**: `#495057` - Texte principal
- **Gray 800**: `#343A40` - Titres
- **Gray 900**: `#212529` - Texte très foncé

## 📐 Espacements

### Padding & Margin
- `xs`: 4px (1)
- `sm`: 8px (2)
- `md`: 12px (3)
- `lg`: 16px (4)
- `xl`: 24px (6)
- `2xl`: 32px (8)

### Border Radius
- **Small**: 8px (`rounded-lg`)
- **Medium**: 12px (`rounded-xl`)
- **Large**: 16px (`rounded-2xl`)
- **Full**: 9999px (`rounded-full`)

## 🔤 Typographie

### Tailles de Police
- **XS**: 12px - Labels, badges
- **SM**: 14px - Texte secondaire
- **Base**: 16px - Texte principal
- **LG**: 18px - Sous-titres
- **XL**: 20px - Titres de section
- **2XL**: 24px - Titres principaux
- **4XL**: 36px - Logos, grands titres

### Poids de Police
- **Regular**: 400 - Texte normal
- **Medium**: 500 - Texte semi-important
- **Semibold**: 600 - Boutons, labels
- **Bold**: 700 - Titres, emphase

## 🎭 Composants

### Boutons

#### Primary Button
\`\`\`
bg-primary py-4 rounded-xl
text-white text-center font-bold text-lg
\`\`\`

#### Secondary Button
\`\`\`
border border-gray-300 py-4 rounded-xl
text-gray-700 text-center font-bold
\`\`\`

#### Danger Button
\`\`\`
border border-red-200 py-4 rounded-xl
text-red-500 text-center font-bold
\`\`\`

### Cartes

#### Card de Trajet
\`\`\`
bg-white rounded-2xl p-4 shadow-sm
\`\`\`

#### Card d'Information
\`\`\`
bg-gray-50 rounded-2xl p-4
\`\`\`

### Inputs

#### Input Standard
\`\`\`
border border-gray-300 rounded-xl px-4 py-4
\`\`\`

#### Input avec Icône
\`\`\`
flex-row items-center border border-gray-300 rounded-xl px-4 py-4
\`\`\`

### Badges

#### Badge de Statut
\`\`\`
px-3 py-1 rounded-full
\`\`\`

#### Badge de Notification
\`\`\`
bg-red-500 rounded-full w-5 h-5 items-center justify-center
text-white text-xs font-bold
\`\`\`

## 🎨 Icônes

### Ionicons Usage

#### Navigation
- **home**: Accueil
- **car**: Trajets
- **chatbubbles**: Messages
- **person**: Profil

#### Actions
- **add**: Ajouter
- **search**: Rechercher
- **filter**: Filtrer
- **send**: Envoyer

#### Status
- **checkmark-circle**: Succès
- **alert-circle**: Avertissement
- **close-circle**: Erreur
- **star**: Note/Favori

#### Transport
- **car**: Voiture
- **bicycle**: Moto
- **navigate**: Destination
- **location**: Position

## 🌊 Animations

### Transitions Standard
- **Duration**: 200-300ms
- **Easing**: `ease-in-out`

### Animations avec Reanimated
- **FadeIn**: Apparition des éléments
- **FadeOut**: Disparition
- **SlideIn**: Entrée depuis le côté
- **Scale**: Zoom in/out
- **Pulse**: Effet de pulsation (trajet en cours)

### Délais d'Animation
\`\`\`typescript
entering={FadeInDown.delay(index * 100)}
\`\`\`

## 📱 Responsive Design

### Breakpoints (pour Web)
- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

### Hauteurs Recommandées
- **Tab Bar**: 65px (Android), 85px (iOS avec safe area)
- **Header**: 60px
- **Card**: min 120px
- **Input**: 56px

## ✨ États Interactifs

### Hover (Web)
\`\`\`
hover:bg-primary-dark
\`\`\`

### Active (Mobile)
\`\`\`
active:bg-gray-50
\`\`\`

### Disabled
\`\`\`
bg-gray-300
text-gray-500
\`\`\`

## 🎯 Best Practices

### 1. Cohérence
- Utiliser les couleurs de la palette uniquement
- Respecter les espacements définis
- Maintenir les border-radius cohérents

### 2. Accessibilité
- Contraste minimum 4.5:1 pour le texte
- Taille de touche minimum 44x44px
- Labels clairs sur tous les inputs

### 3. Performance
- Optimiser les images
- Limiter les animations simultanées
- Utiliser les composants natifs quand possible

### 4. Feedback Utilisateur
- Toujours donner un feedback visuel aux actions
- Animations fluides (60 FPS)
- Messages d'erreur clairs

## 📦 Ressources

### Polices
- **Système par défaut**: -apple-system, Roboto

### Icônes
- **@expo/vector-icons/Ionicons**
- Tailles: 16px, 20px, 24px, 32px

### Images
- Format: PNG, JPEG, WebP
- Résolution: 1x, 2x, 3x pour différentes densités

---

Ce design system garantit une cohérence visuelle et une expérience utilisateur optimale dans toute l'application ZWANGA.

