# Diagnostic des alertes de commandes — 10 novembre 2026

## Périmètre et précautions

Signalement : plusieurs téléphones Android en production n'ont pas sonné lors d'un essai situé entre 15 h 45 et 16 h 20 à Kinshasa. La présence ou non d'une notification visuelle et les builds exacts ne sont pas encore précisés.

Inspection CloudWatch de 14 h 45 à 15 h 21 UTC, avec pagination complète, puis tâche ECS temporaire explicitement autorisée pour lire les commandes créées dans ce créneau et leurs événements associés. Le suivi des événements peut donc dépasser la fin du créneau de création. Aucun nom, téléphone, contenu de message, position GPS ou jeton push n'a été extrait dans le rapport.

Le diagnostic réutilise l'image de production, sans démarrer Nest, ses tâches métier ou un envoi push. PostgreSQL confirme `transaction_read_only=on` ; transaction `BEGIN READ ONLY`, TLS avec vérification de certificat, connexion limitée à 8 secondes, requêtes à 5 secondes, attente de verrou à 2 secondes, limite globale de 90 secondes. Les règles du skill PostgreSQL ont guidé ces bornes et la sélection des colonnes. Aucun changement applicatif, de configuration, de paiement ou de commande ; aucun déploiement ni redémarrage du service.

## Résultats observés

L'instantané SQL a été relevé vers **16 h 39** à Kinshasa.

| Commande créée, heure locale | État à la lecture | Conducteurs invités | Alertes acceptées par le transport | Retours de réception | Télémétrie audio |
| --- | --- | --- | --- | --- | --- |
| 16 h 15 min 02 s | Annulée | 6 | 6 : 5 FCM, 1 Expo | 2 | 1 `audio_suppressed / DEVICE_POLICY`, 1 `audio_started / PLAYER_STARTED` |
| 16 h 20 min 20 s | Conducteur sélectionné | 6 | 6 : 4 FCM, 2 Expo | 1 | 1 `audio_started / PLAYER_STARTED` |

Les six invitations de la première commande ont expiré successivement, avec une fenêtre initiale d'environ 40 secondes chacune. La seconde a également parcouru six conducteurs, puis une acceptation a été enregistrée plus tard. Cela exclut une absence totale de sélection et d'envoi serveur sur ces deux commandes, mais ne démontre pas la réception sur chaque appareil présent dans la pièce.

Les trois puis deux alertes marquées avec le protocole natif Android v6 ont fait l'objet d'un renvoi de secours faute de confirmation remontée à temps. Les avertissements `URGENT_PUSH_QUEUE_DELAY` mesurent l'âge de la notification lors d'un traitement, y compris lors d'un renvoi : les valeurs de 14 à 19 secondes vues dans les premiers journaux ne prouvent donc pas un retard équivalent du premier envoi. Sur le premier destinataire, l'appareil rapporte une observation à 16 h 15 min 05 s, avant le renvoi de 16 h 15 min 20 s.

Des observations natives ont été remontées tardivement : le contrôle audio bloquant à 16 h 15 min 05 s est reçu par le backend à 16 h 30 min 48 s ; un démarrage observé à 16 h 20 min 25 s remonte vers 16 h 30 min 49 s. Les heures d'observation client et de réception serveur doivent rester distinctes. Le code mobile local conserve les reçus natifs puis les transmet par la couche JavaScript ; un reçu tardif n'établit pas un push arrivé tardivement.

Le service API est resté sur la même révision ECS, avec une tâche désirée et active, aucune en attente et un déploiement terminé. La tâche de diagnostic s'est arrêtée automatiquement ; les deux conteneurs ont terminé avec un code de sortie zéro. L'image actuellement utilisée a été poussée le 6 novembre ; les modifications locales plus récentes ne doivent pas être présumées déployées.

## Interprétation et limites

- `sent` avec identifiant fournisseur signifie acceptation par le transport, pas preuve de livraison finale ni de son audible.
- `PLAYER_STARTED` confirme une déclaration du lecteur, pas ce que l'utilisateur a entendu. Les destinataires des alertes ne sont pas encore reliés aux téléphones physiquement présents pendant l'essai.
- Un blocage audio `DEVICE_POLICY` est réellement enregistré. Dans le code mobile local, ce motif regroupe plusieurs contrôles : mode silencieux/vibreur ou appel, volume notification, filtre d'interruption, état du canal sonore ou du canal de présentation, et certaines exceptions de sécurité. Ce code générique ne permet pas de désigner le réglage précis, ni de garantir que le build installé contient exactement le même code.
- Plusieurs destinataires n'ont aucun reçu enregistré. Cela ne suffit pas à conclure qu'ils n'ont rien reçu : les capacités et chemins de télémétrie diffèrent, et des reçus peuvent attendre la réouverture de l'application ou la reprise réseau.
- Les transports FCM/Expo et la présence du marqueur natif v6 diffèrent selon les destinataires. Ce n'est pas une preuve de builds différents ; l'inscription des jetons et des capacités doit être contrôlée par appareil.
- Les positions lues sont des instantanés actuels, pas un historique de la présence réelle des conducteurs dans la pièce. Aucun diagnostic d'exclusion géographique individuel n'est affirmé.
- Aucun test sur appareil physique, aucune reproduction de sonnerie, aucune capture native et aucune correction fonctionnelle dans cette intervention.

## Suite ciblée

Identifier la commande exacte parmi les deux et un téléphone silencieux, vérifier son build et l'enregistrement de ses capacités push, puis relever le motif audio précis et les réglages des canaux. Améliorer la remontée et la granularité des diagnostics avant de modifier les règles de sonnerie ; conserver les protections contre les doublons et les alertes expirées. Ne pas contourner les choix de silence du téléphone.

Les scripts temporaires, non versionnés, sont dans `.expo/diagnostics/production-ringing-2026-11-10.cjs` et son fichier de lancement ECS. La syntaxe JavaScript a été vérifiée avant exécution. Le rapport est une observation d'incident, pas une validation bout en bout de tous les appareils.
