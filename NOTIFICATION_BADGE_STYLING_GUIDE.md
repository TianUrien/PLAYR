# NotificationBadge - CSS Styling Guide

## 🎨 Visual Breakdown

### Component Structure
```
┌─────────────────────────────────┐
│ Parent Button (relative)        │
│  ┌──────────────────────┐       │
│  │ Icon/Text            │       │
│  └──────────────────────┘       │
│         ┌────┐                  │
│         │ 9+ │ ← Badge          │
│         └────┘                  │
└─────────────────────────────────┘
```

---

## 🎯 CSS Properties Reference

### Position & Size
```css
position: absolute;      /* Overlay on parent */
top: -6px;              /* Sits above parent edge */
right: -6px;            /* Sits right of parent edge */
min-width: 20px;        /* Minimum circular size */
height: 20px;           /* Fixed height */
padding: 0 6px;         /* Horizontal padding for text */
```

**Result**: Badge appears in top-right corner, extending beyond parent bounds.

---

### Layout & Alignment
```css
display: inline-flex;
align-items: center;
justify-center: center;
```

**Result**: Text perfectly centered both horizontally and vertically.

---

### Typography
```css
font-size: 11px;        /* Compact but readable */
font-weight: 700;       /* Bold for emphasis */
line-height: 1;         /* Tight line height */
color: #ffffff;         /* White text */
letter-spacing: -0.02em; /* Tighter spacing */
```

**Result**: Crisp, readable numbers with professional appearance.

---

### Background Gradient
```css
background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
```

**Visual**:
```
#ef4444 (red)  ──────────→  #f97316 (orange)
     ↖                          ↗
      135° diagonal angle
```

**Result**: Smooth red-to-orange gradient at 135-degree angle (top-left to bottom-right).

---

### Border & Shape
```css
border-radius: 10px;    /* Half of height = circular */
border: 2px solid #ffffff;
```

**Result**: Perfectly circular for single digits, pill-shaped for double digits.

---

### Shadow & Depth
```css
box-shadow: 
  0 2px 8px rgba(239, 68, 68, 0.35),   /* Main shadow with red tint */
  0 0 0 1px rgba(0, 0, 0, 0.05);       /* Subtle outline */
```

**Layer Breakdown**:
1. **Shadow 1**: Soft blur (8px) below badge with red glow (35% opacity)
2. **Shadow 2**: Hairline border for definition (5% black)

**Result**: Subtle depth and glow effect without overwhelming the design.

---

### Animation
```css
/* Initial State */
opacity: 0;
transform: scale(0.5);

/* Transition */
transition: 
  opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
  transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);

/* Visible State */
.notification-badge--visible {
  opacity: 1;
  transform: scale(1);
}
```

**Easing Functions**:
- **Opacity**: Standard ease-out for smooth fade
- **Transform**: Spring easing (1.56 creates subtle bounce)

**Timeline**:
```
0ms ───────────────────────────────────────────────── 250ms
  ↓                                                      ↓
scale(0.5)                                          scale(1)
opacity: 0                                          opacity: 1
                    ↑
              Smooth acceleration with bounce
```

**Result**: Badge "pops in" with subtle spring effect.

---

## 🎨 Color Palette

### Light Mode
```css
Background:   linear-gradient(135deg, #ef4444, #f97316)
Border:       #ffffff (white)
Text:         #ffffff (white)
Shadow:       rgba(239, 68, 68, 0.35) (red with opacity)
```

### Dark Mode
```css
Background:   linear-gradient(135deg, #ef4444, #f97316) /* Same */
Border:       var(--color-dark-surface) /* #18181b */
Text:         #ffffff (white) /* Same */
Shadow:       rgba(239, 68, 68, 0.4) /* Slightly stronger */
```

**Result**: Badge adapts to theme while maintaining brand colors.

---

## 📐 Size Examples

