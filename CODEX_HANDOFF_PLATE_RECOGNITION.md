# Handoff Codex: Integration du modele de reconnaissance de plaques

## 1. Objectif metier

Le systeme actuel detecte l etat des places de parking (`free` / `busy`) a partir d images, videos ou flux camera.

Le nouvel objectif est d ajouter un deuxieme modele, heberge sur un autre PC, qui detecte la plaque d immatriculation d une voiture. Le comportement cible est:

1. une voiture arrive dans une place;
2. le systeme de ce repo detecte qu une place reservee est physiquement occupee;
3. le service de lecture de plaques sur l autre PC lit la plaque du vehicule present;
4. le backend compare cette plaque avec la plaque du vehicule lie a la reservation active de cette place;
5. le systeme conclut `match` ou `mismatch`.

Le modele de plaques n est pas encore integre dans ce repo. Ce document donne tout le contexte necessaire pour l ajouter proprement.

## 2. Architecture actuelle

### Frontend

- Stack: Ionic + Angular
- Dossier: `frontend/smart-parking-app`
- URL API en production:
  - `apiBaseUrl = https://backend-api-production-ad64.up.railway.app/api`
  - `backendOrigin = https://backend-api-production-ad64.up.railway.app`
- Fichier cle: [environment.prod.ts](/c:/Users/marie/Desktop/smart-parking-system/frontend/smart-parking-app/src/environments/environment.prod.ts)

### Backend

- Stack: Flask + SQLAlchemy + JWT + CORS
- Dossier: `backend`
- Factory app: [backend/app/__init__.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/__init__.py)
- Config: [backend/app/config.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/config.py)
- Blueprints exposes:
  - `/api/auth`
  - `/api/owner`
  - `/api/parkings`
  - `/api/places`
  - `/api/reservations`
  - `/api/abonnements`
  - `/api/paiements`
  - `/api/vehicules`
  - `/api/ai`
  - `/api/admin`
  - `/api/health`

### Base de donnees

- SQLAlchemy sur `DATABASE_URL`
- Production recommandee: Postgres
- Fallback local: SQLite `smart_parking.db`
- Le backend fait un bootstrap schema au demarrage pour ajouter certaines colonnes manquantes si besoin.

### Hebergement actuel

- Le frontend est deployee separement.
- Le backend IA est deploye sur Railway, pas sur Vercel.
- Le README indique explicitement qu un backend IA doit etre un service long-running avec CPU, stockage et traitements lourds.
- Les redeploiements backend ont deja ete faits via Railway CLI sur le service `backend-api`.

## 3. Variables d environnement backend importantes

Voir [backend/.env.example](/c:/Users/marie/Desktop/smart-parking-system/backend/.env.example).

Variables principales:

- `DATABASE_URL`
- `SECRET_KEY`
- `JWT_SECRET_KEY`
- `UPLOAD_FOLDER`
- `SMART_PARKING_MODEL_PATH`
- `SMART_PARKING_SLOTS_PATH`
- `SMART_PARKING_MAX_BATCH_JOBS`
- `SMART_PARKING_MAX_VIDEO_JOBS`
- `SMART_PARKING_VIDEO_FRAME_STRIDE`
- `SMART_PARKING_CLASSIFY_IMGSZ`
- `SMART_PARKING_SLOT_PADDING_RATIO`
- `SMART_PARKING_AI_DEBUG`
- `PORT`

Variables stockage objet si active:

- `BUCKET`
- `ENDPOINT`
- `REGION`
- `ACCESS_KEY_ID`
- `SECRET_ACCESS_KEY`

Service associe: [object_storage.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/services/object_storage.py)

## 4. Modele de donnees utile pour la comparaison de plaques

### Compte owner / conducteur

Fichier: [compte.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/models/compte.py)

- `Compte.role`:
  - `conducteur`
  - `owner`
  - `admin`
