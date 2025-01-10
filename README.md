# DOME-ML (UI)

## Install node
Install node and modules. Don't use `npm install` since it will upgrade and break packages.
```bash
nvm use
npm ci
```

## Development server
Run `ng serve` for a dev server (or run `npm run start`). Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Build
Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

Use the `--prod` flag for a production build (or run `npm run build-prod`).

## Deploy to production
Build the app for production and rsync `dist/` to `REDACTED-HOST`:
```bash
npm run deploy-prod-quick
```
