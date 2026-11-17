"""Produce the requested printable checklist; no application or external I/O."""
from pathlib import Path
import sys
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tmp/pdfs/deps'))

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, Flowable, CondPageBreak,
)

OUT = ROOT / 'output/pdf/checklist-avant-deploiement-zwanga-2026-11-16.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
for name, file in [('Arial', 'arial.ttf'), ('Arial-Bold', 'arialbd.ttf'), ('Arial-Italic', 'ariali.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(Path('C:/Windows/Fonts') / file)))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold', italic='Arial-Italic', boldItalic='Arial-Bold')

INK = colors.HexColor('#19242D')
MUTED = colors.HexColor('#4C5963')
LINE = colors.HexColor('#CCD2D7')
PALE = colors.HexColor('#F3F5F6')
WIDTH, HEIGHT = A4
MARGIN = 17 * mm
CONTENT_WIDTH = WIDTH - 2 * MARGIN

styles = {
    'body': ParagraphStyle('body', fontName='Arial', fontSize=10, leading=14, textColor=INK, spaceAfter=6),
    'small': ParagraphStyle('small', fontName='Arial', fontSize=8.8, leading=12, textColor=MUTED, spaceAfter=4),
    'item': ParagraphStyle('item', fontName='Arial', fontSize=10, leading=13.6, textColor=INK),
    'h1': ParagraphStyle('h1', fontName='Arial-Bold', fontSize=26, leading=30, textColor=INK, spaceAfter=12),
    'h2': ParagraphStyle('h2', fontName='Arial-Bold', fontSize=14, leading=18, textColor=INK, spaceBefore=13, spaceAfter=8, keepWithNext=True),
    'h3': ParagraphStyle('h3', fontName='Arial-Bold', fontSize=10.8, leading=14, textColor=INK, spaceBefore=6, spaceAfter=5, keepWithNext=True),
    'table': ParagraphStyle('table', fontName='Arial', fontSize=9, leading=12, textColor=INK),
    'tablehead': ParagraphStyle('tablehead', fontName='Arial-Bold', fontSize=9, leading=12, textColor=INK),
}

def clean(text):
    return text.replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', '-').replace('\u202f', ' ').replace('\u00a0', ' ')

def p(text, style='body'):
    return Paragraph(clean(text), styles[style])

class CheckItem(Flowable):
    """One indivisible row, with a vector checkbox and a stable test identifier."""
    def __init__(self, code, text):
        super().__init__()
        self.code = code
        self.text = clean(text)
        self.para = p(escape(text), 'item')
        self.left = 48
    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        _, self.textheight = self.para.wrap(availWidth - self.left, availHeight)
        self.height = self.textheight + 8
        return self.width, self.height
    def draw(self):
        c = self.canv
        c.setStrokeColor(MUTED)
        c.setLineWidth(.7)
        c.rect(0, self.height - 13, 8, 8, fill=0, stroke=1)
        c.setFillColor(MUTED)
        c.setFont('Arial', 8)
        c.drawString(14, self.height - 12, self.code)
        self.para.drawOn(c, self.left, 4)

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.saved_pages = []
    def showPage(self):
        self.saved_pages.append(dict(self.__dict__))
        self._startPage()
    def save(self):
        count = len(self.saved_pages)
        for state in self.saved_pages:
            self.__dict__.update(state)
            self.draw_furniture(count)
            super().showPage()
        super().save()
    def draw_furniture(self, count):
        self.saveState()
        self.setStrokeColor(LINE)
        self.setLineWidth(.5)
        self.line(MARGIN, HEIGHT - 14 * mm, WIDTH - MARGIN, HEIGHT - 14 * mm)
        self.line(MARGIN, 14 * mm, WIDTH - MARGIN, 14 * mm)
        self.setFillColor(INK)
        self.setFont('Arial-Bold', 9)
        self.drawString(MARGIN, HEIGHT - 11 * mm, 'ZWANGA')
        self.setFont('Arial', 8)
        self.setFillColor(MUTED)
        self.drawRightString(WIDTH - MARGIN, HEIGHT - 11 * mm, 'RECETTE AVANT DÉPLOIEMENT')
        self.drawString(MARGIN, 9 * mm, 'Édition du 16/11/2026 | Modifications du 13 au 15 novembre 2026')
        self.drawRightString(WIDTH - MARGIN, 9 * mm, f'{self._pageNumber} / {count}')
        self.restoreState()

# Preserve the complete checklist supplied in the conversation, not just a summary.
SECTIONS = [
('Préparer l’environnement de recette', [
'Figer les versions exactes des quatre projets à tester ; ne plus modifier le code pendant la campagne.',
'Utiliser une base de recette sauvegardée, avec des données fictives et un historique existant.',
'Préparer un passager, un conducteur privé, un taxi/moto-taxi et un conducteur interurbain.',
'Préparer des comptes KYC approuvé, en attente, refusé et sans dossier.',
'Préparer deux organisations partenaires, un administrateur, un gestionnaire et un utilisateur en lecture seule.',
'Utiliser au minimum un Android physique et un iPhone physique ; ajouter plusieurs conducteurs pour les alertes concurrentes.',
'Séparer les tests métier sans envois externes des essais SMS/push autorisés, réservés aux téléphones de recette.',
'Noter pour chaque résultat : version/build, téléphone, scénario, résultat attendu, résultat observé et preuve.',
]),
('Connexion, inscription et récupération du compte', [
'Connexion avec un compte existant ; mauvais mot de passe ; numéro invalide ou inconnu.',
'Inscription complète passager et conducteur, sans champ obligatoire inaccessible ou masqué par le clavier.',
'Vérifier que mot de passe personnel et code SMS sont clairement distingués.',
'OTP correct, incorrect, expiré, déjà utilisé ; renvoi du code et respect du délai.',
'Vérifier les formats prévus : inscription à cinq chiffres, récupération à six chiffres, mot de passe personnel à quatre chiffres.',
'Réinitialisation complète : ancien mot de passe refusé, nouveau accepté.',
'Compte ancien non vérifié : explication claire, validation OTP, puis disparition du rappel après reconnexion.',
'Google/Apple : succès, annulation et retour dans le bon parcours.',
'Coupure réseau, double appui, fermeture et réouverture pendant l’inscription : aucun doublon de compte.',
'Vérifier le fournisseur SMS réellement utilisé sur l’environnement de recette, sans exposer les identifiants.',
'Vérifier les préférences d’annonces, le parrainage et la reprise du brouillon.',
]),
('Profil, catégories et navigation', [
'Vérifier la matrice des profils ci-dessous après inscription, modification du profil, reconnexion et mise à jour de l’application.',
'Le changement de catégorie est enregistré côté serveur et immédiatement reflété dans l’application.',
'Une ancienne réponse réseau ne rétablit pas la catégorie précédente.',
'Un changement de compte ne conserve ni les revenus ni les dossiers du compte précédent.',
'Les conducteurs privés/interurbains accèdent à leurs revenus depuis l’écran des trajets.',
'Les anciens comptes sans catégorie gardent un parcours utilisable.',
'Changer de catégorie ne donne aucun droit conducteur ou KYC supplémentaire.',
]),
('KYC et publication d’un trajet', [
'KYC approuvé : publication classique autorisée.',
'KYC absent, en attente ou refusé : publication refusée par l’API, même en contournant l’interface.',
'Ancien dossier approuvé mais dernier dossier refusé : publication refusée.',
'Vérifier également la génération récurrente et la conversion d’un trajet privé en trajet public.',
'Retirer l’approbation entre l’ouverture du formulaire et l’enregistrement : aucune publication non autorisée.',
'Une erreur de lecture KYC n’autorise pas la publication par défaut.',
'Un refus ne crée ni occurrence partielle ni avancement incorrect du calendrier de répétition.',
'Publication complète : adresses, date/heure, répétition, véhicule, places, estimation modifiable et paiements.',
'Après publication, ouverture du bon détail avec carte, trajet et actions.',
'Modification, annulation et démarrage restent fonctionnels ; conflits horaires et droits sur le véhicule restent contrôlés.',
]),
('Commande et estimations tarifaires', [
'Commander depuis l’accueil passager et depuis « Commander un trajet » côté conducteur.',
'Départ GPS automatique ; GPS refusé ou indisponible : choix manuel possible.',
'Commune seule : référence obligatoire à l’extrémité concernée ; avenue ou lieu précis : comportement cohérent.',
'Choisir un ou plusieurs types de véhicules ; vérifier chaque estimation.',
'En conditions normales, vérifier les grilles voiture, moto deux roues et moto trois roues, ainsi que le minimum applicable.',
'L’explication du tarif correspond au véhicule sélectionné, y compris pendant la publication.',
'Modifier le budget puis changer un autre champ : le prix saisi ne doit pas être remplacé silencieusement.',
'Plusieurs places : contrôler la concordance entre total affiché, valeur envoyée et total enregistré, sans multiplication supplémentaire.',
'Commander maintenant ou plus tard ; modifier une commande existante sans perdre prix, références ou véhicules.',
'Double appui ou réponse réseau perdue : une seule commande créée.',
]),
('Distribution des commandes et alertes', [
'Backend : tester zéro, un, quatre et plus de quatre conducteurs admissibles.',
'Au maximum quatre invitations dans une vague ; aucune cinquième invitation concurrente.',
'Un refus partiel ne complète pas immédiatement la vague ; la suivante part lorsque la vague précédente est terminée.',
'Deux conducteurs acceptent simultanément : un seul obtient la commande.',
'Une négociation ferme les invitations concurrentes et réserve l’échange.',
'Un conducteur ciblé sur la carte conserve son exclusivité ; tester refus et expiration des trois minutes.',
'Vérifier proximité, type de véhicule, places, KYC, conflits horaires et positions de moins de 48 heures.',
'Une position de 48 heures ou plus n’entraîne pas de nouvelle alerte.',
'Redémarrage du worker ou panne Redis : reprise sans perte, double attribution ni multiplication des invitations.',
'Téléphones : tester application ouverte, en arrière-plan et téléphone verrouillé sur Android et iPhone.',
'Vérifier sonnerie, identification de sa source, notification et ouverture de la bonne commande.',
'Déverrouiller pendant la sonnerie ; recevoir une autre notification ; revenir dans Zwanga.',
'Accepter, refuser, annuler ou laisser expirer : vérifier l’arrêt de la sonnerie et la fermeture de l’ancienne alerte.',
'Après reconnexion, une commande expirée ou déjà attribuée ne doit pas recommencer à sonner.',
'Vérifier socket seul, récupération REST et push ; leurs doublons ne doivent pas créer plusieurs modals.',
'Tester permissions refusées, volume bas, mode silencieux/Concentration et restrictions batterie, en distinguant limitations du téléphone et échec serveur.',
'Après la fin d’un trajet, une prochaine commande disponible peut être proposée sans masquer une action prioritaire.',
]),
('Marchandage avant prise en charge', [
'Acceptation directe au prix de la commande, sans négociation.',
'Proposition conducteur puis acceptation passager.',
'Proposition conducteur, contre-proposition passager, puis acceptation conducteur.',
'Proposition conducteur, contre-proposition passager, prix ferme conducteur, puis acceptation passager.',
'Le passager peut refuser le prix ferme et chercher un autre conducteur ; aucun tour supplémentaire n’est proposé.',
'Le conducteur peut renoncer ; la commande reste récupérable conformément au flux prévu.',
'À chaque tour, le bon interlocuteur est alerté et retrouve la même commande, pas une proposition isolée.',
'Seule la dernière offre peut être acceptée ; une ancienne notification ne permet pas d’accepter un ancien prix.',
'Tester expiration, double appui, réponse perdue et acceptation concurrente.',
'Vérifier les délais sans prolongation artificielle après rafraîchissement ou réouverture.',
'L’indicateur des autres conducteurs distingue disponibilité récente, positions anciennes et information indisponible, sans promettre un remplacement.',
'Ancien mobile : accepter/refuser reste utilisable ; aucun nouveau tour incompatible.',
'Le montant finalement convenu est identique dans le trajet, la réservation, le paiement et les revenus.',
]),
('Informations après acceptation', [
'Chaque participant voit la bonne identité ; le passager voit le bon véhicule.',
'Le point de rendez-vous et sa référence restent distincts de la position actuelle du passager.',
'Distance et temps d’approche correspondent au trajet routier disponible.',
'Position ancienne ou itinéraire indisponible : aucune estimation inventée.',
'Annulation ou changement de conducteur pendant le chargement : les anciennes informations disparaissent.',
'Un compte tiers ne peut pas consulter ce récapitulatif via l’API.',
'Les actualisations s’arrêtent hors écran actif ou hors connexion.',
]),
('Navigation, embarquement et arrivée', [
'Avant embarquement : passager, lieu et action manuelle lisibles, sans masquer excessivement la carte.',
'Une simple déclaration locale ne masque pas prématurément le panneau.',
'Après embarquement confirmé : le panneau se réduit ; « Passagers », contact et SOS restent accessibles.',
'À plus de 500 m, puis juste avant, à et après 500 m : vérifier le retour du panneau.',
'Après son retour, une fluctuation GPS ne le fait pas clignoter.',
'Avec plusieurs passagers, le seuil correspond à la destination du bon passager.',
'GPS ancien, imprécis ou absent : les confirmations manuelles redeviennent accessibles.',
'Ouvrir manuellement les détails n’annonce pas à tort « Vous êtes arrivé ».',
'Réservation entrante, interruption ou confirmation en attente : actions prioritaires toujours visibles.',
'Retour à l’accueil, changement d’onglet et réouverture : reprise du bon trajet, sans refresh en boucle.',
'Dépose, paiement, clôture et notation des deux côtés fonctionnent dans le bon ordre.',
]),
('Voix et GPS en veille', [
'Sur Android et iPhone physiques, avec un trajet de recette : vérifier les permissions réellement accordées, pas seulement les déclarations de configuration.',
'Contrôler les positions reçues par le backend avec l’application ouverte.',
'Répéter écran verrouillé pendant 2, 5 et 15 minutes, puis sur l’accueil du téléphone.',
'Vérifier la progression réelle des horodatages et coordonnées, pas seulement un indicateur « Connecté ».',
'Vérifier les instructions vocales aux changements de direction et à l’approche des arrêts.',
'Tester coexistence avec une alerte de commande, un appel et une sortie audio Bluetooth.',
'Couper puis rétablir le réseau : reprise sans rafale d’annonces périmées.',
'Terminer le trajet ou se déconnecter : arrêt du suivi et des annonces.',
'Distinguer mise en arrière-plan, fermeture par le système et arrêt forcé.',
]),
('Paiements, gains et retraits', [
'Paiement cash : déclaration passager, modal conducteur, puis confirmation unique de réception.',
'Le modal fonctionne depuis la navigation, l’accueil et le détail.',
'Paiement entièrement en jetons, entièrement Mobile Money et paiements mixtes.',
'Succès Mobile Money retardé, callback dupliqué, réponse perdue et bouton « Vérifier » : aucun double crédit ou double règlement.',
'Ne pas inviter à payer une deuxième fois alors qu’un paiement reste incertain.',
'Vérifier montant brut, commission, remboursement crédit et revenu net.',
'Retrait partiel et total ; solde insuffisant ; échec et récupération d’un retrait.',
'Rafraîchissement et reconnexion ne doublent aucune écriture.',
'Récompenses, avances cash et fonds non retirables conservent leurs règles.',
'Confirmation de paiement, clôture du trajet et notation restent accessibles sans boucle de modals.',
]),
('Services et acquisition à crédit', [
'Documents, Flottes, Acheter à crédit et services entreprises sont compréhensibles depuis l’onglet et le profil.',
'Livraison, Schools et Health affichent « À venir » et ne démarrent pas un faux parcours actif.',
'Catalogue indisponible ou en erreur : pas de fausse liste vide ni d’ouverture supposée.',
'Les anciens dossiers Documents restent consultables et modifiables.',
'Tester les six types : téléphone, casque, GPS, matériel de livraison, autre équipement et véhicule.',
'« Autre équipement » exige sa précision ; les produits fermés restent bloqués côté API.',
'Un dossier en attente ne peut pas être créé plusieurs fois pour le même type.',
'Une offre existante s’ouvre directement au lieu de créer un nouveau dossier.',
]),
('Offres, frais et échéanciers de crédit', [
'Admin/Partner saisissent prix du bien, frais, pourcentage et éventuelles échéances.',
'Le conducteur voit le total à rembourser, les frais et le taux avant son accord.',
'Exemple de recette : bien à 200 000 FC + frais de 20 000 FC = 220 000 FC, sans répétition des frais à chaque trajet.',
'Sans consentement requis ou avec une ancienne version des conditions : acceptation refusée.',
'Une modification du cumul des taux invalide l’ancien consentement.',
'Aucun prélèvement avant acceptation et remise effective.',
'Échéances hebdomadaires/mensuelles : dates avant/après remise, fins de mois, arrondis et dernière échéance.',
'Les remboursements réels réduisent les minimums restant dus ; aucune deuxième dette n’est créée.',
'La simulation distingue durée indicative et minimums contractuels ; revenu nul ne produit pas une durée garantie.',
'Les conditions acceptées ne peuvent pas être réécrites silencieusement.',
'Les contrats historiques conservent leurs anciennes règles et n’obtiennent pas de frais inventés.',
]),
('Remboursements des crédits', [
'Accès à « Mes remboursements » depuis Profil et Services.',
'Paiement volontaire partiel, total, supérieur au restant et supérieur au solde.',
'Une recharge augmente le solde sans lancer automatiquement un remboursement volontaire.',
'Plusieurs nouveaux contrats : leurs pourcentages s’additionnent, distinctement de la commission.',
'Les anciens contrats à enveloppe partagée conservent cette politique.',
'Dernier remboursement plafonné : aucun crédit ne devient négatif.',
'Crédit soldé : arrêt de sa retenue, sans arrêter les autres contrats.',
'Cash avec solde conducteur insuffisant : seul le montant réellement prélevé compte comme remboursé ; reliquat conservé comme dû.',
'Réponse perdue, double clic, fermeture ou changement de compte : aucun double débit.',
'Correction d’un paiement électronique : remboursement crédit réconcilié correctement.',
'Correction cash nécessitant un opérateur : refus explicite, sans fausse correction automatique.',
'Totaux cohérents entre portefeuille, revenus, contrat, historique, Admin et Partner.',
]),
('Flottes et versements au propriétaire', [
'Création de l’espace, ajout et contrôle du véhicule, proposition d’affectation.',
'Acceptation/refus du conducteur avec conditions et KYC contrôlés.',
'Impossible d’avoir deux affectations ouvertes incompatibles pour le même conducteur ou véhicule.',
'Montant fixe journalier, hebdomadaire ou mensuel clairement accepté.',
'Déclaration d’un versement total ou partiel ; confirmation ou refus motivé par le responsable.',
'Aucun débit de portefeuille lors d’un versement déclaré comme réalisé hors Zwanga.',
'Les montants en attente ne sont pas comptés comme reçus.',
'Le conducteur ne peut pas confirmer son propre versement, même s’il possède un rôle gestionnaire.',
'Double déclaration, double décision, perte réseau et reprise après fermeture : une seule opération.',
'Clôture, règlement tardif, organisation suspendue et historique paginé.',
'Une autre organisation ne peut ni lire ni modifier le contrat.',
'Une affectation ou un crédit véhicule ne donne pas implicitement le droit de conduire le véhicule d’un tiers.',
]),
('Admin, Partner et contrôles d’accès', [
'Effectuer les parcours avec de vraies sessions de recette, pas uniquement des réponses simulées.',
'Vérifier chaque rôle : administrateur, gestionnaire, lecture seule et compte non autorisé.',
'Tester les refus directement sur l’API, même si les boutons sont cachés.',
'Un changement d’identifiant dans une URL ne révèle pas le crédit, le paiement ou la flotte d’autrui.',
'Après expiration de session, aucune mutation ne part sous une ancienne identité.',
'Offre ou décision concurrente : affichage du résultat serveur réel.',
'Après réponse incertaine puis rechargement du portail, vérifier l’absence de création en double ; la reprise persistante reste un point sensible.',
'Aucun secret, OTP ou donnée personnelle inutile dans les logs et rapports.',
]),
('Réseau, disponibilité et performances', [
'Rejouer les parcours critiques en Wi-Fi, réseau mobile lent, coupure et changement de réseau.',
'Simuler indisponibilité API, socket, Redis et fournisseur cartographique, séparément.',
'Tester expiration/renouvellement du jeton pendant une commande et un remboursement.',
'Redémarrer API/worker en recette pendant une opération : reprise sans état incohérent.',
'Vérifier que les lectures répétées s’arrêtent hors écran actif et reprennent sans boucle.',
'Mesurer temps de démarrage, ouverture des écrans, requêtes par minute, mémoire et consommation pendant un trajet prolongé.',
'Répéter navigation, modals et changements d’onglets pour détecter les fuites et boucles de rendu.',
'Tester petit écran, texte agrandi, clavier ouvert et zones de sécurité iOS ; aucun bouton indispensable inaccessible.',
'Faire un test de charge progressif du dispatch, mesurer délais de livraison, files, erreurs et verrous SQL.',
'Analyser les arrêts du backend local et l’ANR Android observé ; établir leur cause ou démontrer leur absence sur le candidat de livraison dans des conditions comparables.',
]),
('Builds, migrations et compatibilité avant livraison', [
'Rejouer le contrôle mobile complet sur le code final : npm run check:release.',
'Rejouer compilation, tests backend complets et suites PostgreSQL/PostGIS/Redis ; un dépassement de délai n’est pas un succès.',
'Rejouer tests, typecheck et builds de production Admin/Partner.',
'Produire et installer les vrais builds Android et iOS ; exécuter le contrôle Ruby/iOS manquant sur macOS.',
'Tester installation neuve et mise à jour depuis la version actuellement publiée.',
'Vérifier conservation de session, commandes en cours, contrats, préférences et autorisations.',
'Tester ancien mobile avec nouveau backend ; les anciennes offres et contrats restent utilisables.',
'Répéter les migrations sur une base de recette représentative ; comparer soldes, contrats et historiques avant/après.',
'Vérifier les migrations de négociation, vagues, crédit, flotte, versements, équipements, catégorie interurbaine, taux et coûts.',
'Préparer un retour arrière qui respecte les données : certains retours de schéma sont volontairement refusés après création de contrats.',
'Répéter l’ordre de livraison : schéma compatible, API et workers compatibles, puis portails/mobile.',
'Pour les vagues de quatre, tester le mode individuel pendant la transition ; ne pas activer quatre avec d’anciens workers.',
'Vérifier configuration des environnements, versions/builds, remontée des erreurs natives et symboles de débogage.',
]),
]

NOTES = {
    6: '<b>Priorité bloquante.</b> Relier création, invitation, réception et affichage. Un push accepté par le fournisseur ne prouve pas que le téléphone a sonné.',
    10: '<b>Point ouvert au dernier bilan :</b> le guidage vocal autonome en veille n’est pas encore corrigé. Un succès au premier plan ne clôture pas ce point. Bloquant si ce fonctionnement est promis dans cette livraison.',
    15: '<b>Limite du périmètre :</b> le registre de flotte ne constitue pas encore toute la gestion de maintenance, télémétrie ou recouvrement automatique.',
}

def grid(data, widths=None, heights=None, header=True):
    rows = [[p(escape(str(cell)), 'tablehead' if header and i == 0 else 'table') for cell in row] for i, row in enumerate(data)]
    t = Table(rows, colWidths=widths, rowHeights=heights, repeatRows=1 if header else 0, hAlign='LEFT')
    commands = [('GRID', (0, 0), (-1, -1), .5, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7)]
    if header:
        commands.append(('BACKGROUND', (0, 0), (-1, 0), PALE))
    t.setStyle(TableStyle(commands))
    return t

story = []
story.append(Spacer(1, 5 * mm))
story.append(p('Checklist avant<br/>déploiement', 'h1'))
story.append(p('<b>Mobile · Backend · Zwanga Admin · Zwanga Partner</b>'))
story.append(p('Modifications du vendredi 13 au dimanche 15 novembre 2026.<br/>Document préparé le 16 novembre 2026 - heure de Kinshasa.', 'small'))
story.append(Spacer(1, 4 * mm))
story.append(p('À compléter pendant la recette', 'h2'))
story.append(grid([
    ['Campagne / environnement', '................................................................................'],
    ['Responsable / dates des essais', '................................................................................'],
    ['Android : modèle, OS, version/build', '................................................................................'],
    ['iPhone : modèle, iOS, version/build', '................................................................................'],
    ['Backend / workers : révision', '................................................................................'],
    ['Admin / Partner : révisions', '................................................................................'],
], widths=[CONTENT_WIDTH * .43, CONTENT_WIDTH * .57], header=False))
story.append(Spacer(1, 4 * mm))
story.append(p('Mode d’emploi', 'h2'))
story.append(p('Cocher une case uniquement après réussite de tous les cas décrits. Inscrire <b>E</b> en cas d’échec, <b>NT</b> si non testé et <b>NA</b> si non applicable, avec justification. Utiliser l’identifiant du contrôle (ex. 06.04) dans le registre des anomalies.'))
story.append(p('Les contrôles communs à Android et iOS doivent être validés sur les deux plateformes. Joindre captures, journaux expurgés et résultats API lorsque nécessaire. Une case vide n’est jamais une validation.'))
story.append(p('État connu avant cette campagne', 'h2'))
story.append(p('<b>Dernier contrôle mobile automatisé :</b> 3 866 réussites, zéro échec, un contrôle Ruby/iOS ignoré. Résultat historique du 15 novembre, non rejoué pour produire ce PDF.'))
story.append(p('<b>Points ouverts :</b> guidage vocal autonome en veille non corrigé ; localisation arrière-plan à vérifier sur appareils physiques ; ANR observé sur le dev client Android et arrêts intermittents du backend local à qualifier.'))
story.append(p('Cette checklist n’est ni un feu vert de livraison ni une garantie d’absence de crash. Les tests automatisés et aperçus web ne remplacent pas les builds et essais natifs. Aucun déploiement n’est autorisé par ce document.', 'small'))
story.append(PageBreak())

all_codes = []
for number, (title, items) in enumerate(SECTIONS, 1):
    story.append(CondPageBreak(95))
    story.append(p(f'{number:02d}. {escape(title)}', 'h2'))
    if number in NOTES:
        story.append(p(NOTES[number], 'small'))
    for item_number, text in enumerate(items, 1):
        code = f'{number:02d}.{item_number:02d}'
        all_codes.append(code)
        story.append(CheckItem(code, text))
        if number == 3 and item_number == 1:
            story.append(grid([
                ['Profil', 'Accueil', 'Troisième onglet'],
                ['Passager', 'Commander un trajet', 'Trajet, vers la recherche'],
                ['Conducteur privé', 'Publication disponible', 'Mes trajets'],
                ['Taxi / moto-taxi', 'Commandes clients, sans bouton de publication', 'Revenus'],
                ['Interurbain', 'Publication disponible', 'Mes trajets'],
            ], widths=[CONTENT_WIDTH * .28, CONTENT_WIDTH * .40, CONTENT_WIDTH * .32]))
            story.append(Spacer(1, 7))
    story.append(p('Testeur / date : ........................................  Résultat / preuve : ........................................', 'small'))

story.append(PageBreak())
story.append(p('Parcours complets obligatoires', 'h2'))
story.append(p('Terminer ces parcours avec mobile + API + base, et portail lorsque concerné. Les composants simulés seuls ne suffisent pas. Rejouer sur Android et iPhone pour les parties mobiles.'))
E2E = [
('Commande directe', 'Alerte, acceptation, récupération, trajet, cash, confirmation, clôture et notes.'),
('Marchandage complet', 'Prix ferme accepté, trajet, paiement électronique, revenus et remboursement crédit.'),
('Changement de conducteur', 'Refus ou retrait, reprise de recherche, nouvelle acceptation, sans ancienne sonnerie persistante.'),
('Trajet publié', 'Publication, réservation, décision conducteur, trajet avec plusieurs passagers, paiements et clôture.'),
('Crédit', 'Dossier mobile, offre Admin/Partner, accord mobile, remise, retenue sur trajet, remboursement volontaire et solde nul.'),
('Flotte', 'Véhicule contrôlé, affectation consentie, versement déclaré, confirmation propriétaire, historique et clôture.'),
]
for i, (title, description) in enumerate(E2E, 1):
    story.append(CheckItem(f'E2E.{i}', f'{title} : {description}'))
    story.append(p('Android : ................  iOS : ................  API / portail : ................  Preuve : ................', 'small'))
    story.append(Spacer(1, 7))
story.append(p('Règles de preuve', 'h2'))
story.append(p('Conserver l’identifiant fictif du trajet/contrat, le résultat API, l’état final en base et les captures des deux rôles. Ne pas inscrire de secret, code OTP, numéro personnel ou donnée de production dans ce document.'))
story.append(p('Pour les alertes : mesurer création → invitation → réception → affichage. Pour les paiements : rapprocher les écritures et soldes avant/après, y compris après un rejeu réseau.'))
story.append(p('Notes de recette', 'h2'))
for _ in range(4):
    story.append(p('................................................................................................................................................', 'small'))
    story.append(Spacer(1, 6))

story.append(PageBreak())
story.append(p('Registre des anomalies', 'h2'))
story.append(p('À dupliquer si nécessaire. Sévérité : bloquante, majeure ou mineure. Après correction, noter le résultat du nouveau test ; ne pas effacer le premier constat.', 'small'))
story.append(grid([
    ['Contrôle / appareil / build', 'Résultat observé et preuve', 'Sévérité / responsable / reprise'],
] + [['', '', ''] for _ in range(7)], widths=[CONTENT_WIDTH * .25, CONTENT_WIDTH * .45, CONTENT_WIDTH * .30], heights=[35] + [73] * 7))
story.append(Spacer(1, 10))
story.append(p('Critiques à suivre : double attribution, double débit, accès non autorisé, contournement KYC, crash/ANR, perte de données et absence d’alerte.', 'small'))

story.append(PageBreak())
story.append(p('Décision avant déploiement', 'h2'))
story.append(p('Le feu vert porte uniquement sur les versions testées et le périmètre explicitement retenu. Toute correction ultérieure impose de rejouer les contrôles concernés.'))
GATES = [
'Les parcours critiques passent sur les builds Android et iOS réellement destinés à la livraison.',
'Aucune double attribution, aucun double débit et aucun contournement KYC ou droit d’accès ne restent ouverts.',
'Les migrations, sauvegardes, compatibilités API/workers et procédures de retour arrière sont validées.',
'Les incidents de stabilité ont été qualifiés ; les anomalies bloquantes sont corrigées et retestées.',
'La voix et le GPS en veille sont validés si annoncés dans cette livraison ; sinon, la limite et le périmètre sont explicitement actés.',
]
for i, text in enumerate(GATES, 1):
    story.append(CheckItem(f'GO.{i}', text))
story.append(Spacer(1, 8))
story.append(grid([
    ['Bilan', 'À renseigner'],
    ['Contrôles réussis / en échec / non testés / NA', '........................................................................'],
    ['Parcours E2E réussis sur Android / iOS', '........................................................................'],
    ['Anomalies bloquantes restantes', '........................................................................'],
    ['Périmètre reporté / risques explicitement acceptés', '........................................................................\n........................................................................'],
    ['Décision : autorisé / reporté', '........................................................................'],
    ['Responsable / date / signature', '........................................................................\n........................................................................'],
], widths=[CONTENT_WIDTH * .51, CONTENT_WIDTH * .49]))
story.append(Spacer(1, 9))
story.append(p('Références du dossier de recette', 'h3'))
story.append(p('Journal : docs/CHANGEMENTS_TECHNIQUES.md<br/>Bilan : docs/recette-globale-mobile-backend-2026-11-14.md<br/>Coûts et navigation : docs/credit-couts-navigation-2026-11-15.md', 'small'))
story.append(p('Périmètre : checklist communiquée dans la conversation, couvrant les modifications des 13-15 novembre et leurs non-régressions. Aucun nouveau test métier n’a été exécuté lors de la préparation de ce PDF.', 'small'))

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=MARGIN, leftMargin=MARGIN,
                        topMargin=20 * mm, bottomMargin=19 * mm,
                        title='Zwanga - Checklist avant déploiement - 13 au 15 novembre 2026',
                        author='Zwanga', subject='Recette mobile, backend, admin et partenaire',
                        allowSplitting=True)
