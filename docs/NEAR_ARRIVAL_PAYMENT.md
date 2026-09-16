# Paiement à proximité de la destination

## Comportement

À **150 mètres ou moins de son propre point de dépose**, un passager embarqué
ayant choisi **Mobile Money, carte bancaire ou jetons** voit le formulaire de
paiement existant. Le seuil correspond à la distance géographique jusqu’au point,
pas à la distance routière restante. Le déclenchement dépend des positions reçues.

- Aucun débit n’est lancé par l’ouverture du formulaire : le passager doit valider.
- Le bouton « Payer à l’arrivée » reporte le formulaire jusqu’à la dépose effective.
- Les paiements en espèces et les trajets gratuits ne déclenchent pas ce formulaire anticipé.
- Une position manquante, ancienne ou invalide ne déclenche pas une nouvelle demande.
- Le montant convenu reste inchangé. Le serveur reste responsable du montant débité.
- Le paiement n’enregistre ni une arrivée ni une fin de réservation.
- Le succès affiche « Continuer le trajet » ; les récompenses restent liées à l’arrivée.
- Une confirmation de paiement déjà acquittée dans l’application n’est pas redemandée à l’arrivée.

Une fois ouvert, le formulaire ne disparaît pas à cause des fluctuations du GPS.
Les références des opérations Mobile Money/carte en cours sont conservées par le
mécanisme existant. Le formulaire se rétablit après une reprise de l’application.
Reporter le formulaire ne masque pas le paiement encore dû à l’arrivée.

## Application mobile

- `features/arrival-payment/nearArrivalPolicy.ts` : seuil, fraîcheur de 30 secondes,
  destination personnelle, embarquement et modes admissibles.
- `hooks/arrival-payment/useNearArrivalPayment.ts` : réutilisation du socket partagé,
  des données RTK Query et de leur secours HTTP, sans nouvel observateur GPS.
- `useArrivalPaymentState` : priorité au paiement d’une arrivée effective, puis au
  paiement anticipé ; mémorisation du report, sans acquitter la réservation.
- Le formulaire distingue « Préparez votre arrivée » et « Vous êtes arrivé ».
  La confirmation en espèces reste exclusivement disponible après l’arrivée.
- `useArrivalPaymentSubmission` verrouille immédiatement la soumission contre les
  doubles clics, avant même le prochain rendu React.

Les lectures et mutations HTTP passent par RTK Query. Les abonnements de suivi sont
libérés lorsque l’application passe en arrière-plan. Le suivi natif du trajet reste
indépendant et conserve les optimisations énergétiques précédentes.
L’annonce vocale d’approche est conservée, mais son simple dialogue d’information
ne se superpose plus au formulaire pour un paiement numérique encore dû.

## Backend

Dans `zwanga-backend/src/bookings/near-arrival-payment.ts`, le serveur contrôle
lui-même les conditions, à partir de ses données enregistrées :

1. Réservation acceptée, trajet en cours, embarquement enregistré.
2. Mode électronique ou jetons, sans contestation d’embarquement/dépose.
3. Position conducteur ou passager récente à 150 mètres au plus de la destination
   personnelle ; la destination du trajet n’est utilisée qu’en l’absence de destination personnelle.

Les règles de paiement après l’arrivée restent disponibles. Pour les jetons,
la condition est revérifiée sous le verrou existant de réservation. Un paiement
déjà confirmé ne redébite pas le portefeuille. Le paiement anticipé ne libère
pas les gains conducteur avant la fin de réservation. Le traitement existant des
ajustements d’interruption et des paiements électroniques en cours est conservé.

## Déploiement et validation

**Déployer le backend avant l’application mobile.** Sans cette mise à jour serveur,
le formulaire pourrait s’ouvrir mais le serveur refuserait le paiement anticipé.
Aucune migration SQL, nouvelle variable d’environnement ou dépendance n’est nécessaire.

Tests ciblés :

```text
# Application
node --test tests/nearArrivalPayment.test.js tests/arrivalPaymentSubmission.test.js

# Dans zwanga-backend
node node_modules/jest/bin/jest.js --runInBand src/bookings/near-arrival-payment.spec.ts src/bookings/bookings.service.spec.ts
```

Sur appareils réels, vérifier les modes jetons, Mobile Money et carte ; une
destination passager différente du terminus ; le report à l’arrivée ; une
connexion lente ; un retour depuis le fournisseur de paiement ; et une
interruption du trajet après paiement anticipé. Aucun paiement réel n’est exécuté
par les tests automatisés.

Note de validation : la compilation de production du backend est vérifiée avec
`tsc -p tsconfig.build.json --noEmit --incremental false`. La vérification TypeScript
incluant tous ses fichiers de tests signale trois erreurs préexistantes dans
`src/users/legal-identity.spec.ts` et `src/users/user-gender.spec.ts`, non modifiés ici.
