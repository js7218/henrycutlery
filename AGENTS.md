# AGENTS.md - Ponytail Decision Ladder for Adam Cutlery E-Commerce

## Before writing code, check in this order:
1. Standard library / native platform features
2. Already-installed dependencies (check package.json)
3. One-line solution that already exists
4. Only then write the minimum safe implementation

## Never cut:
- Validation (Zod schemas)
- Error handling
- Security (auth checks, CSRF, rate limiting)
- Accessibility (ARIA labels, keyboard nav)
- Useful smoke tests

## Project conventions:
- Next.js 14+ App Router with TypeScript
- Tailwind CSS with custom colors (gold, steel, surface)
- Server Components by default, 'use client' only for interactivity
- GSAP for animations (use useGSAP hook from @gsap/react)
- lucide-react for icons (already installed)
- Zod for all input validation
