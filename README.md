# SLAUGHTERDOME

Multiplayer wave-survival arena. Build walls. Capture flags. Survive the shrinking Dome.

**Play now:** [slaughterdome.vercel.app](https://slaughterdome.vercel.app)

## Core Mechanics

**SHRINKING ARENA** -- The Dome contracts after every wave, forcing fighters into tighter quarters. Toxic water pools spawn from wave 5, cutting off escape routes. Stand outside the ring and the Dome bleeds you dry.

**WALL BUILDING** -- Place walls to block enemy charges, funnel hordes into kill zones, and create choke points. Walls absorb damage and vanish when destroyed. Up to 8 walls at a time. Dasher enemies slam into walls instead of phasing through.

**CAPTURE THE FLAG** -- Each wave spawns a flag somewhere in the arena. Pick it up, deliver it to the glowing drop zone to clear the wave. Deliver while enemies are still alive for bonus points. The flag drops if you die -- your partner can grab it.

## Features

- 2-player online co-op (WebSocket, server-authoritative)
- 8 enemy types: grunt, dasher, brute, spitter, swarm, shielder, bomber, titan boss
- 3 weapons: pistol, shotgun, flamethrower
- 16 upgrades across 4 tiers (common/rare/epic)
- Combo system with 6 tiers up to LEGENDARY
- Dash with i-frames, sword melee combo, AoE shockwave
- Off-screen indicators for flag and delivery zone
- Procedural audio, bloom post-processing, biome transitions

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| SPACE | Dash (3 charges, chainable, i-frames) |
| LMB / SHIFT | Shoot (hold to fire, overheats) |
| RMB | Shockwave (AoE knockback) |
| Q | Sword (3-hit melee combo) |
| E | Wall mode (toggle, then click to place) |
| 1 2 3 | Pick upgrade between waves |

## Tech

- **Client:** Three.js 0.162, ES modules, Vercel
- **Server:** Node.js, WebSocket (ws), Railway
- **Architecture:** Server-authoritative with client-side prediction

## Run Locally

```bash
# Server
cd server && npm install && node index.js

# Client -- serve from project root
npx serve .
```

---

Built by exHuman // 2026
