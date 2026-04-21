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