doc.build(story, canvasmaker=NumberedCanvas)

# Structural checks and raster previews. These validate the document, not the app.
import fitz
pdf = fitz.open(OUT)
texts = [page.get_text() for page in pdf]
joined = '\n'.join(texts)
assert len(all_codes) == len(set(all_codes))
for code in all_codes:
    assert joined.count(code) >= 1, f'Missing control {code}'
for i in range(1, 19):
    assert f'{i:02d}.' in joined
assert 'E2E.6' in joined and 'GO.5' in joined
assert '\ufffd' not in joined
preview = ROOT / 'tmp/pdfs/previews'
preview.mkdir(parents=True, exist_ok=True)
for i, page in enumerate(pdf):
    assert abs(page.rect.width - WIDTH) < 1 and abs(page.rect.height - HEIGHT) < 1
    page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False).save(preview / f'page-{i + 1:02d}.png')
    for block in page.get_text('dict')['blocks']:
        if block['type'] != 0:
            continue
        for line in block['lines']:
            for span in line['spans']:
                x0, y0, x1, y1 = span['bbox']
                assert x0 >= MARGIN - 2 and x1 <= WIDTH - MARGIN + 2, (i + 1, span['text'], span['bbox'])
                assert 0 <= y0 <= y1 <= HEIGHT, (i + 1, span['text'], span['bbox'])
print(f'PDF: {OUT}\nPages: {len(pdf)}\nControls: {len(all_codes)} + 6 E2E + 5 GO\nBytes: {OUT.stat().st_size}')

from PIL import Image, ImageDraw
thumb_w, thumb_h = 298, 421
for batch_start in range(0, len(pdf), 6):
    group = list(range(batch_start, min(batch_start + 6, len(pdf))))
    sheet = Image.new('RGB', (3 * (thumb_w + 16), 2 * (thumb_h + 30)), '#D9DDE1')
    draw = ImageDraw.Draw(sheet)
    for index, number in enumerate(group):
        im = Image.open(preview / f'page-{number + 1:02d}.png').convert('RGB')
        im.thumbnail((thumb_w, thumb_h))
        x, y = (index % 3) * (thumb_w + 16) + 8, (index // 3) * (thumb_h + 30) + 21
        sheet.paste(im, (x, y))
        draw.text((x, y - 16), f'Page {number + 1}', fill='black')
    sheet.save(preview / f'contact-{batch_start // 6 + 1}.png')
