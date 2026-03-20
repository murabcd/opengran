<a href="https://opengran-oss.vercel.app">
  <img alt="Open-source Gronala-like Notepad Built with Vite, Electron, AI SDK and Convex." src="./apps/web/public/preview/opengran.png">
  <h1 align="center">OpenGran</h1>
</a>

<p align="center">
  Open-source Gronala-like Notepad Built with Vite, Electron, AI SDK and Convex.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#model-providers"><strong>Model providers</strong></a> ·
  <a href="#deploy-your-own"><strong>Deploy your own</strong></a> ·
  <a href="#running-locally"><strong>Running locally</strong></a>
</p>
<br/>

## Features

- [Vite](https://vite.dev/)
  - Powers the OpenGran web client with fast local development and production builds
  - Reuses the same frontend renderer for both the browser app and the desktop app
- [Electron](https://www.electronjs.org/)
  - Ships OpenGran as a desktop app with native windowing and tray support
  - Wraps the Vite-built interface in a local desktop shell for cross-platform use
- [AI SDK v6](https://sdk.vercel.ai/docs)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
- [Tiptap v3](https://tiptap.dev/)
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

This app ships with [OpenAI](https://openai.com/) provider as the default. However, with the [Tanstack AI](https://tanstack.com/ai/latest), you can switch LLM providers to [Anthropic](https://anthropic.com), [Ollama](https://ollama.com), [Gemini](https://cohere.com/), and [many more](https://tanstack.com/ai/latest/docs/getting-started/overview) with just a few lines of code.

## Deploy your own

You can deploy your own version of Docufy to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmurabcd%2Fdocs&env=CONVEX_DEPLOYMENT,VITE_CONVEX_URL,OPENAI_API_KEY&envDescription=Learn%20more%20about%20how%20to%20get%20the%20API%20Keys%20for%20the%20application&envLink=https%3A%2F%2Fgithub.com%2Fmurabcd%2Fdocs%2Fblob%2Fmain%2F.env.example&demo-title=Docufy&demo-description=AI-powered%20document%20management%20platform%20built%20with%20Tanstack%20Start%2C%20Tiptap%20v3%2C%20Convex%2C%20and%20OpenAI.&demo-url=https%3A%2F%2Fopengran-oss.vercel.app)

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run Docufy. It's recommended you use [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) for this, but a `.env` file is all that is necessary.

> Note: You should not commit your `.env` file or it will expose secrets that will allow others to control access to your various OpenAI and authentication provider accounts.

```bash
bun install
bun dev
bun convex dev
```

Your app should now be running on [localhost:3000](http://localhost:3000/).
