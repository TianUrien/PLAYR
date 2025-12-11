# PWA Icons

This folder should contain the following icons for the PWA:

## Required Icons

| File | Size | Purpose |
|------|------|---------|
| `icon-192.png` | 192x192 | Standard app icon |
| `icon-512.png` | 512x512 | Large app icon for splash screens |
| `icon-maskable-192.png` | 192x192 | Maskable icon (with safe zone padding) |
| `icon-maskable-512.png` | 512x512 | Maskable icon for splash screens |

## Shortcut Icons

| File | Size | Purpose |
|------|------|---------|
| `shortcut-opportunities.png` | 96x96 | Opportunities shortcut icon |
| `shortcut-messages.png` | 96x96 | Messages shortcut icon |
| `shortcut-community.png` | 96x96 | Community shortcut icon |

## Screenshots (for enhanced install prompt)

| File | Size | Purpose |
|------|------|---------|
| `screenshot-wide.png` | 1280x720 | Desktop/tablet screenshot |
| `screenshot-narrow.png` | 750x1334 | Mobile screenshot |

## Guidelines

### Maskable Icons
Maskable icons should have important content within the "safe zone" - a circle with radius 40% of the icon width, centered in the icon. The area outside this safe zone may be cropped on some devices.

Use https://maskable.app/editor to test your maskable icons.

### Colors
- Primary: #6366f1 (Indigo)
- Secondary: #8b5cf6 (Purple)
- Background: #ffffff (White)

### Generating Icons
You can use tools like:
- https://realfavicongenerator.net/
- https://www.pwabuilder.com/imageGenerator
- Figma with the "PWA Asset Generator" plugin
