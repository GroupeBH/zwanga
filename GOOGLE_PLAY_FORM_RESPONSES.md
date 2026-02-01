# Réponses pour le Formulaire Google Play Console

## Foreground Service Permissions Declaration

### Question 1: "What tasks require your app to use the FOREGROUND_SERVICE_LOCATION permission?"

**Réponses à cocher :**
- ✅ **Background location updates**
- ✅ **Navigation**
- ✅ **Other** (cocher et remplir le champ ci-dessous)

**Texte pour "Other tasks" :**
```
Real-time driver tracking for passengers during active trips. Passengers need to see the driver's live location on a map while the trip is in progress, even when the app is in the background. This allows passengers to:
- Know when the driver is arriving at the pickup point
- Track the trip progress in real-time
- Estimate arrival time accurately
- Ensure safety by monitoring the trip location
```

---

### Question 2: "Provide a video demonstrating how your app uses the FOREGROUND_SERVICE_LOCATION permission"

**Instructions pour créer la vidéo :**

1. **Durée recommandée :** 30-60 secondes
2. **Contenu à montrer :**
   - Démarrer un trajet en tant que conducteur
   - Activer la navigation GPS
   - Montrer la notification persistante qui apparaît
   - Montrer la carte avec la position en temps réel
   - Mettre l'application en arrière-plan (appuyer sur Home)
   - Montrer que la notification reste visible
   - Revenir à l'application et montrer que la navigation continue
   - Montrer le suivi en temps réel depuis l'écran passager

3. **Plateforme :** YouTube (non listée) ou Google Drive
4. **Format :** MP4 recommandé

**Texte à mettre dans le champ "Video link" :**
```
[Votre lien YouTube ou Google Drive]

Cette vidéo démontre :
1. Le démarrage de la navigation GPS pendant un trajet actif
2. L'affichage de la notification persistante indiquant que la localisation est suivie
3. La continuation du suivi GPS même lorsque l'application est en arrière-plan
4. Le suivi en temps réel de la position du conducteur pour les passagers
5. L'arrêt automatique du service à la fin du trajet
```

**Si vous n'avez pas encore de vidéo, vous pouvez utiliser ce texte temporaire :**
```
Nous préparons actuellement une vidéo de démonstration. En attendant, voici comment notre application utilise FOREGROUND_SERVICE_LOCATION :

1. Quand un conducteur démarre un trajet et active la navigation, une notification persistante apparaît indiquant "Navigation en cours"
2. La position du conducteur est suivie en temps réel et affichée sur une carte
3. Même si l'application passe en arrière-plan, la navigation continue et la notification reste visible
4. Les passagers peuvent voir la position du conducteur se déplacer en temps réel sur la carte
5. Le service s'arrête automatiquement lorsque le trajet est terminé

Une vidéo de démonstration sera fournie dans les prochains jours.
```

---

### Question 3: "Why does your app need to use FOREGROUND_SERVICE_LOCATION?"

**Réponse complète :**

```
Notre application est une plateforme de covoiturage qui nécessite le suivi GPS en temps réel pendant les trajets actifs. Nous utilisons FOREGROUND_SERVICE_LOCATION pour les raisons suivantes :

1. NAVIGATION GPS EN TEMPS RÉEL :
   - Les conducteurs utilisent l'application pour naviguer vers les points de ramassage et de destination des passagers
   - Les instructions de navigation doivent continuer même si l'application passe en arrière-plan
   - Cela permet aux conducteurs de suivre les instructions GPS tout en utilisant d'autres applications

2. SUIVI EN TEMPS RÉEL POUR LES PASSAGERS :
   - Les passagers doivent pouvoir voir la position du conducteur en temps réel pendant le trajet
   - Ce suivi doit continuer même si l'application passe en arrière-plan
   - Cela permet aux passagers de savoir quand le conducteur arrive et d'estimer le temps d'arrivée

3. SÉCURITÉ :
   - Le suivi de position permet de garantir la sécurité des utilisateurs
   - Les trajets peuvent être suivis en cas d'urgence
   - Les utilisateurs peuvent partager leur position avec des contacts de confiance

4. FONCTIONNALITÉ CRITIQUE :
   - Sans ce service, les fonctionnalités essentielles de navigation et de suivi ne peuvent pas fonctionner correctement
   - Les utilisateurs s'attendent à ce que la navigation continue même en arrière-plan
   - C'est une fonctionnalité standard attendue dans les applications de transport

Le service est utilisé UNIQUEMENT pendant les trajets actifs :
- Il démarre explicitement quand l'utilisateur active la navigation
- Il s'arrête automatiquement à la fin du trajet
- Une notification persistante informe toujours l'utilisateur que sa position est suivie
- L'utilisateur peut arrêter le service à tout moment en mettant fin au trajet
```

---

## ⚠️ IMPORTANT : FOREGROUND_SERVICE_MEDIA_PLAYBACK

Si Google Play détecte encore `FOREGROUND_SERVICE_MEDIA_PLAYBACK` :

**Dans le formulaire, vous pouvez :**

1. **Option 1 - Indiquer que vous ne l'utilisez pas :**
   - Dans la section où Google liste les permissions détectées
   - Ajoutez une note : "FOREGROUND_SERVICE_MEDIA_PLAYBACK is detected but not used. It comes from a dependency (expo-audio) that is installed but not actively used. We have blocked this permission in our app.config.js."

2. **Option 2 - Après le rebuild :**
   - Rebuild votre application avec le plugin amélioré qui supprime cette permission
   - Soumettez une nouvelle version à Google Play
   - La permission ne devrait plus apparaître

**Texte à utiliser si Google demande une explication :**
```
FOREGROUND_SERVICE_MEDIA_PLAYBACK is detected in our manifest but we do not use it. This permission is added by the expo-audio dependency which is installed in our project but not actively used for media playback in foreground services. We have explicitly blocked this permission in our app configuration (app.config.js blockedPermissions). We will remove this dependency or ensure it is properly excluded in our next app update.
```

---

## 📝 Checklist avant de soumettre

- [ ] Vidéo créée et uploadée (YouTube non listé ou Google Drive)
- [ ] Lien de la vidéo copié
- [ ] Toutes les cases appropriées cochées (Background location updates, Navigation, Other)
- [ ] Texte "Other tasks" rempli
- [ ] Justification complète remplie
- [ ] Vérifier que FOREGROUND_SERVICE_MEDIA_PLAYBACK est bien bloquée dans le prochain build

---

## 🎥 Script pour la Vidéo de Démonstration

**Scénario recommandé (30-60 secondes) :**

1. **0-5s :** Montrer l'écran de gestion de trajet avec un trajet "ongoing"
2. **5-10s :** Cliquer sur "Démarrer la navigation"
3. **10-15s :** Montrer la carte avec la navigation active et la notification qui apparaît
4. **15-20s :** Montrer la notification persistante dans la barre de notifications
5. **20-25s :** Mettre l'app en arrière-plan (bouton Home)
6. **25-30s :** Montrer que la notification reste visible
7. **30-40s :** Revenir à l'app et montrer que la navigation continue
8. **40-50s :** Montrer l'écran passager avec le suivi en temps réel
9. **50-60s :** Terminer le trajet et montrer que la notification disparaît

**Astuce :** Utilisez un outil comme OBS Studio ou l'enregistreur d'écran Android pour capturer la vidéo.


