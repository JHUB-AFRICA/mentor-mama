#!/usr/bin/env bash
set -e

echo "Scaffolding MentorMAMA project at the current directory..."

# --- github / husky ---
mkdir -p .github/workflows .husky

# --- apps/web (marketing site) ---
mkdir -p apps/web/public
mkdir -p apps/web/src/{assets,components,layouts,hooks,lib,styles}
mkdir -p apps/web/src/pages/{Home,About,HowItWorks,ForInstitutions,Team,Contact}

# --- apps/portal (product app) ---
mkdir -p apps/portal/public
mkdir -p apps/portal/src/{assets,components,layouts,routes,hooks,lib,store,styles}
mkdir -p apps/portal/src/features/{auth,facilities,training,induction,sessions,feedback,escalations,dashboard}

# --- packages ---
mkdir -p packages/ui/src/{components,tokens}
mkdir -p packages/config/{eslint-config,tsconfig-base,tailwind-preset}

# --- backend (Django) ---
mkdir -p backend/config/settings
mkdir -p backend/apps/{accounts,facilities,training,induction,sessions,feedback,escalations,dashboards,content_library,core}
mkdir -p backend/tests
mkdir -p backend/requirements

# --- docs ---
mkdir -p docs/brand docs/architecture/decisions docs/api docs/product docs/onboarding

# --- assets ---
mkdir -p assets/brand/{logo,colors,fonts}
mkdir -p assets/photography

# --- docker ---
mkdir -p docker/backend docker/web docker/portal docker/nginx

# --- placeholder files so empty dirs survive git ---
find apps packages backend docs assets docker -type d -empty -exec touch {}/.gitkeep \;

# --- root files ---
touch .env.example .gitignore .editorconfig README.md
touch pnpm-workspace.yaml package.json
touch docker-compose.yml docker-compose.dev.yml
touch .github/workflows/backend-ci.yml
touch .github/workflows/web-ci.yml
touch .github/workflows/portal-ci.yml
touch .github/workflows/deploy.yml
touch .husky/pre-commit

# --- key entrypoint stubs ---
touch apps/web/index.html apps/web/vite.config.ts apps/web/tailwind.config.ts apps/web/tsconfig.json apps/web/package.json
touch apps/web/src/App.tsx apps/web/src/main.tsx

touch apps/portal/index.html apps/portal/vite.config.ts apps/portal/tailwind.config.ts apps/portal/tsconfig.json apps/portal/package.json
touch apps/portal/src/App.tsx apps/portal/src/main.tsx

touch packages/ui/package.json packages/ui/tsconfig.json packages/ui/src/index.ts
touch packages/ui/src/tokens/colors.ts packages/ui/src/tokens/typography.ts packages/ui/src/tokens/spacing.ts

touch backend/manage.py backend/pytest.ini
touch backend/config/urls.py backend/config/asgi.py backend/config/wsgi.py
touch backend/config/settings/base.py backend/config/settings/dev.py backend/config/settings/prod.py backend/config/settings/test.py
touch backend/requirements/base.txt backend/requirements/dev.txt backend/requirements/prod.txt

touch docker/backend/Dockerfile docker/web/Dockerfile docker/portal/Dockerfile docker/nginx/nginx.conf

touch docs/onboarding/CONTRIBUTING.md

echo "Done. Project scaffolded at $(pwd)"
echo "Next steps:"
echo "  1. Copy MentorMAMA_Website_Build_Guide.md into docs/brand/"
echo "  2. Copy MentorMAMA_Developer_Concept_Note.md (or .pdf) into docs/product/"
echo "  3. git init && pnpm init"
echo "  4. pnpm install -w  (after package.json files are filled in)"