# Contributing to AIT Community

Thanks for your interest in contributing! Whether it's a bug fix, new feature, or improvement, we appreciate your help.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork:
   ```bash
   git clone https://github.com/your-username/aitcom.git
   cd aitcom
   ```

Then pick one of two setups (full details in the [README](README.md#getting-started)):

### Fastest: Docker

Requires only Docker. Brings up the app, Postgres, and seed data in one command:

```bash
docker compose up
```

Sign in with the seeded `dev@aitcommunity.local` / `devpassword123` account.

### Manual

1. **Install dependencies**:
   ```bash
   pnpm install
   ```
2. **Set up environment**: Copy `.env.example` to `.env` and fill in the required values
3. **Set up the database**:
   ```bash
   pnpm db:push
   pnpm db:seed   # optional: dev user, root Hub, demo content
   ```
4. **Start the dev server**:
   ```bash
   pnpm dev
   ```

## Development Workflow

1. Create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Run checks before committing:
   ```bash
   pnpm check          # Lint + TypeScript
   pnpm format:write   # Format code
   ```
4. Commit with a clear message (see convention below)
5. Push to your fork and open a Pull Request

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use for |
| --- | --- |
| `feat:` | New features |
| `fix:` | Bug fixes |
| `docs:` | Documentation changes |
| `style:` | Formatting, no code change |
| `refactor:` | Code restructuring |
| `test:` | Adding or updating tests |
| `chore:` | Build, tooling, dependencies |

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Update documentation if your change affects it
- Add translations for both English and Dutch if adding user-facing text (see `messages/en.json` and `messages/nl.json`)
- Ensure `pnpm check` passes before requesting review
- Fill out the PR template

## Adding Translations

This project supports English and Dutch. When adding user-facing text:

1. Add the English string to `messages/en.json`
2. Add the Dutch translation to `messages/nl.json`
3. Use `useTranslations()` from `next-intl` in your component

## Code Style

- TypeScript strict mode
- Formatting handled by Prettier (`pnpm format:write`)
- Linting via ESLint (`pnpm lint`)
- Use `shadcn/ui` and Radix primitives for UI components
- Use `tRPC` for API endpoints, not raw API routes

## Reporting Bugs

Open a [bug report](https://github.com/ai-tech-community/aitcom/issues/new?template=bug_report.yml) with steps to reproduce, expected vs actual behavior, and screenshots if applicable.

## Requesting Features

Open a [feature request](https://github.com/ai-tech-community/aitcom/issues/new?template=feature_request.yml) describing the problem, your proposed solution, and alternatives considered.

## Questions?

Open a [discussion](https://github.com/ai-tech-community/aitcom/discussions) or reach out on the [AIT Community platform](https://www.aitcommunity.org/).
