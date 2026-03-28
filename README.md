<a href="https://opengran-oss.vercel.app">
  <img alt="Open-source Granola-like Notepad Built with Vite, Electron, AI SDK and Convex." src="./apps/web/public/preview/opengran.png">
  <h1 align="center">OpenGran</h1>
</a>

<p align="center">
  Open-source Granola-like Notepad Built with Vite, Electron, AI SDK and Convex.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#model-providers"><strong>Model providers</strong></a> ·
  <a href="#deploy-your-own"><strong>Deploy your own</strong></a> ·
  <a href="#running-locally"><strong>Running locally</strong></a>
</p>
<br/>

## Apps

- `apps/web`: the browser app and shared renderer
- `apps/desktop`: the Electron desktop app built on the same renderer
- `apps/extension`: the browser extension for in-browser meeting detection and desktop integration

## Features

- [Vite](https://vite.dev/)
  - Powers the OpenGran web client with fast local development and production builds
  - Reuses the same frontend renderer for both the browser app and the desktop app
- [Electron](https://www.electronjs.org/)
  - Ships OpenGran as a desktop app with native windowing and tray support
  - Wraps the Vite-built interface in a local desktop shell for cross-platform use
- [AI SDK](https://sdk.vercel.ai/docs)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
- [Tiptap](https://tiptap.dev/)
  - Modern rich text editor framework
  - Extensible with custom extensions (code blocks, emojis, slash commands, etc.)
- [Better Auth](https://www.better-auth.com/)
  - Secure authentication with [Better Auth for Convex](https://labs.convex.dev/better-auth)
  - GitHub OAuth integration
- [Convex](https://www.convex.dev/)
  - Realtime backend for data sync, queries, mutations, and HTTP auth routes
  - Handles authenticated app state and server-side application logic
- [Shadcn/UI](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility

## Model provider

This app ships with [OpenAI](https://openai.com/) provider as the default. However, with the [AI SDK](https://sdk.vercel.ai/docs), you can switch LLM providers to [Anthropic](https://anthropic.com), [Ollama](https://ollama.com), [Cohere](https://cohere.com/), and [many more](https://sdk.vercel.ai/providers/ai-sdk-providers) with just a few lines of code.

## Deploy your own

You can deploy your own version of OpenGran to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmurabcd%2Fopengran&env=VITE_CONVEX_URL,VITE_CONVEX_SITE_URL,CONVEX_SITE_URL,OPENAI_API_KEY,SITE_URL,BETTER_AUTH_SECRET&envDescription=Set%20the%20Convex%20URLs%2C%20OpenAI%20API%20key%2C%20site%20URL%2C%20and%20Better%20Auth%20secret%20for%20your%20deployment.&envLink=https%3A%2F%2Fgithub.com%2Fmurabcd%2Fopengran%2Fblob%2Fmain%2F.env.example&demo-title=OpenGran&demo-description=Open-source%20Granola-like%20notepad%20built%20with%20Vite%2C%20Electron%2C%20AI%20SDK%2C%20and%20Convex.&demo-url=https%3A%2F%2Fopengran-oss.vercel.app)

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run OpenGran. It's recommended you use [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) for this, but a `.env` file is all that is necessary.

> Note: You should not commit your `.env` file or it will expose secrets that will allow others to control access to your various OpenAI and authentication provider accounts.

```bash
bun install
bun dev
bun convex dev
```

Your app should now be running on [localhost:3000](http://localhost:3000/).

On macOS, `bun dev` now launches an unpacked `OpenGran.app` wired to the local renderer so native permissions and bundle behavior match production more closely.

## Versioning and releases

This repo uses Changesets for granular version bumps.

Typical flow:

```bash
bun changeset
```

Choose a `patch` release for small desktop updates and a `minor` release for larger feature milestones.

When you are ready to ship:

```bash
bun run release:prepare
git add .
git commit -m "version packages"
git push origin main
```

GitHub Actions handles the matching tag creation and desktop release publishing after the version bump lands on `main`. For OSS builds, macOS signing and notarization can be added later when you are ready for broader distribution.
