# Google Play Store - Foreground Service Declaration

## Utilisation des Foreground Services

Notre application utilise les foreground services suivants pour des fonctionnalités essentielles :

### FOREGROUND_SERVICE_LOCATION

**Justification :**

Notre application est une plateforme de covoiturage qui nécessite le suivi en temps réel de la position des conducteurs pendant les trajets actifs. Cette fonctionnalité est critique pour :

1. **Navigation GPS en temps réel** : Les conducteurs utilisent l'application pour naviguer vers les points de ramassage et de destination des passagers.

2. **Suivi de position pour les passagers** : Les passagers peuvent suivre en temps réel la position du conducteur pendant leur trajet, ce qui est essentiel pour :
   - Savoir quand le conducteur arrive au point de ramassage
   - Suivre la progression du trajet en cours
   - Estimer le temps d'arrivée

3. **Sécurité** : Le suivi de position permet de garantir la sécurité des utilisateurs en permettant le suivi des trajets actifs.

**Quand le service est utilisé :**
- Uniquement pendant les trajets actifs (statut "ongoing")
- Le service démarre quand le conducteur commence la navigation
- Le service s'arrête automatiquement à la fin du trajet

**Visibilité pour l'utilisateur :**
- Une notification persistante est affichée pendant le trajet
- L'utilisateur peut voir clairement que l'application suit sa position
- L'utilisateur peut arrêter le service à tout moment en mettant fin au trajet

**Conformité :**
- Le service est utilisé uniquement pour des tâches visibles et importantes pour l'utilisateur
- L'utilisateur est informé de l'utilisation de la localisation via une notification
- L'utilisateur peut contrôler l'utilisation via les paramètres de l'application

---

## Permissions de Localisation

### ACCESS_FINE_LOCATION et ACCESS_COARSE_LOCATION

Utilisées pour :
- Afficher la position actuelle de l'utilisateur sur la carte
- Trouver les trajets à proximité
- Navigation GPS pendant les trajets

### ACCESS_BACKGROUND_LOCATION

Utilisée uniquement pendant les trajets actifs pour :
- Continuer le suivi de position même si l'application est en arrière-plan
- Permettre aux passagers de suivre le conducteur en temps réel
- Garantir la continuité de la navigation GPS

**Note :** Cette permission est demandée uniquement lorsque nécessaire (pendant un trajet actif) et l'utilisateur peut la refuser.

---

## Permissions Bloquées

### FOREGROUND_SERVICE_MEDIA_PLAYBACK

Cette permission est **explicitement bloquée** car notre application n'utilise pas de lecture audio en arrière-plan. Si cette permission apparaît dans le manifest, elle provient d'une dépendance (expo-audio) qui n'est pas activement utilisée dans notre application.

### ACTIVITY_RECOGNITION

Cette permission est **explicitement bloquée** car notre application n'utilise pas la reconnaissance d'activité. Nous utilisons uniquement l'accéléromètre pour la détection de stabilité de l'appareil pendant le processus KYC, ce qui ne nécessite pas cette permission.


