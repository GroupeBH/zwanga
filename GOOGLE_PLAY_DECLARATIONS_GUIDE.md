# Guide de Déclaration Google Play Console

## 📋 Déclarations Requises

Vous devez compléter **2 déclarations** dans Google Play Console :

1. **Foreground Service Permissions** (⚠️ EN RETARD - Deadline dépassée)
2. **Location Permissions**

---

## 1️⃣ Foreground Service Permissions

### Étape 1 : Accéder à la déclaration
1. Allez dans **Google Play Console** > **Policy** > **App content**
2. Trouvez la section **"Foreground service permissions"**
3. Cliquez sur **"Start declaration"** ou **"Complete declaration"**

### Étape 2 : Remplir le formulaire

**Question : "Does your app use foreground services?"**
- ✅ **Réponse : OUI**

**Question : "Which foreground service types does your app use?"**
- ✅ Cochez uniquement : **"Location"** (FOREGROUND_SERVICE_LOCATION)

**Question : "Why does your app need to use foreground services?"**
- Copiez-collez le texte suivant :

```
Notre application est une plateforme de covoiturage qui nécessite le suivi GPS en temps réel pendant les trajets actifs. Nous utilisons FOREGROUND_SERVICE_LOCATION pour :

1. Navigation GPS en temps réel : Les conducteurs utilisent l'application pour naviguer vers les points de ramassage et de destination des passagers pendant les trajets actifs.

2. Suivi de position pour les passagers : Les passagers peuvent suivre en temps réel la position du conducteur pendant leur trajet, ce qui est essentiel pour :
   - Savoir quand le conducteur arrive au point de ramassage
   - Suivre la progression du trajet en cours
   - Estimer le temps d'arrivée

3. Sécurité : Le suivi de position permet de garantir la sécurité des utilisateurs en permettant le suivi des trajets actifs.

Le service est utilisé UNIQUEMENT pendant les trajets actifs (statut "ongoing") :
- Le service démarre quand le conducteur commence la navigation
- Le service s'arrête automatiquement à la fin du trajet
- Une notification persistante informe l'utilisateur que l'application suit sa position
- L'utilisateur peut arrêter le service à tout moment en mettant fin au trajet

Cette fonctionnalité est critique pour le fonctionnement de notre application de covoiturage et répond à un besoin réel et visible pour l'utilisateur.
```

**Question : "How does your app use foreground services?"**
- Copiez-collez le texte suivant :

```
L'application utilise le foreground service de localisation uniquement dans les cas suivants :

1. Pendant la navigation active : Quand un conducteur démarre un trajet et utilise la fonctionnalité de navigation GPS intégrée dans l'application.

2. Pendant le suivi en temps réel : Quand un passager suit un trajet actif et souhaite voir la position du conducteur en temps réel.

Le service est démarré explicitement par l'utilisateur lorsqu'il :
- Clique sur le bouton "Démarrer la navigation" dans l'écran de gestion de trajet
- Active le suivi d'un trajet en tant que passager

Le service s'arrête automatiquement lorsque :
- Le trajet est terminé (arrivée à destination)
- L'utilisateur met fin au trajet manuellement
- L'utilisateur ferme l'application (le service s'arrête proprement)

Une notification persistante est toujours affichée pendant l'utilisation du service, informant clairement l'utilisateur que sa position est suivie.
```

**Question : "Is the foreground service used for a task that is noticeable to users?"**
- ✅ **Réponse : OUI**

**Justification :**
```
Oui, le service est utilisé pour des tâches très visibles pour l'utilisateur :
- Une notification persistante est affichée pendant toute la durée du trajet
- L'utilisateur voit sa position sur une carte en temps réel
- L'utilisateur voit les instructions de navigation à l'écran
- Les passagers voient la position du conducteur se déplacer sur la carte
```

### Étape 3 : Soumettre
- Cliquez sur **"Save"** ou **"Submit declaration"**

---

## 2️⃣ Location Permissions

### Étape 1 : Accéder à la déclaration
1. Allez dans **Google Play Console** > **Policy** > **App content**
2. Trouvez la section **"Location permissions"**
3. Cliquez sur **"Start declaration"** ou **"Complete declaration"**

### Étape 2 : Remplir le formulaire

**Question : "Does your app access users' location?"**
- ✅ **Réponse : OUI**

**Question : "Why does your app need to access users' location?"**
- Copiez-collez le texte suivant :