- `Compte.owner_status`:
  - `en_attente`
  - `accepte`
  - `refuse`
  - `suspendu`

### Parking

Fichier: [parking.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/models/parking.py)

- `validation_status`
- `setup_status`
- `ai_setup_status`
- `capacite`
- `prix_heure`

### Place

Fichier: [place.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/models/place.py)

- table: `place`
- identifiant: `id_place`
- liaison parking: `parking_id`
- numero metier: `num_place`
- etat:
  - `libre`
  - `occupee`
  - `reservee`
- infos complementaires:
  - `etage_id`
  - `zone`
  - `etage`

### Vehicule

Fichier: [vehicule.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/models/vehicule.py)

- table: `vehicule`
- identifiant: `id_veh`
- conducteur: `conducteur_id`
- plaque: `matricule`
- `marque`
- `type`

La plaque attendue pour une reservation se trouve ici: `vehicule.matricule`.

### Reservation

Fichier: [reservation.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/models/reservation.py)

- table: `reservation`
- identifiant: `id_res`
- conducteur: `conducteur_id`
- vehicule: `vehicule_id`
- place: `place_id`
- plage horaire:
  - `date_debut`
  - `date_fin`
- statut:
  - `en_attente`
  - `confirmee`
  - `annulee`
  - `terminee`

Important:

- une reservation creee via le controller est immediatement `confirmee`
- au moment de la creation, la place passe en `reservee`

Code: [reservation_controller.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/controllers/reservation_controller.py)

### Sources IA

Fichier: [parking_ai_source.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/models/parking_ai_source.py)

- table: `parking_ai_source`
- `source_type`:
  - `image`
  - `video`
  - `camera`
- stockage source:
  - `file_path` si stockage local
  - `bucket_key` si stockage objet
- `stream_url` pour camera

## 5. Workflow owner actuel

Le owner suit cet ordre:

1. compte owner accepte par admin
2. parking cree puis valide par admin
3. abonnement application actif
4. configuration parking terminee
5. configuration IA active

Reference backend:
- [owner_workflow.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/routes/owner_workflow.py)

Reference frontend:
- [owner-workflow.service.ts](/c:/Users/marie/Desktop/smart-parking-system/frontend/smart-parking-app/src/app/services/owner-workflow.service.ts)

Etat workflow expose par:

- `GET /api/owner/workflow-status`

Autres endpoints owner importants:

- `POST /api/owner/app-subscription`
- `PUT /api/owner/parkings/:parking_id/setup-status`
- `PUT /api/owner/parkings/:parking_id/ai-setup-status`
- `GET /api/owner/parkings/:parking_id/ai-sources`
- `POST /api/owner/parkings/:parking_id/ai-sources/camera`
- `POST /api/owner/parkings/:parking_id/ai-sources/upload`
- `POST /api/owner/parkings/:parking_id/ai-sources/upload-init`
- `POST /api/owner/parkings/:parking_id/ai-sources/upload-complete`
- `GET /api/owner/parkings/:parking_id/ai-slots`
- `PUT /api/owner/parkings/:parking_id/ai-slots`

Regles de securite:

- toutes ces routes sont JWT-protegees
- la majorite exigent:
  - utilisateur owner
  - owner approuve
  - parking valide
  - abonnement actif
  - setup parking termine avant IA

## 6. Pipeline IA actuel pour la detection des places

### Nature du modele actuel

Le modele deja integre dans ce repo ne lit pas les plaques.

Il sert a classifier chaque slot de parking en:

- `free`
- `busy`

References:

- [ai_service.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/services/ai_service.py)
- [video_ai_service.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/services/video_ai_service.py)

### Principe

1. le owner ajoute une source IA:
   - image
   - video
   - camera
2. le systeme recupere les slots calibres du parking
3. pour chaque slot, le backend croppe un rectangle `(x, y, w, h)`
4. le modele YOLO de classification predit `free` ou `busy`
5. le backend:
   - calcule un resume global
   - produit un media annote
   - synchronise l etat des places SQL

