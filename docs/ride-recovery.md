# Confirmations de secours pendant un trajet

Documentation détaillée : [parcours et architecture côté mobile](RIDE_RECOVERY_MOBILE.md), [bilan des modifications de la conversation](MODIFICATIONS_CONVERSATION.md).

Les accès se trouvent dans les navigations d’un trajet `ongoing` : « Manuel » dans l’en-tête conducteur, « Confirmation manuelle » dans le panneau inférieur passager. Ce dernier est masqué lorsque la carte est agrandie. Le bouton n’est pas ajouté au détail ordinaire d’une demande ou à l’accueil ; déployer uniquement le backend ne fait pas apparaître ces contrôles sur le téléphone.

## Comportement

- L’automatisme reste actif. Les écrans de navigation conducteur et passager proposent une confirmation manuelle accessible sans attendre le réseau.
- Un point GPS récent à moins de 200 m pendant 20 secondes met cet accès en évidence. L’absence de GPS n’empêche pas l’accès manuel. Aucun modal ne s’ouvre automatiquement devant le conducteur.
- Une déclaration est sauvegardée sur le téléphone avant tout envoi. Les messages distinguent sauvegarde locale, envoi, réception serveur, attente de l’autre personne, validation et désaccord.
- L’embarquement et l’arrivée nécessitent deux déclarations concordantes, ou la détection automatique existante. Une déclaration seule ne change pas les indicateurs définitifs et ne déclenche aucun paiement.
- L’arrivée peut être enregistrée hors connexion après une déclaration locale d’embarquement. Le serveur attend la validation de l’embarquement avant de l’accepter.
- Les désaccords empêchent les transitions automatiques suivantes et nécessitent l’assistance. Une réservation annulée, expirée, non embarquée ou devenue incompatible n’est pas réactivée automatiquement.
- Les nouvelles notifications ouvrent la navigation du destinataire. Le formulaire de secours conserve les zones de sécurité Android/iOS.

## Synchronisation et limites

- Redux Toolkit contient les états locaux ; toutes les nouvelles requêtes HTTP passent par RTK Query.
- File AsyncStorage séparée par compte, écritures sérialisées, identifiant stable par événement, contrôles d’identité côté serveur. Limite de 100 événements ; seuls les événements déjà confirmés peuvent être évincés pour faire de la place. Un échec d’écriture ne donne pas de confirmation de sauvegarde.
- Un seul worker lorsque l’application est au premier plan et connectée. Reprise à la réouverture / reconnexion, délai croissant jusqu’à deux minutes avec décalage aléatoire. Aucun envoi garanti lorsque l’application est fermée ou suspendue par Android/iOS.
- Les déclarations non transmises depuis 72 heures sont conservées mais soumises à l’assistance, pas rejouées aveuglément. Tolérance de cinq minutes pour l’horloge du téléphone.
- Les données essentielles de navigation sont conservées pendant 72 heures, au plus six entrées par compte. Une copie dépassant 150 000 caractères JSON est refusée : le contrôle porte sur la longueur de chaîne, pas sur un plafond exact de 150 Ko. Elles sont utilisées uniquement en repli sur une erreur réseau/serveur, jamais sur un refus d’accès. Les champs de position temps réel sont neutralisés dans ces copies. Les cartes et le recalcul d’itinéraire restent dépendants de la connexion.

## Backend et déploiement

1. Sauvegarder la base et appliquer **en préproduction** la migration `1780000035000-AddRideDeclarations` avec la procédure TypeORM habituelle.
2. Déployer le backend compatible puis l’application. Les anciens endpoints manuels sont eux aussi soumis à la confirmation des deux parties ; prévoir une mise à jour coordonnée des clients pour que chacun dispose de l’interface de réponse.
3. Valider les scénarios ci-dessous sur deux téléphones avant publication. Aucune migration ni aucun déploiement n’ont été effectués par cette modification du code.

Le guide `supabase-postgres-best-practices` a conduit à garder les transactions courtes (verrou trajet puis réservation), à utiliser des mises à jour conditionnelles pour les automatismes et un index partiel pour le worker de suivi. Aucun appel de notification ou de paiement n’est effectué sous ces verrous.

Les reçus JSONB sont bornés à deux étapes et deux participants. Les sauvegardes GPS existantes ne sélectionnent pas ces colonnes pour ne pas écraser un reçu concurrent. Le worker de suivi est durable et possède une réservation temporaire/version ; il traite les étapes dans l’ordre. Les effets externes sont **au moins une fois**, pas une garantie de notification unique. Les paiements réutilisent les protections d’idempotence du service financier existant ; aucun débit carte/Mobile Money n’est lancé par la file locale.

API authentifiée : `GET ride-declarations/booking/:id`, `GET ride-declarations/trip/:id` (conducteur), `PUT ride-declarations/booking/:id`. Corps PUT : `eventId`, `actorUserId`, `stage` (`pickup`/`dropoff`), `decision` (`confirm`/`reject`), `occurredAt`, position/accuracy facultatives. L’identité JWT doit correspondre à `actorUserId` ; le rôle est calculé depuis le trajet.

## Recette obligatoire sur appareils

- Déclarer à bord en mode avion, fermer puis rouvrir l’app, rétablir Internet : même événement, pas de doublon, puis confirmation par l’autre téléphone.
- Couper le réseau après l’envoi mais avant la réponse ; répéter pour l’arrivée et vérifier un seul règlement / crédit conducteur.
- Enregistrer embarquement puis arrivée hors ligne ; reconnecter d’abord un seul téléphone, puis l’autre.
- Vérifier le désaccord, les GPS périmés, les réponses simultanées, l’annulation pendant une coupure et le changement de compte pendant un envoi.
- Tester un stockage plein : aucun message mensonger de sauvegarde et possibilité de réessayer.
- Tester la mise en arrière-plan prolongée, les petits écrans Android à trois boutons, le bouton Retour et iOS après fermeture des modals.
- Redémarrer le backend entre validation de l’arrivée et traitement des effets ; vérifier les journaux, les notifications, le solde et les écritures financières.

Tests automatisés : `node --test tests/*.test.js` dans l’application ; suites `ride-declaration` et `bookings.service.spec` dans le backend. Les doubles de base de données vérifient la logique transactionnelle ; ils ne remplacent pas un test de concurrence sur PostgreSQL réel.
