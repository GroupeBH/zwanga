# Formulaires de jetons : clavier et blocage après fermeture sur iOS

## Problème identifié

La capture iOS montre le formulaire de partage déplacé au-dessus de l’écran. Dans `WalletSheetModal`, la carte imposait `minHeight: '90%'` dans un `KeyboardAvoidingView` qui ajoutait un espace inférieur pour le clavier. Cette hauteur minimale empêchait le panneau de se réduire suffisamment. Les champs étaient aussi placés dans un simple `View`, sans possibilité de défiler pour atteindre les éléments masqués.

Ce conflit de disposition explique le débordement observé. Le retour suivant précise que l’application reste affichée mais ne répond plus après la fermeture du formulaire. L’ancienne composition montait deux fenêtres `Modal` natives pour le portefeuille, en plus des alertes du `DialogProvider`. Le contenu était retiré dès que `visible` devenait faux, alors que sur iOS le contrôleur natif peut rester présent jusqu’à sa notification de fermeture. Les alertes de succès ou d’erreur pouvaient aussi être présentées pendant cette transition. Ce sont des risques de couche invisible interceptant les interactions ; ils sont supprimés ici sans attendre un délai arbitraire de fermeture.

Le symptôme reste à vérifier sur un véritable iPhone : les tests JavaScript ne reproduisent pas le gestionnaire de fenêtres natif d’iOS.

## Correction mobile

- Le panneau conserve une hauteur souhaitée de 90 % de la fenêtre sans clavier, mais sa hauteur minimale est désormais nulle et il peut se réduire dans l’espace réellement disponible.
- Une vue intermédiaire bornée isole l’espace restant après l’ajustement du clavier ; le haut et les côtés respectent les zones de sécurité du modal.
- Les champs et les actions sont dans un `ScrollView`. L’en-tête et son bouton de fermeture restent en dehors du défilement.
- Un premier appui sur l’action du formulaire fonctionne même avec le clavier ouvert. Un glissement dans le contenu permet de masquer le clavier.
- iOS utilise un seul ajustement par `KeyboardAvoidingView`, sans correction automatique supplémentaire des marges du `ScrollView`.
- Le formulaire reste visuellement un modal, mais c’est désormais une vue superposée dans le portefeuille, sans `Modal` natif ni animation de fermeture UIKit. Quand il est fermé, le composant retourne `null` : le fond qui intercepte les clics disparaît avec le formulaire dans la même mise à jour React.
- Android conserve le redimensionnement de l’activité (`adjustResize` dans `AndroidManifest.xml`), sans deuxième ajustement de hauteur en JavaScript. Les marges sûres sont mesurées par le `SafeAreaProvider` de la vue superposée, et l’espace inférieur est conservé dans le contenu défilant.
- Les trois modes de fermeture (croix, fond et retour Android) demandent d’abord la fermeture du clavier.
- Tout le panneau est retiré lorsqu’il est fermé ou lorsque le portefeuille n’est plus l’écran actif : aucun fond invisible, champ caché ni `KeyboardAvoidingView` inactif ne reste monté. Les valeurs saisies restent dans le contrôleur du portefeuille, donc fermer et rouvrir conserve le brouillon.
- Un unique gestionnaire du retour Android ferme le formulaire. Il n’est actif que pendant l’affichage du panneau et est retiré à sa fermeture, à la perte de focus et au démontage. Son abonnement reste stable pendant la saisie.
- Le geste de retour iOS est désactivé tant que le formulaire est ouvert. Les commandes derrière le panneau sont alors masquées pour l’accessibilité et ne capturent pas les clics. Elles sont réactivées dans la même mise à jour qui retire le panneau. L’échappement VoiceOver ferme également le formulaire.
- Les messages de confirmation ou d’erreur continuent d’utiliser le `DialogProvider` existant. Le portefeuille ne présente plus une deuxième fenêtre native sous ces messages. Aucune temporisation de fermeture et aucun rejeu de requête ne sont nécessaires.

La recharge utilise le même composant et reçoit la même correction. Les mutations RTK Query, les montants, le bénéficiaire, le suivi du paiement et le fonctionnement du transfert n’ont pas été modifiés. Aucun écouteur clavier personnalisé, timer, calcul de hauteur à chaque événement de clavier ou appel réseau n’est ajouté.

Fichiers concernés : `features/wallet/WalletSheetModal.tsx`, `features/screen-styles/app/wallet/container.styles.ts` et la protection temporaire des commandes/gestes et les libellés accessibles dans `app/wallet.tsx`.

## Vérifications

`tests/walletSheetKeyboard.test.js` vérifie les contraintes de réduction, le défilement, la fermeture accessible, l’absence de double ajustement Android/iOS, les changements de taille de fenêtre, la suppression complète du panneau fermé, la conservation du brouillon et les actions existantes du partage et de la recharge. Il couvre aussi quarante cycles ouverture/fermeture, la réactivation des commandes du portefeuille, le retour et le nettoyage des abonnements, le changement d’écran et l’absence de fenêtre `Modal` native. Les ouvertures de paiement et les transferts sont simulés : aucun jeton n’est envoyé pendant les tests.

L’empreinte des styles du portefeuille dans `tests/fixtures/sourceExtractions.json` est actualisée pour ces changements intentionnels. Les autres empreintes sont conservées.

À vérifier sur appareil : toucher chacun des trois champs, changer de type de clavier, atteindre puis toucher le bouton de partage, faire défiler, fermer avec le clavier ouvert, rouvrir, passer de partage à recharge, tester un petit écran et une grande taille de texte. Tester le paiement uniquement dans un environnement de test.

Références : documentation officielle [KeyboardAvoidingView](https://reactnative.dev/docs/keyboardavoidingview), [ScrollView](https://reactnative.dev/docs/scrollview), [fermeture des modals iOS](https://reactnative.dev/docs/modal#ondismiss), [retour Android](https://reactnative.dev/docs/backhandler), ainsi que le cycle `visible/isRendered/onDismiss` installé dans `node_modules/react-native/Libraries/Modal/Modal.js`.