### Calibration des slots

Les slots sont des rectangles JSON.

Format attendu:

```json
[
  {
    "slot_index": 1,
    "place_id": 12,
    "place_number": 5,
    "x": 120,
    "y": 80,
    "w": 90,
    "h": 160
  }
]
```

Le stockage est gere par `ParkingVideoAIService`:

- slots par parking: `UPLOAD_FOLDER/ai_slots/<parking_id>.json`
- fallback possible vers `SMART_PARKING_SLOTS_PATH`

Endpoints utiles:

- `GET /api/owner/parkings/:parking_id/ai-slots`
- `PUT /api/owner/parkings/:parking_id/ai-slots`

### Synchronisation avec la table `place`

Tres important pour l integration plaques:

Quand l IA detecte `free` / `busy`, le backend synchronise la table `place`.

Mais si la place est deja `reservee`, la synchro l ignore volontairement.

Code: `_sync_places_with_slots(...)` dans [ai_service.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/services/ai_service.py)

Cela signifie:

- une reservation pose l etat `reservee`
- la simple detection d occupation ne doit pas ecraser cet etat
- la future verification de plaque doit travailler par-dessus cette logique, pas a la place

### Analyse image

Pour une image:

- lecture du fichier
- prediction par slot
- image annotee generee
- resume `free/occupied/total`

### Analyse video

Pour une video:

- lecture frame par frame
- inference par slot
- aggregation votes / confiance
- rendu d une video annotee
- job async possible

Le backend gere deja des batch jobs videos.

## 7. Upload et stockage des medias IA

Le frontend a deja ete modifie pour supporter un upload direct au stockage objet si disponible.

Service frontend:

- [parking-ai-source.service.ts](/c:/Users/marie/Desktop/smart-parking-system/frontend/smart-parking-app/src/app/services/parking-ai-source.service.ts)

Flux actuel:

1. `POST /upload-init`
2. `PUT` direct vers URL presignee
3. `POST /upload-complete`

Fallback:

- si le stockage objet n est pas disponible, upload multipart classique backend

Affichage frontend:

- les previews sont chargees comme medias proteges via blob JWT
- les URLs directes brutes ne sont pas fiables pour l affichage inline

## 8. Endpoints deja disponibles pour les reservations et vehicules

### Vehicules conducteur

Route:

- `GET /api/vehicules/`
- `POST /api/vehicules/`

Reference:
- [vehicule.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/routes/vehicule.py)

Contrainte:

- `matricule` est unique

### Reservations conducteur

Routes:

- `GET /api/reservations/`
- `POST /api/reservations/`

Reference:
- [reservation.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/routes/reservation.py)

### Reservations owner

Route:

- `GET /api/reservations/owner`

Cette route renvoie deja, pour chaque reservation owner-visible:

- `reservation`
- `place`
- `vehicule`
- `parking`
- `conducteur`

C est probablement la meilleure base fonctionnelle si l on veut rapidement croiser:

- `place_id`
- `vehicule.matricule`
- plage horaire active

## 9. Probleme techniques deja rencontres dans ce projet

L autre Codex doit connaitre ces points pour ne pas repartir sur de mauvaises hypotheses.

### Upload / preview medias

Des corrections ont deja ete faites pour:

- videos uploadees mais non affichees
- images uploadees mais non affichees
- previews protegees qui exigeaient un fetch blob authentifie
- fallback UI quand l apercu echoue

### Route `ai-sources`

La route `GET /api/owner/parkings/:id/ai-sources` a ete allegee pour ne plus extraire une frame de calibration pendant le listing. Cela causait des `abort` sur Railway.

### Auth workflow

`/api/owner/workflow-status` pouvait renvoyer `401`. Le frontend a ete durci pour ne pas casser toute l UI sur cette erreur.

### Hebergement

