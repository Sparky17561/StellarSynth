# CLAUDE.md
This file gives Claude coding agents the project context needed to work safely and quickly in this repository.

## Project Overview
StellarSynth is a full-stack app with:
- `frontend/`: React + Vite UI with Clerk authentication and routed dashboard pages.
- `backend/`: FastAPI service with SQLAlchemy models and modular API routers.

Primary backend entrypoint: `backend/main.py`
Primary frontend entrypoint: `frontend/src/main.jsx` and `frontend/src/App.jsx`

## Repository Layout
- `backend/main.py` mounts API routers under:
  - `/api/community`
  - `/api/news`
  - `/api/stella`
  - `/api/predict`
  - `/api/dashboard`
  - `/api/apikeys`
- `backend/database.py` defines SQLAlchemy engine/session plus models:
  - `User`, `Discussion`, `Comment`, `ApiKey`, `PredictionHistory`
- `frontend/src/components/` contains feature pages and dashboard widgets.

## Local Development
### Backend (FastAPI)
From `backend/`:
1. Create and activate a virtual environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Start server:
   - `uvicorn main:app --reload`

### Frontend (Vite)
From `frontend/`:
1. Install dependencies:
   - `npm install`
2. Start dev server:
   - `npm run dev`
3. Other scripts:
   - `npm run build`
   - `npm run lint`
   - `npm run preview`

## Environment and Secrets
- Frontend expects Clerk publishable key:
  - `VITE_CLERK_PUBLISHABLE_KEY`
- Backend currently uses a PostgreSQL URL in code (`backend/database.py`).
  - Prefer environment variable configuration for DB credentials in future changes.
- Never commit real secrets or production credentials.

## Agent Working Guidelines
- Keep changes scoped to the user request; avoid broad refactors unless asked.
- Preserve current module structure and naming conventions.
- For backend API changes:
  - Add/adjust router endpoints in the correct module under `backend/modules/`.
  - Ensure imports and route prefixes in `backend/main.py` remain consistent.
- For frontend feature changes:
  - Keep page-level behavior in the relevant component folder under `frontend/src/components/`.
  - Respect existing route structure in `frontend/src/App.jsx`.
- Run relevant checks before finishing:
  - Frontend: `npm run lint` (from `frontend/`)
  - Backend: run minimal import/startup sanity check where possible.

## Code Style Expectations
- Follow existing style in touched files; do not reformat unrelated code.
- Keep functions/components focused and readable.
- Prefer explicit, descriptive names over short/ambiguous ones.
- Add comments only when logic is non-obvious.

## When Making Data Model Changes
- Update SQLAlchemy models in `backend/database.py`.
- Update dependent routers/services that read/write affected fields.
- Consider backward compatibility and defaults for existing records.

## Definition of Done for Typical Changes
- Code compiles/runs for the modified area.
- No obvious regressions in routing or imports.
- Lint/tests for touched surface are run when available.
- Changes are documented briefly in PR/commit notes.
