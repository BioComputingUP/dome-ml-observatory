# DOME-ML (UI) - OSAI

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
## Update YAML
Run in python: scripts/update_yaml.py
This will pull the latest YAML for OSAI registry table from GitHub: https://github.com/BioComputingUP/OSAI_ecosystem/blob/main/data/ecosystem_components_list.yml