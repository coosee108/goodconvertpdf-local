<div align="center">

<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="extension/icons/icon128.png" width="80" alt="GoodConvertPDF"></a>

# GoodConvertPDF Local

**Enregistrez des pages web, des articles et du contenu sélectionné en PDF. Convertissez des documents et organisez vos PDF dans le navigateur.**

Traitement local · Aucun compte requis · Chrome / Edge

[English](README.md) · [Deutsch](README.de.md) · **Français** · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

[![Licence : MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Site-goodconvertpdf.com-4f46e5" alt="Site officiel"></a>

<a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">Visiter le site officiel ↗</a> · [Installation](#installation-rapide) · [Captures](#captures-décran) · [Licence](#licence)

<img src="docs/screenshots/quick-save.png" width="380" alt="Fenêtre de l’extension pour enregistrer la page en PDF">

</div>

## Fonctionnalités

- Créez un PDF à partir de l’onglet ouvert, consultez l’aperçu, puis ouvrez ou téléchargez le fichier.
- Enregistrez la page entière, l’article principal ou une sélection visuelle.
- Réglez le papier, l’orientation, les marges, l’échelle, les arrière-plans et le chargement ; réutilisez les réglages d’un site.
- Suivez les étapes de création, annulez une tâche ou arrêtez l’attente des ressources.
- Convertissez localement des fichiers HTML, des images, du texte, du Markdown, des données et des conversations.
- Fusionnez et découpez des PDF, organisez les pages et ajoutez filigranes, numéros de page, couverture et métadonnées.
- Rouvrez les PDF récents conservés localement. Par défaut : 7 jours, 20 fichiers maximum et 100 Mo au total.

Pour convertir une URL publique en ligne ou gérer votre compte et votre abonnement, rendez-vous sur le <a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">site officiel ↗</a>.

## Installation rapide

Il vous faut **Node.js 22 ou une version ultérieure**, Git et Chrome ou Edge sur ordinateur.

```sh
git clone https://github.com/coosee108/goodconvertpdf-local.git
cd goodconvertpdf-local
npm test
npm run build
```

1. Ouvrez `chrome://extensions` ou `edge://extensions`.
2. Activez le **mode développeur**, puis choisissez **Charger l’extension non empaquetée**.
3. Sélectionnez le dossier **`build/`** généré.
4. Ouvrez une page web ordinaire, enregistrez-la en PDF, vérifiez l’aperçu et téléchargez le résultat.

L’étape `npm install` n’est pas nécessaire pour cette version : les dépendances du navigateur sont incluses. Après modification du code, reconstruisez puis rechargez l’extension. Cette édition communautaire cible Chrome et Edge ; la version Firefox à impression native est distincte.

## Captures d’écran

Captures fournies par l’équipe du projet. Les libellés peuvent changer selon la version ou la langue. Les pages de tiers ne sont montrées qu’à titre d’exemple.

![Aperçu PDF et options d’export](docs/screenshots/pdf-preview.png)

<details><summary>Autres captures : sélection, chargement, documents, outils PDF et résultats récents</summary>

![Sélection du contenu](docs/screenshots/select-content.png)
![Progression de la génération](docs/screenshots/loading.png)
![Conversion de documents](docs/screenshots/documents.png)
![Outils PDF](docs/screenshots/pdf-tools.png)
![PDF récents](docs/screenshots/recent-pdfs.png)

</details>

## Confidentialité et autorisations

La conversion locale ne nécessite ni compte ni serveur de conversion. La page source peut néanmoins charger ses propres images, polices et autres ressources distantes. L’extension demande notamment l’accès aux onglets, aux scripts, au stockage, aux téléchargements, au débogueur et aux sites web pour lire la page, créer le PDF et enregistrer le résultat. Chrome ou Edge peut afficher une bannière de débogage.

Les PDF récents sont stockés dans IndexedDB, localement dans l’extension. Le nettoyage a lieu lors des vérifications, sans suppression à heure fixe lorsque le navigateur est fermé. Les résultats du mode privé ne sont pas conservés.

## Questions fréquentes

**Pourquoi certaines pages ne fonctionnent-elles pas ?** Les pages protégées du navigateur et celles des extensions ne sont pas convertibles. Ouvrez une page HTTP(S) ordinaire.

**Puis-je enregistrer une page nécessitant une connexion ?** Vous pouvez essayer de convertir une page déjà ouverte sans communiquer vos identifiants au service de conversion. Les restrictions du site peuvent affecter le résultat.

**Le texte est-il sélectionnable ?** L’impression des pages web conserve généralement le texte et les liens. Certains exports de documents ou de HTML local utilisent une image ; utilisez l’option Imprimer si vous avez besoin de texte recherchable.

**Un compte est-il nécessaire ?** Non pour les fonctions locales. La conversion en ligne et les abonnements sont gérés sur le <a href="https://goodconvertpdf.com/" target="_blank" rel="noopener noreferrer">site officiel ↗</a>.

## Développement et contribution

`extension/` contient le code de l’extension, `locales/` les traductions et `docs/screenshots/` les captures. `build/` est généré. Exécutez `npm test` et `npm run build`, puis vérifiez la qualité PDF dans un vrai navigateur. Consultez [CONTRIBUTING.md](CONTRIBUTING.md) et [SECURITY.md](SECURITY.md).

## Licence

Le code propre à GoodConvertPDF est distribué sous [licence MIT](LICENSE). Les dépendances tierces conservent leurs licences : voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) et `extension/vendor/licenses/`.
