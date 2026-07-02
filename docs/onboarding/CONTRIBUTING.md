# Contributing to MentorMAMA

## Branching model

| Branch                   | Purpose                           | Protection          |
| ------------------------ | --------------------------------- | ------------------- |
| `main`                   | Always deployable production code | Protected           |
| `develop`                | Integration branch for features   | Protected           |
| `feature/<app>-<module>` | Individual feature work           | Deleted after merge |

Examples:

- `feature/web-home-page`
- `feature/portal-auth`
- `feature/backend-training-module`
- `feature/ui-button-component`

Branch names should identify the app or package and the module being changed so ownership is legible in the branch list.

## Workflow

1. Create a feature branch from `develop`:

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/<app>-<module>
   ```

2. Make focused commits. Keep each commit small enough to describe in one sentence.

3. Run checks locally before pushing:

   ```bash
   pnpm lint
   pnpm build
   cd backend && ruff check apps/accounts && pytest apps/accounts
   ```

4. Open a pull request into `develop`.

5. Require at least one review before merging. The PR author is responsible for resolving conflicts and ensuring CI passes.

6. Delete the feature branch after merge.

## Pre-commit hooks

Husky and lint-staged run automatically on every commit. Staged TypeScript/JavaScript files are linted with ESLint and formatted with Prettier; staged JSON/YAML/Markdown/CSS files are formatted with Prettier.

If the hook fails, fix the reported issues and commit again.

## Local development

Start the database:

```bash
cp .env.example .env
docker-compose -f docker-compose.dev.yml up -d
```

Start the frontend apps:

```bash
pnpm dev:web     # marketing site
pnpm dev:portal  # product app
```

Start the backend:

```bash
pnpm dev:backend
```

## Code style

- EditorConfig is enforced at the repository root.
- JavaScript/TypeScript: 2 spaces, LF line endings, trailing commas where Prettier permits.
- Python: 4 spaces, LF line endings.
- Do not commit `node_modules`, `.env`, Python `__pycache__`, or build outputs.
