# PLAYR - Modern React Application

A production-ready React application built with Vite, TypeScript, Tailwind CSS v4, and Supabase integration.

## 🚀 Tech Stack

- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite (with Rolldown experimental)
- **Styling:** Tailwind CSS v4 (next) with custom PLAYR branding
- **Backend:** Supabase (Authentication, Database, Storage)
- **UI Components:** Custom glassmorphism components
- **Icons:** Lucide React
- **Routing:** React Router DOM
- **Utilities:** clsx, class-variance-authority

## ✨ Features

- 🎨 **Custom Design System** - PLAYR brand colors and theme
- 🌓 **Dark Mode** - Default dark theme with custom color palette
- 💎 **Glassmorphism** - Beautiful glass-morphic UI components
- ⚡ **Lightning Fast** - Vite HMR and optimized builds
- 📱 **Responsive** - Mobile-first design approach
- 🔐 **Authentication Ready** - Supabase auth integration
- 🎯 **Type Safe** - Full TypeScript support
- 🛠️ **Developer Experience** - Path aliases, utilities, and more

## 🛠️ Setup

1. Install dependencies: `npm install`
2. Configure environment: `cp .env.example .env`
3. Start dev server: `npm run dev`

### Realtime Tuning

- `VITE_CONVERSATION_REALTIME_DEBOUNCE_MS` (default `200`): controls how quickly the Messages page refetches after Supabase realtime events. Increase for heavier traffic to reduce RPC calls, decrease for snappier UI updates.

## 📦 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

See full documentation in the project wiki.

## 🛡️ Sentry Monitoring

- Sentry is initialized inside `src/main.tsx` and wraps the React root with `Sentry.ErrorBoundary`.
- Provide `VITE_SENTRY_DSN` in your `.env` file. The environment automatically maps Vite's `MODE` to `development` or `production` for Sentry.
- Optional source map uploads require `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in `.env`. The Vite plugin only runs when all three are present.
- A dev-only "Throw Sentry Test Error" button is injected via `SentryTestButton` (rendered from `App.tsx`). Click it after running `npm run dev` to send a manual event and verify integration.