```
Notre application est une plateforme de covoiturage qui nécessite l'accès à la localisation pour les fonctionnalités suivantes :

1. AFFICHAGE DE LA POSITION ACTUELLE :
   - Afficher la position de l'utilisateur sur la carte
   - Permettre à l'utilisateur de voir où il se trouve par rapport aux trajets disponibles

2. RECHERCHE DE TRAJETS À PROXIMITÉ :
   - Trouver et afficher les trajets disponibles près de la position de l'utilisateur
   - Permettre aux utilisateurs de rechercher des trajets depuis leur emplacement actuel

3. NAVIGATION GPS PENDANT LES TRAJETS :
   - Fournir des instructions de navigation en temps réel aux conducteurs
   - Guider les conducteurs vers les points de ramassage et de destination
   - Calculer les itinéraires optimaux

4. SUIVI EN TEMPS RÉEL POUR LES PASSAGERS :
   - Permettre aux passagers de suivre la position du conducteur en temps réel pendant le trajet
   - Estimer le temps d'arrivée basé sur la position actuelle
   - Informer les passagers de l'arrivée du conducteur au point de ramassage

5. SÉLECTION DE POINTS DE DÉPART ET D'ARRIVÉE :
   - Permettre aux utilisateurs de sélectionner facilement leur point de départ et d'arrivée sur la carte
   - Utiliser la position actuelle comme point de départ par défaut

Toutes ces fonctionnalités sont essentielles au fonctionnement de notre application de covoiturage et ne peuvent pas fonctionner sans l'accès à la localisation.
```

**Question : "How does your app use location data?"**
- Copiez-collez le texte suivant :

```
L'application utilise les données de localisation de la manière suivante :

1. LOCALISATION EN PREMIER PLAN (ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION) :
   - Utilisée lorsque l'application est ouverte et active
   - Affichage de la position sur la carte
   - Recherche de trajets à proximité
   - Sélection de points de départ/destination sur la carte
   - Navigation GPS pendant les trajets

2. LOCALISATION EN ARRIÈRE-PLAN (ACCESS_BACKGROUND_LOCATION) :
   - Utilisée UNIQUEMENT pendant les trajets actifs (statut "ongoing")
   - Permet la continuation du suivi GPS même si l'application est en arrière-plan
   - Nécessaire pour que les passagers puissent suivre le conducteur en temps réel
   - Le service s'arrête automatiquement à la fin du trajet

3. GESTION DES PERMISSIONS :
   - La permission de localisation en arrière-plan est demandée uniquement lorsque nécessaire (pendant un trajet actif)
   - L'utilisateur peut refuser cette permission et continuer à utiliser l'application avec des fonctionnalités limitées
   - Une notification persistante informe l'utilisateur quand sa localisation est suivie en arrière-plan

4. SÉCURITÉ ET CONFIDENTIALITÉ :
   - Les données de localisation sont utilisées uniquement pour les fonctionnalités décrites ci-dessus
   - Les données ne sont pas partagées avec des tiers sans consentement explicite
   - Les utilisateurs peuvent désactiver l'accès à la localisation à tout moment dans les paramètres
```

**Question : "Does your app collect, share, or sell location data?"**
- Sélectionnez l'option appropriée selon votre politique de confidentialité
- Si vous ne partagez pas les données : **"No, we don't collect, share, or sell location data"**
- Si vous partagez uniquement pour le fonctionnement de l'app : **"Yes, but only for app functionality"**

**Question : "Is location access required for your app to function?"**
- ✅ **Réponse : OUI** (pour certaines fonctionnalités essentielles)

**Justification :**
```
Oui, l'accès à la localisation est requis pour les fonctionnalités essentielles suivantes :
- Recherche de trajets à proximité
- Navigation GPS pendant les trajets
- Suivi en temps réel pour les passagers

Sans l'accès à la localisation, ces fonctionnalités ne peuvent pas fonctionner. Cependant, l'utilisateur peut toujours utiliser certaines fonctionnalités de base de l'application sans accorder la permission de localisation.
```

### Étape 3 : Soumettre
- Cliquez sur **"Save"** ou **"Submit declaration"**

---

## ⚠️ Important : Deadline Dépassée

Pour la déclaration **Foreground Service Permissions** qui est en retard :

1. **Complétez la déclaration immédiatement** avec les informations ci-dessus
2. Google Play peut **bloquer les mises à jour** jusqu'à ce que la déclaration soit complétée
3. Une fois soumise, la déclaration sera examinée par Google (généralement sous 24-48h)

---

## ✅ Vérification Post-Soumission

Après avoir soumis les déclarations :

1. Vérifiez que le statut passe à **"Under review"** puis **"Approved"**
2. Si Google demande des clarifications, répondez rapidement avec des détails supplémentaires
3. Une fois approuvées, vous pourrez continuer à publier des mises à jour

---

## 📝 Notes Supplémentaires

### Si Google demande des clarifications :

**Pour Foreground Service :**
- Insistez sur le fait que le service est utilisé uniquement pendant les trajets actifs
- Mentionnez que l'utilisateur contrôle explicitement le démarrage/arrêt du service
- Expliquez que la notification persistante informe toujours l'utilisateur

**Pour Location Permissions :**
- Précisez que ACCESS_BACKGROUND_LOCATION est utilisé uniquement pendant les trajets actifs
- Expliquez que l'utilisateur peut refuser cette permission
- Mentionnez que les données sont utilisées uniquement pour les fonctionnalités de l'application

---

## 🔗 Liens Utiles

- [Documentation Google Play - Foreground Services](https://developer.android.com/develop/background-work/services/foreground-services)
- [Documentation Google Play - Location Permissions](https://support.google.com/googleplay/android-developer/answer/9888170)


