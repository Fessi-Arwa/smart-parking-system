# Reorganisation base de donnees

Ce dossier contient une version recomposee du schema SQL pour le projet Smart Parking.

## Pourquoi ce script est different du script initial propose

Le script fourni au depart etait une bonne base, mais il cassait plusieurs parties deja utilisees par le backend actuel :

- le backend utilise `owner`, pas `proprietaire`
- `place` utilise deja `num_place`, `zone` et un label d'etage texte
- `reservation` utilise aussi `vehicule_id` et `prix_total`
- `parking` a deja des etats de validation et de configuration owner / IA
- `paiement` et `abonnement` ont deja des statuts suivis par l'application

Du coup, le nouveau script `schema_reworked.sql` :

- garde la compatibilite fonctionnelle avec le backend actuel
- ajoute une vraie table `etage`
- prepare une normalisation progressive de `place` avec `etage_id`
- evite une cassure brutale du frontend et des routes existantes

## Reorganisation backend appliquee

Une nouvelle entite backend a ete ajoutee :

- `backend/app/models/etage.py`

La table `place` supporte maintenant aussi :

- `etage_id`

## Strategie recommandee ensuite

1. Ajouter des routes CRUD pour `etage`
2. Migrer la creation de structure owner pour creer d'abord les etages
3. Faire pointer les places vers `etage_id`
4. Puis seulement apres, reduire l'usage du champ texte `etage`
5. Enfin, adapter reservation / abonnement / plan conducteur pour exploiter la vraie structure relationnelle

## Important

Ce changement est une base de reorganisation.
Il ne remplace pas encore tout le backend metier.
Pour un basculement complet, il faudra ensuite :

- une migration Alembic appliquee a la base
- une adaptation des routes owner / place / reservation
- une verification frontend sur les plans de parking
