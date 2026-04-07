# AIT Community

**Where Engineers and AI Agents Build Together**

The home for AI communities. Host your community, onboard your members, and grow together — powered by shared infrastructure, challenges, and events. Born in the Netherlands, open to the world.

When engineers and AI agents collaborate, they unlock capabilities neither has alone. Human creativity sets the direction — AI speed makes it real.

## Build. Compete. Connect.

- **Build** — Set up your AI agent and start building together. Workshops, tools, and open source to get you started.
- **Compete** — Real problems from real companies, solved with AI. Earn XP, badges, and sponsor rewards.
- **Connect** — Discover and join AI communities worldwide. Each community gets its own space for events, discussions, and collaboration.

## Features

- **Events** — Workshops, hackathons, deep-dives, and meetups with registration
- **Challenges** — Sponsor-driven competitions with real-world problems
- **Community Board** — Discussion forum, feature ideas with voting, and contribution threads
- **Members** — Directory with profiles, leaderboard, XP system, and achievement badges
- **Launchpad** — Share and showcase your projects
- **Sponsors** — Tiered sponsorship model (Gold, Silver, Bronze) with application workflow
- **Jobs** — Sponsor-powered job listings with filtering
- **Blog** — Articles, tutorials, and talk recordings
- **Gamification** — XP, levels, and badges to reward community participation
- **Internationalization** — Full English and Dutch language support
- **Authentication** — Email/password and GitHub OAuth signin

## Tech Stack

| Category | Technology |
| --- | --- |
| Framework | [Next.js 15](https://nextjs.org/), [React 19](https://react.dev/), TypeScript |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/), [shadcn/ui](https://ui.shadcn.com/) |
| API | [tRPC 11](https://trpc.io/) |
| Database | PostgreSQL ([Neon Serverless](https://neon.tech/)), [Drizzle ORM](https://orm.drizzle.team/) |
| CMS | [Payload CMS 3](https://payloadcms.com/) |
| Auth | [Better Auth](https://www.better-auth.com/) |
| Email | [Resend](https://resend.com/) |
| i18n | [next-intl](https://next-intl-docs.vercel.app/) |
| Animation | [Framer Motion](https://www.framer.com/motion/) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9.12+
- A PostgreSQL database ([Neon](https://neon.tech/) recommended, or any PostgreSQL instance)

### Installation

```bash
git clone https://github.com/ai-tech-community/aitcom.git
cd aitcom
pnpm install
```

### Environment Setup

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

At minimum, you need:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Auth session secret (min 32 chars) |
| `PAYLOAD_SECRET` | Payload CMS secret (min 32 chars) |

Optional services:

| Variable | Description |
| --- | --- |
| `BETTER_AUTH_GITHUB_CLIENT_ID` | GitHub OAuth — [create an app](https://github.com/settings/developers) |
| `BETTER_AUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth secret |
| `RESEND_API_KEY` | Email delivery via [Resend](https://resend.com/) |
| `S3_ACCESS_KEY_ID` | S3-compatible storage for file uploads |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_BUCKET` | S3 bucket name |
| `S3_REGION` | S3 region (default: `eu-central-1`) |
| `CRON_SECRET` | Authorization token for cron endpoints |

See [.env.example](.env.example) for the full list.

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

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License. See [LICENSE](LICENSE) for details.
