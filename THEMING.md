# Theming — Rebrand Guide

## Color palette

All colors are CSS custom properties in `src/index.css`:

| Variable | Default | Usage |
|---|---|---|
| `--color-primary` | `#FFE03D` | Gold — CTA buttons, highlights, XP |
| `--color-success` | `#00E86C` | Green — wins, positive balance |
| `--color-danger` | `#FF3B3B` | Red — losses, errors, warnings |
| `--color-fhe` | `#B366FF` | Purple — FHE activity, encryption |
| `--color-info` | `#4D7CFF` | Blue — informational |
| `--color-deco-orange` | `#FF8C42` | Orange — rake, warnings |
| `--color-deco-pink` | `#FF66B2` | Pink — decorative |
| `--color-text-primary` | `#FFFFFF` | Main text |
| `--color-text-muted` | `#7878A0` | Secondary text |
| `--color-text-dark` | `#50507A` | Tertiary text |
| `--color-surface` | `#0C0C1A` | Card surfaces |
| `--color-elevated` | `#151528` | Elevated surfaces |

## Typography

Single typeface: **Chakra Petch** (Google Fonts)

To swap:
1. Update the `<link>` in `index.html`
2. Update `--font-clash`, `--font-satoshi`, `--font-mono` in `index.css`

## Logo / branding

- Logo: `public/logo.png` (replace with your own)
- App name: `index.html` `<title>` + `<meta>` tags + `manifest.json`
- Short name: `manifest.json` → `"short_name"`

## Hold'em table felt

The table green colors are in `HoldemTab.tsx`:
```typescript
// Table gradient — change these to match your brand
background: 'radial-gradient(ellipse 80% 70% at 50% 45%, #163D28 0%, #0E2A1C 45%, #091A12 100%)'
// Table border
border: '2.5px solid rgba(46,120,72,0.45)'
```

## 3-Card table

The table styles are inline in `PlayTab.tsx`. Search for `rgba(26,82,50` to find the green tones.

## Dark mode (current default)

Background: `linear-gradient(160deg, #09091E 0%, #050512 60%, #08080F 100%)` in `index.css`.

## High-contrast mode

Toggle via `document.documentElement.classList.toggle('high-contrast')`.  
Defined in `index.css` under `.high-contrast`.

## PWA theme color

`index.html`:
```html
<meta name="theme-color" content="#FFE03D" />
```

`public/manifest.json`:
```json
"theme_color": "#FFE03D",
"background_color": "#000000"
```
