# Messlines - Digital Artist Portfolio

A stunning digital artist portfolio website built with Astro, React, and animated with HTML5 Canvas. Features a mesmerizing line ball animation that creates a dynamic, artistic background.

## Features

- **Astro SSR** - Server-side rendering for optimal performance
- **React Integration** - Interactive components with client-side hydration
- **Cloudflare Deployment** - Ready for Cloudflare Pages deployment
- **Animated Line Ball** - Custom canvas animation with lines flowing into a central circle
- **Responsive Design** - Looks great on all devices
- **Modern Typography** - Beautiful fonts from Google Fonts (Inter + Playfair Display)

## Animation Details

The main attraction is the **LineBallAnimation** component that creates:

- 200 white pencil-like lines flying from all directions
- Lines are drawn to the center of the screen
- When lines reach the center circle, they get "trapped" and bounce around inside
- Creates a dynamic, ever-changing line ball effect in the center
- Smooth 60fps animation with Canvas API

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
src/
├── components/
│   └── LineBallAnimation.tsx    # Main animation component
├── pages/
│   └── index.astro             # Landing page with artist portfolio
└── ...
```

## Technologies Used

- **Astro 5.13+** - Modern web framework
- **React 19** - UI components
- **TypeScript** - Type safety
- **HTML5 Canvas** - Hardware-accelerated animations
- **Cloudflare Pages** - Deployment platform

## 👀 Want to learn more?

Feel free to check [Astro documentation](https://docs.astro.build) or jump into the [Discord server](https://astro.build/chat).
