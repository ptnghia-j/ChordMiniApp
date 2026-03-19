# ChordMini documentation

This folder contains both maintained architecture docs and older planning/tutorial material.

## Source-of-truth docs

The files below are the maintained set for the current repository state:

1. [`architecture/system-overview.md`](./architecture/system-overview.md)
2. [`architecture/runtime-and-deployment.md`](./architecture/runtime-and-deployment.md)
3. [`components/frontend-surfaces.md`](./components/frontend-surfaces.md)
4. [`components/state-hooks-and-services.md`](./components/state-hooks-and-services.md)
5. [`api/nextjs-route-handlers.md`](./api/nextjs-route-handlers.md)
6. [`api/flask-backend.md`](./api/flask-backend.md)
7. [`models/ml-models-and-persistence.md`](./models/ml-models-and-persistence.md)
8. [`workflows/core-workflows.md`](./workflows/core-workflows.md)
9. [`development/onboarding.md`](./development/onboarding.md)
10. [`development/testing-strategy.md`](./development/testing-strategy.md)

If a statement in another doc conflicts with one of the files above, trust the maintained set.

## Current application shape

ChordMini is a split-runtime application:

- **Next.js frontend** in `src/app/` and `src/components/`
- **Next.js BFF route handlers** in `src/app/api/`
- **Flask ML backend** in `python_backend/`
- **Firebase** for persistence and cache reuse

## Maintained focus areas

| Area | Current source-of-truth docs |
| --- | --- |
| architecture | `architecture/system-overview.md`, `architecture/runtime-and-deployment.md` |
| frontend surfaces | `components/frontend-surfaces.md`, `components/state-hooks-and-services.md` |
| API boundaries | `api/nextjs-route-handlers.md`, `api/flask-backend.md` |
| models + persistence | `models/ml-models-and-persistence.md` |
| workflows | `workflows/core-workflows.md` |
| contributor setup | `development/onboarding.md`, `development/testing-strategy.md` |

## Archival material

The following folders contain useful background, drafts, or older reorganizations, but they are **not maintained as source-of-truth for the live codebase**:

- `algorithms/`
- `backend/`
- `database/`
- `dependencies/`
- `deployment/`
- `frontend/`
- `tutorial/`
- `wiki-planning/`

Read them as historical/reference notes only unless they are explicitly refreshed.

## Recommended reading order

1. [`architecture/system-overview.md`](./architecture/system-overview.md)
2. [`architecture/runtime-and-deployment.md`](./architecture/runtime-and-deployment.md)
3. [`development/onboarding.md`](./development/onboarding.md)
4. [`components/frontend-surfaces.md`](./components/frontend-surfaces.md)
5. [`components/state-hooks-and-services.md`](./components/state-hooks-and-services.md)
6. [`api/nextjs-route-handlers.md`](./api/nextjs-route-handlers.md)
7. [`api/flask-backend.md`](./api/flask-backend.md)
8. [`models/ml-models-and-persistence.md`](./models/ml-models-and-persistence.md)
9. [`workflows/core-workflows.md`](./workflows/core-workflows.md)
10. [`development/testing-strategy.md`](./development/testing-strategy.md)
