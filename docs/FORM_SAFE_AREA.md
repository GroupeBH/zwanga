# Boutons de formulaires et barres système Android

## Règle de mise en page

`components/forms/FormLayout.tsx` centralise la protection :

- `FormScreen` mesure la fenêtre courante, puis réserve ses quatre zones de
  sécurité avec la vue native `SafeAreaView` (navigation à trois boutons,
  navigation gestuelle, encoche et paysage).
- Un second provider **dans la zone déjà protégée** fournit les insets restants
  aux descendants. Un `SafeAreaView` imbriqué ne réserve donc pas deux fois la
  barre de navigation.
- `FormModal` applique cette structure **dans la fenêtre native du modal Android**,
  jamais à partir de mesures de l'écran situé derrière. Les propriétés natives,
  callbacks de fermeture et de présentation sont conservés. Le contenu des
  modals iOS reste inchangé.
- Les providers restent hors des cartes animées, `ScrollView` et
  `KeyboardAvoidingView`. Pas de hauteur de barre supposée, de polling, de
  lecture réseau, ni de nouvelle dépendance native.

Ne pas injecter `initialWindowMetrics` dans un modal : il peut s'ouvrir dans une
fenêtre différente ou après un changement d'orientation. Ne pas additionner
`insets.bottom` de l'écran parent au footer Android d'un `FormModal` : la zone
système est déjà réservée, seul l'espacement visuel reste nécessaire.

Références : [SafeAreaProvider et fenêtres de modals](https://appandflow.github.io/react-native-safe-area-context/api/safe-area-provider/),
[propriétés natives de Modal](https://reactnative.dev/docs/modal).

## Éléments couverts

- Publication et demande de trajet : zone de sécurité par écran, boutons dans
  la zone d'évitement du clavier, hors du contenu défilant.
- Modification d'un trajet depuis son détail ou « Mes trajets » : modal protégé
  et suppression du déplacement manuel égal à la hauteur du clavier, qui
  pouvait se cumuler avec le redimensionnement Android.
- Modification/acceptation d'une demande, modification d'un itinéraire,
  réservation et contacts de sécurité depuis le détail d'un trajet.
- Création/modification de véhicules, contacts d'urgence, lieux favoris ;
  sélection sur carte, recharge/partage de jetons, abonnement, PIN, support,
  vérification et formulaire de fin de trajet.
- Véhicule : hauteur bornée, champs défilants et boutons fixes dans le modal.
  Les écouteurs du clavier sont retirés dès que ce formulaire est fermé.

Les mutations, valeurs saisies, règles de validation et callbacks métier restent
inchangés.

## Vérification

```powershell
npm.cmd run test:form-layout
node --test tests/*.test.js
node node_modules/typescript/bin/tsc --noEmit
```

Les tests automatisés vérifient les limites des providers, la conservation des
callbacks, le placement des footers, le défilement et le cycle de vie du clavier.
Ils ne simulent pas le rendu des barres système natives.

À valider sur téléphone Android avec navigation gestuelle **et** à trois boutons :

1. Aller au dernier bouton de publication/demande, puis aux deux formulaires de
   modification. Les boutons doivent rester au-dessus de la barre système.
2. Dans un formulaire véhicule, ouvrir le clavier sur le dernier champ, faire
   défiler les champs, fermer le clavier puis rouvrir le formulaire.
3. Tester les modals depuis plusieurs écrans, y compris après le sélecteur de
   lieu : aucune ancienne marge ne doit être réutilisée.
4. Tester petit écran, orientation paysage lorsque permise et grand texte ; les
   champs longs doivent défiler et la validation rester accessible.
5. Vérifier « Retour » Android, fermeture par le fond, validation et conservation
   des valeurs. Vérifier aussi les présentations iOS existantes.

Aucune validation visuelle sur téléphone n'est revendiquée par les tests Node.