### Single Digit (e.g., "3")
```
┌────┐
│ 3  │  20px × 20px (circular)
└────┘
```

### Double Digit (e.g., "9+")
```
┌──────┐
│  9+  │  ~32px × 20px (pill-shaped)
└──────┘
```

Min-width (20px) + padding (12px total) + content = dynamic width

---

## 🎯 Position Variants

### Default (Absolute - Top Right)
```css
.notification-badge {
  position: absolute;
  top: -6px;
  right: -6px;
}
```

### Top Left Alternative
```css
.notification-badge--top-left {
  top: -6px;
  right: auto;
  left: -6px;
}
```

### Inline Alternative
```css
.notification-badge--inline {
  position: relative;
  top: auto;
  right: auto;
  margin-left: 8px;
}
```

**Usage**:
```tsx
{/* Absolute */}
<NotificationBadge count={5} />

{/* Inline */}
<NotificationBadge count={5} className="notification-badge--inline" />
```

---

## 🌊 Hover Enhancement

```css
button:hover .notification-badge,
a:hover .notification-badge {
  box-shadow: 
    0 2px 12px rgba(239, 68, 68, 0.45),  /* Stronger glow */
    0 0 0 1px rgba(0, 0, 0, 0.05);
}
```

**Effect**: When hovering over parent button/link, badge shadow intensifies slightly.

---

## 🎭 Z-Index Layering

```css
z-index: 10;              /* Above parent content */
pointer-events: none;     /* Clicks pass through to parent */
```

**Result**: Badge overlays content but doesn't interfere with interactions.

---

## 📊 Performance Optimization

### GPU-Accelerated Properties
✅ `transform` - Uses GPU compositing
✅ `opacity` - Hardware accelerated

### Avoided Properties
❌ `width` (animating) - Causes reflow
❌ `left`/`top` (animating) - Causes reflow

**Result**: Smooth 60fps animations with minimal CPU usage.

---

## 🔧 Customization Guide

### Change Colors
```css
/* Update gradient */
background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
/*                                   ↑ Green    ↑ Blue       */

/* Update shadow to match */
box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35), ...;
```

### Change Size
```css
/* Larger badge */
min-width: 24px;
height: 24px;
font-size: 12px;

/* Adjust positioning */
top: -8px;
right: -8px;
```

### Add Pulse Animation
```css
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.notification-badge--pulse {
  animation: pulse 2s infinite;
}
```

---

## 🎨 Design Tokens Integration

### Current Implementation
```css
/* Hardcoded values */
background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
```

### Future Design Token Approach
```css
/* Using CSS variables */
background: linear-gradient(
  135deg, 
  var(--color-playr-danger) 0%, 
  var(--color-playr-orange) 100%
);
```

**Benefit**: Centralized color management, easier theme switching.

---

## 📱 Responsive Behavior

```css
/* Mobile - No changes needed */
@media (max-width: 768px) {
  .notification-badge {
    /* Same styles work perfectly */
  }
}

/* Large screens - Optional scaling */
@media (min-width: 1920px) {
  .notification-badge {
    min-width: 22px;
    height: 22px;
    font-size: 12px;
  }
}
```

**Result**: Badge scales appropriately across all devices.

---

## ✅ Browser Compatibility

- ✅ Chrome/Edge: Full support
- ✅ Firefox: Full support
- ✅ Safari: Full support (webkit prefixes not needed)
- ✅ Mobile browsers: Full support

**Note**: All CSS properties used are modern but well-supported (CSS3 standard).

---

## 🎯 Summary

The badge achieves a polished, modern look through:
1. **Gradient**: Diagonal red-to-orange for visual interest
2. **Shadow**: Multi-layer for depth without heaviness
3. **Border**: White border for crisp separation
4. **Animation**: Spring-based scale for lively entrance
5. **Typography**: Tight, bold numbers for readability
6. **Positioning**: Flexible absolute or inline placement

All properties are performance-optimized and fully accessible! 🚀
