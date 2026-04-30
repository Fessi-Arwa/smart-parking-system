# smart-parking-system
Smart Parking App with AI (YOLO) + Ionic + Flask

## Deploiement du backend IA sur le cloud

Le backend IA a besoin d'un service long-running avec stockage et CPU, donc evite Vercel pour cette partie. La configuration ajoutee ici cible un deploiement Docker sur Railway, Render, Fly.io ou une VM Docker.

### Fichiers ajoutes

- `backend/Dockerfile` : image de production pour Flask + OpenCV + Ultralytics
- `backend/wsgi.py` : point d'entree Gunicorn
- `backend/.env.example` : variables d'environnement a renseigner

### Build Docker

Depuis la racine du repo :

```bash
docker build -f backend/Dockerfile -t smart-parking-backend .
docker run --env-file backend/.env -p 8000:8000 smart-parking-backend
```

### Variables a definir en production

- `DATABASE_URL` : base Postgres managée recommandee
- `SECRET_KEY`
- `JWT_SECRET_KEY`
- `UPLOAD_FOLDER=/data/uploads`
- `SMART_PARKING_MODEL_PATH=/app/ai-module/model/yolov8.pt`
- `SMART_PARKING_SLOTS_PATH=/app/ai-module/slots.json`

### URL partagee par tout le monde

Une fois le backend deploye, utilise l'URL publique du service, par exemple :

```text
https://smart-parking-backend.up.railway.app
```

Puis mets a jour le frontend avec :

- `apiBaseUrl = https://.../api`
- `backendOrigin = https://...`

Le service `payment.service.ts` utilise maintenant aussi `environment.apiBaseUrl`, donc toute l'application consommera la meme URL backend au lieu de `localhost`.

## Cameras IP privees et Railway

Si une camera expose un flux sur `localhost`, `192.168.x.x`, `10.x.x.x` ou `172.16-31.x.x`, Railway ne pourra pas y acceder depuis le cloud. Une API deployee sur Railway ne peut pas joindre un reseau local prive.

Dans ce cas, il faut choisir un de ces modes :

- utiliser une URL publique accessible depuis internet
- exposer la camera via un tunnel ou un reverse proxy
- relier le reseau camera via VPN
- lancer un worker local proche de la camera qui capture les images et les envoie a l API Railway

Le backend detecte deja ces flux prives et les marque en mode `edge_required`.

### Worker local camera

Le script `backend/scripts/camera_edge_worker.py` est prevu pour les cameras privees. Il tourne sur une machine qui voit la camera en local, capture une image, puis l envoie au backend public.

Variables minimales :

- `SMART_PARKING_API_BASE_URL=https://votre-backend.up.railway.app/api`
- `SMART_PARKING_OWNER_TOKEN=...`
- `SMART_PARKING_CAMERA_PARKING_IDS=1,2`

Variables optionnelles :

- `SMART_PARKING_CAMERA_SOURCE_IDS=12,15`
- `SMART_PARKING_CAMERA_LOOP_SECONDS=30`
- `SMART_PARKING_CAMERA_ONCE=true`

Exemple :

```bash
cd backend
python scripts/camera_edge_worker.py
```

Le worker recupere les sources camera actives pour les parkings indiques, lit le flux local avec OpenCV, puis poste chaque capture vers `POST /api/owner/ai-sources/:source_id/camera-frame-upload`.
