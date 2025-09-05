ParcAutoFogo
============

Démarrer en local
-----------------

1. Node 18+
2. Installer: `npm install`
3. Dev: `npm run dev` (http://localhost:3000)

Admin
-----

- Login: `/login` — mot de passe par défaut `Fogo2025` (changez via variable d'env `ADMIN_PASSWORD`)
- Cars CRUD: `/admin/cars`
- Photo propriétaire: `/admin/owner-photo`

Déploiement recommandé: Render.com (gratuit)
-------------------------------------------

1. Poussez ce repo sur GitHub
2. Sur Render, créez un Web Service
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment
     - `ADMIN_PASSWORD` (obligatoire)
     - `SESSION_SECRET` (obligatoire)
   - Disque persistant: montez `data/` (pour SQLite et uploads)
3. URL publique → votre site en ligne

Déploiement alternatif: Railway.app, Fly.io, ou VPS
--------------------------------------------------

Veillez à monter/mapper le dossier `data/` pour conserver la base SQLite et les images.