Le backend IA ne doit pas etre traite comme une simple API serverless. Il a besoin de:

- CPU pour OpenCV / Ultralytics
- stockage local de travail
- eventuellement stockage objet
- jobs longs

## 10. Ce que le nouveau service plaque doit faire

Le nouveau modele sur l autre PC devrait idealement etre expose comme un service HTTP simple, pas comme un script manuel.

### Recommandation forte

Le PC distant doit exposer une API du style:

- `POST /recognize-plate`

Entrée possible:

- image de vehicule ou crop
- ou URL/image binaire
- eventuellement metadonnees:
  - `parking_id`
  - `place_id`
  - `source_id`
  - `captured_at`

Sortie recommandee:

```json
{
  "status": "ok",
  "plate_text": "AB-123-CD",
  "confidence": 0.94,
  "bbox": { "x": 10, "y": 20, "w": 120, "h": 40 },
  "raw_text": "AB123CD"
}
```

Il faut normaliser la plaque avant comparaison:

- uppercase
- suppression espaces / tirets si necessaire
- meme regle des deux cotes

## 11. Point d integration recommande

### Mauvaise idee

Ne pas integrer directement la logique de plaque dans le frontend Angular.

### Bonne idee

Ajouter la logique dans le backend Flask principal.

Raison:

- le backend connait deja les reservations
- le backend connait deja les places et leurs statuts
- le backend est le bon endroit pour la comparaison metier
- le frontend ne doit recevoir qu un resultat interpretable

### Strategie d integration conseillee

1. garder le modele de detection de place sur ce backend principal
2. exposer le modele de plaques de l autre PC comme un microservice HTTP
3. depuis ce backend, appeler le service distant quand une verification est necessaire
4. comparer la plaque detectee avec `reservation.vehicule.matricule`
5. enregistrer un resultat de controle

## 12. Quand declencher la verification de plaque

Il faut eviter de faire une OCR plaque sur toutes les frames et toutes les places. Le bon declenchement est metier.

### Declenchement recommande

Declencher la lecture de plaque seulement si:

1. une place a une reservation active;
2. cette place est detectee `busy` par le modele actuel;
3. on dispose d une image exploitable de la voiture dans cette zone.

### Reservation active

La reservation a chercher est:

- meme `place_id`
- `statut` non annule
- `date_debut <= now <= date_fin`

Puis recuperer:

- `vehicule_id`
- `vehicule.matricule`

## 13. Donnees qu il faudra probablement ajouter

Le schema actuel ne contient pas encore une table dediee au controle de plaque.

Je recommande d ajouter une nouvelle table, par exemple `plate_check`, avec:

- `id`
- `parking_id`
- `place_id`
- `reservation_id`
- `source_id`
- `detected_plate`
- `expected_plate`
- `normalized_detected_plate`
- `normalized_expected_plate`
- `match_status`
- `confidence`
- `evidence_image_path` ou `bucket_key`
- `created_at`

`match_status` pourrait etre:

- `match`
- `mismatch`
- `no_plate_detected`
- `no_active_reservation`
- `error`

## 14. Pipeline d integration recommande entre les deux PC

### Option recommandee

#### PC 1

Ce repo:

- frontend Angular
- backend Flask
- base Postgres
- detection de place
- logique metier reservations / owners / parkings

#### PC 2

Autre repo / autre service:

- modele OCR / LPR
- API HTTP specialisee plaque

#### Flux

1. PC 1 detecte qu une place reservee est occupee
2. PC 1 prepare une image utile pour la reconnaissance
3. PC 1 appelle PC 2
4. PC 2 renvoie la plaque lue
5. PC 1 compare avec la reservation active
6. PC 1 enregistre le resultat
7. le frontend affiche l alerte ou la validation

### Pourquoi cette separation est la bonne

- chaque modele reste sur sa machine
- le backend principal garde la logique metier
- le service OCR peut etre redemarre ou remplace sans casser l app principale
- les deux Codex peuvent travailler chacun sur un perimetre clair

