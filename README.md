# Pupil Manager

*Un outil pour le jeu [Teacher Story](http://teacher-story.com)*

![Capture](capture.png)

Ressentez la puissance de James Norray dans sa capacité, nouvellement acquise,
à expédier les élèves à la vitesse de la lumière !

## Installation

Assurez-vous que vous avez l'extension pour gérer les userscripts dans
votre navigateur.

* Pour Firefox c'est [![](http://kergoz-panic.fr/watilin/userscripts/greasemonkey16.png) Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/)
* Pour Chrome c'est [![](http://kergoz-panic.fr/watilin/userscripts/tampermonkey16.png) Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)

Ensuite, suivez ce lien : [Pupil_Manager.user.js](https://raw.githubusercontent.com/Watilin/Pupil-Manager/master/Pupil_Manager.user.js).
Normalement votre monkey détecte le script et ouvre une fenêtre qui vous
propose de l'installer. Acceptez, le téléchargement et l'installation ne
prennent que quelques secondes.

Une fois le script installé, il ne vous reste plus qu'à vous rendre sur
Teacher Story (ou rafraîchir la page), et vous pourrez profiter de la
puissance de Pupil Manager.

## Fonctionnalités

* Liste des contacts
* Envoi en un clic
* Tri des contacts

## À venir (très bientôt)

* Recherche des contacts
* Statistiques d'envoi/réception d'élèves par contact
* Possibilité de définir une priorité des contacts

## Historique des versions

J'ai mis une license GPL, c'est ma faute, maintenant il faut que je tienne à jour la liste des changements. Alors voilà.

* **[v1.2.1](https://github.com/Watilin/Pupil-Manager/releases/tag/v1.2.1)**, 14/04/16

  * Résoud un problème d’injection des styles avec TamperMonkey
  * Supprime un avertissement de sécurité avec la nouvelle version de Tampermonkey

* **[v1.2](https://github.com/Watilin/Pupil-Manager/releases/tag/v1.2)**, 19/11/15

  * Ajout du nombre d’élèves envoyés par contact et de la date du dernier envoi
  * Ajout de boutons « précedent » et « suivant » dans la pagination

* **[v1.1](https://github.com/Watilin/Pupil-Manager/releases/tag/v1.1)**, 05/11/15

  * Possibilité de trier les contacts

* **[v1.0.1](https://github.com/Watilin/Pupil-Manager/releases/tag/v1.0.1)**, 04/11/15

  * Correction de la position du bouton sur certaines pages

* **[v1.0](https://github.com/Watilin/Pupil-Manager/releases/tag/v1.0)**, 03/11/15

  * Création de la liste des contacts
  * Création du bouton d'envoi en un clic
