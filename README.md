# AIT Community

A community platform for technical innovators in the Netherlands, focused on AI and automation. Built with the T3 Stack, AIT Community brings together workshops, hackathons, deep-dives, and networking opportunities for the Dutch tech community.

## Features

- **Events** — Workshops, hackathons, deep-dives, and meetups with registration and payment processing
- **Community Board** — Discussion forum, feature ideas with voting, and contribution opportunities
- **Members** — Directory with profiles, leaderboard, XP system, and achievement badges
- **Sponsors** — Tiered sponsorship model (Gold, Silver, Bronze) with application workflow
- **Jobs** — Sponsor-powered job listings with filtering
- **Blog** — Articles, tutorials, and talk recordings
- **Internationalization** — Full English and Dutch language support
- **Gamification** — XP, levels, and badges to reward community participation
- **Authentication** — Email/password and GitHub OAuth signin

## Tech Stack

| Category | Technology |
| --- | --- |
| Framework | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS 4, Radix UI, shadcn/ui |
| API | tRPC 11 |
| Database | PostgreSQL (Neon Serverless), Drizzle ORM |
| CMS | Payload CMS 3 |
| Auth | Better Auth |
| Payments | Mollie |
| Email | Resend |
| i18n | next-intl |
| Animation | Framer Motion |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9.12+
- A [Neon](https://neon.tech/) PostgreSQL database (or any PostgreSQL instance)

### Installation

```bash
git clone <repository-url>
cd aitcom
pnpm install
```

### Environment Setup

Create a `.env` file in the project root:

```env
# Required
DATABASE_URL="postgresql://..."        # PostgreSQL connection string
BETTER_AUTH_SECRET="your-secret"       # Auth session secret (min 32 chars)
PAYLOAD_SECRET="your-payload-secret"   # Payload CMS secret (min 32 chars)

# OAuth (required for GitHub signin)
BETTER_AUTH_GITHUB_CLIENT_ID="..."
BETTER_AUTH_GITHUB_CLIENT_SECRET="..."

# Optional
RESEND_API_KEY="..."                   # Email delivery
MOLLIE_API_KEY="..."                   # Payment processing
NEXT_PUBLIC_APP_URL="..."             # Public app URL
```

### Database Setup

```bash
pnpm db:generate   # Generate Drizzle migrations
pnpm db:push       # Push schema to database
```

### Run Development Server

```bash
pnpm dev
```

The app will be available at [http://localhost:3000](http://localhost:3000). The Payload CMS admin panel is at [http://localhost:3000/admin](http://localhost:3000/admin).

## Project Structure

```
src/
├── app/
│   ├── (payload)/          # Payload CMS admin panel
│   ├── [locale]/           # Locale-based routing (en/nl)
│   │   ├── events/         # Event pages
│   │   ├── blog/           # Blog articles
│   │   ├── community/      # Community board
│   │   ├── dashboard/      # User dashboard (protected)
│   │   ├── members/        # Member directory
│   │   ├── sponsors/       # Sponsors page
│   │   ├── jobs/           # Job listings
│   │   └── auth/           # Sign in / sign up
│   └── api/                # API routes (auth, tRPC, webhooks)
├── server/
│   ├── api/routers/        # tRPC routers
│   ├── better-auth/        # Auth configuration
│   ├── db/                 # Database connection and schema
│   └── email.ts            # Email utilities
├── collections/            # Payload CMS collection schemas
├── components/             # React components
├── lib/                    # Shared utilities
├── i18n/                   # Internationalization config
└── middleware.ts           # Auth and locale middleware
messages/                   # Translation files (en.json, nl.json)
```

## Available Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start development server with Turbo |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm preview` | Build and start production server |
| `pnpm check` | Run linting and TypeScript checks |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Fix linting issues |
| `pnpm format:check` | Check code formatting |
| `pnpm format:write` | Format code with Prettier |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:push` | Push schema to database |
| `pnpm db:studio` | Open Drizzle Studio |

## Deployment

This project is designed for deployment on [Vercel](https://vercel.com/) with [Neon](https://neon.tech/) as the database provider:

1. Connect your repository to Vercel
2. Set all required environment variables in the Vercel dashboard
3. Deploy — Vercel will auto-detect the Next.js configuration

## License

Private. All rights reserved.