## 15. Ce que l autre Codex doit faire en premier

Ordre conseille:

1. exposer le modele plaques sur l autre PC via une API HTTP stable
2. definir le contrat JSON d entree / sortie
3. normaliser la plaque detectee
4. documenter les formats d image attendus
5. renvoyer aussi un score de confiance
6. si possible renvoyer une image annotee ou bbox

Ensuite seulement, ce repo integrera l appel a ce service.

## 16. Ce que ce repo devra faire ensuite

Quand le service plaque distant sera pret, il faudra dans ce repo:

1. ajouter un service backend client HTTP vers le PC distant
2. trouver la reservation active d une place
3. recuperer la plaque attendue
4. appeler le service OCR
5. comparer et normaliser
6. stocker le resultat
7. exposer un endpoint frontend pour consulter les controles de plaques

## 17. Fichiers les plus importants a lire pour comprendre ce projet

### Backend

- [README.md](/c:/Users/marie/Desktop/smart-parking-system/README.md)
- [backend/app/__init__.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/__init__.py)
- [backend/app/config.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/config.py)
- [backend/app/routes/owner_workflow.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/routes/owner_workflow.py)
- [backend/app/services/ai_service.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/services/ai_service.py)
- [backend/app/services/video_ai_service.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/services/video_ai_service.py)
- [backend/app/services/object_storage.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/services/object_storage.py)
- [backend/app/controllers/reservation_controller.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/controllers/reservation_controller.py)
- [backend/app/routes/reservation.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/routes/reservation.py)
- [backend/app/routes/vehicule.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/routes/vehicule.py)
- [backend/app/models/place.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/models/place.py)
- [backend/app/models/reservation.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/models/reservation.py)
- [backend/app/models/vehicule.py](/c:/Users/marie/Desktop/smart-parking-system/backend/app/models/vehicule.py)

### Frontend

- [environment.prod.ts](/c:/Users/marie/Desktop/smart-parking-system/frontend/smart-parking-app/src/environments/environment.prod.ts)
- [owner-workflow.service.ts](/c:/Users/marie/Desktop/smart-parking-system/frontend/smart-parking-app/src/app/services/owner-workflow.service.ts)
- [parking-ai-source.service.ts](/c:/Users/marie/Desktop/smart-parking-system/frontend/smart-parking-app/src/app/services/parking-ai-source.service.ts)

## 18. Note importante pour la collaboration entre les deux Codex

Le meilleur partage de responsabilites est:

- Codex de ce PC:
  - architecture principale
  - backend Flask
  - base de donnees
  - frontend Angular
  - integration metier reservation/place/plaque

- Codex de l autre PC:
  - service OCR / LPR
  - API de reconnaissance de plaques
  - qualite OCR
  - normalisation entree/sortie du modele

Une fois l API distante definie, les deux Codex peuvent collaborer facilement sur un contrat simple:

### Contrat minimal propose

Request:

```json
{
  "image_base64": "...",
  "parking_id": 6,
  "place_id": 42,
  "source_id": 18
}
```

Response:

```json
{
  "status": "ok",
  "plate_text": "AB123CD",
  "normalized_plate": "AB123CD",
  "confidence": 0.94
}
```

## 19. Resume tres court pour l autre Codex

- Ce repo gere deja la detection `free/busy` des places.
- Backend principal: Flask sur Railway.
- Base: Postgres via `DATABASE_URL`.
- Frontend: Ionic/Angular.
- Les reservations connaissent deja la `place_id` et le `vehicule_id`.
- La plaque attendue est dans `vehicule.matricule`.
- La reservation met la place en `reservee`.
- La synchro IA actuelle n ecrase pas les places `reservee`.
- Le bon design est de laisser ce backend principal appeler le service plaque distant sur l autre PC.
- Le service distant doit juste renvoyer la plaque detectee proprement.
