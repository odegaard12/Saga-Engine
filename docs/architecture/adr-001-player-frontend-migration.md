# ADR-001: Player frontend migration strategy

## Status
Accepted

## Context
The current player experience is implemented inside server-rendered templates with large inline CSS and JavaScript blocks.
This allowed fast iteration, but it now slows down UX work, responsive tuning, debug tooling, and future mobile packaging.

The project target is a modern mobile-first experience that can run well on iPhone and Android while keeping the existing backend and deployment model.

## Decision
We will:
- keep the current FastAPI backend
- keep Docker-based deployment
- introduce a new frontend app for the player experience
- use React + TypeScript + Vite for the new player frontend
- target browser-first delivery as a modern installable web app
- keep open the option to package the same frontend with Capacitor later

## Why
This gives:
- a more maintainable UI architecture
- better state handling
- cleaner map / HUD / debug separation
- a realistic path to mobile app-like UX
- a safer migration than a full rewrite of the whole system

## Scope
Initial migration target:
- player login / selection flow if needed for player access
- player shell
- player HUD
- map interaction
- debug simulation tools
- mission state rendering

Out of scope for the first phase:
- admin rewrite
- backend rewrite
- production deployment change
- full minigame migration in one step

## Consequences
Positive:
- better maintainability
- easier mobile iteration
- easier future packaging for iPhone / Android
- less template/DOM patching

Negative:
- temporary dual-frontend period
- more repo structure and tooling
- migration planning required

## Notes
The current player template remains the active implementation until the new frontend is ready.
