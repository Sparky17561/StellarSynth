<!-- Copilot / AI agent instructions for the StellarSynth repo -->

These notes are focused, actionable hints so an AI code assistant can be productive immediately in this codebase.

- Project type: React (JSX) app built with Vite. Entry: `src/main.jsx` -> `src/App.jsx`.
- Run/dev/build: use npm scripts from `package.json` (dev: `vite`, build: `vite build`, preview: `vite preview`, lint: `eslint .`).

Key patterns and where to look
- Components: `src/components/` — each component is a pair: `ComponentName.jsx` + `ComponentName.css`. Follow the same PascalCase filename and co-located CSS pattern when adding new UI components. Example: `SolarPanel.jsx` + `SolarPanel.css`.
- Top-level app and routing: `src/App.jsx`. Uses `react-router-dom` and Clerk for protected routes. Look here to add new routes or change auth behavior.
- Global/observable data: `src/components/SolarWindProvider.jsx` exports `SolarWindContext` and `useSolarWindData()` hook. Many dashboard components consume this context (see `SolarWindDashboard.jsx`). If you change data shapes or add derived helpers, update the provider and its hook signatures.
- Dashboards: `src/components/SolarWindDashboard.jsx` composes the widgets (Speed, Density, Temperature, Proton, Xray, KP). Use `SolarWindProvider` for data access and `setCurrentDashboard`/`setCurrentPeriod` to change views.

External integrations and important constants
- Authentication: uses Clerk React (`@clerk/clerk-react`). Publishable key read via Vite env: `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY` (see `src/App.jsx`). When testing locally, set this in a `.env` file at project root: `VITE_CLERK_PUBLISHABLE_KEY=pk_xxx`.
- Live data sources: Solar wind and space weather endpoints are fetched directly from NOAA inside `SolarWindProvider.jsx`. Examples:
  - Plasma: `https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json`
  - Magnetic: `https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json`
  - Protons/Xray/Kp: other NOAA endpoints inside the provider file.

Developer workflows and commands (concrete)
- Install & dev: `npm install` then `npm run dev` (starts Vite with HMR).
- Build: `npm run build` and preview with `npm run preview`.
- Lint: `npm run lint` (uses ESLint config in repo root).

Project-specific conventions
- File naming: React components use `.jsx` and are PascalCase. CSS files live in the same folder and use the same base name (`ComponentName.css`).
- State & data flow: Central provider `SolarWindProvider` holds fetched arrays and exposes both raw getters (`getRawPlasmaData`) and filtered getters (`getFilteredPlasmaData`) — prefer these helpers rather than reimplementing filters in UI components.
- Auth gating: Protected routes are implemented by composing Clerk components in routes (`SignedIn`, `SignedOut`, `RedirectToSignIn`). To add a protected route, wrap the element with `SignedIn` and provide `RedirectToSignIn` for `SignedOut`.
- No TypeScript: project uses JS with some `@types` dev deps; avoid assuming type annotations.

Editing guidance / safe change areas
- Add new visual widgets under `src/components/` and register them in `SolarWindDashboard.jsx` via the dashboard switch (modify `currentDashboard` options). Keep CSS local to the component file.
- If changing data fetch cadence or endpoints, update `SolarWindProvider.jsx`. Note it currently refreshes every 5 minutes via setInterval.
- When changing data shapes, update the provider's exported helpers and all components that call `useSolarWindData()`.

Small examples
- To read filtered speed data in a component:
  - import { useSolarWindData } from './SolarWindProvider'
  - const { getFilteredPlasmaData } = useSolarWindData();
- To protect a new route in `App.jsx` follow the pattern used for `/home` or `/solar-panel`.

What not to assume
- There are no unit tests in the repo—don't invent test runners or CI steps. Keep changes minimal and validated locally with `npm run dev`.
- Environment variables are Vite style (`import.meta.env.*`), not process.env.

If something is unclear or you want the instructions to emphasize other areas (e.g., adding tests, CI, or an architecture diagram), tell me which sections to expand or items to add and I'll iterate.
