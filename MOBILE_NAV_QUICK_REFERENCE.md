# Mobile Bottom Navigation - Quick Reference

## Navigation Structure

```
┌─────────────────────────────────────────────┐
│  PLAYR Logo    [The Home of Field Hockey]   │  ← Clean header (no hamburger)
├─────────────────────────────────────────────┤
│                                             │
│           Main Content Area                 │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  [👥]  [💼]  [💬]  [📊]  [Profile Menu]     │  ← Bottom Navigation Bar
│  Comm  Opps  Msgs  Dash    👤               │
└─────────────────────────────────────────────┘
```

## Profile Menu Popup

When user taps the profile avatar:

```
┌─────────────────────────────────────────────┐
│                                             │
│           Main Content Area                 │
│                                             │
│                   ┌──────────────┐          │
│                   │ ⚙️ Settings  │          │  ← Popup appears above bar
│                   ├──────────────┤          │
│                   │ 🚪 Sign Out  │          │
│                   └──────────────┘          │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  [👥]  [💼]  [💬]  [📊]  [👤 Active]        │  ← Profile highlighted
└─────────────────────────────────────────────┘
```

## Active States

### Community Active
```
[👥 Purple Glow]  [💼 Gray]  [💬 Gray]  [📊 Gray]  [👤 Gray]
  Community
```

### Messages Active
```
[👥 Gray]  [💼 Gray]  [💬 Purple Glow]  [📊 Gray]  [👤 Gray]
                        Messages
```

### Profile Menu Open
```
[👥 Gray]  [💼 Gray]  [💬 Gray]  [📊 Gray]  [👤 Purple Glow + Ring]
                                              Profile
```

## Icon Legend

- 👥 Community (Users)
- 💼 Opportunities (Briefcase)
- 💬 Messages (MessageCircle)
- 📊 Dashboard (LayoutDashboard)
- 👤 Profile (User Avatar)

## Menu Actions

### Settings
- Icon: ⚙️ Settings
- Color: Gray (#6B7280)
- Action: Navigate to `/settings`
- Hover: Light gray background

### Sign Out
- Icon: 🚪 LogOut
- Color: Red (#DC2626)
- Action: Sign out + redirect to `/`
- Hover: Light red background

## Behavior

### Auto-Hide Scenarios
1. ❌ Not authenticated
2. ❌ On auth pages: `/`, `/signup`, `/login`, `/complete-profile`
3. ❌ Keyboard is open (iOS)

### Always Show
✅ Authenticated users on app pages
✅ Mobile devices only (< 768px)
✅ Respects iOS safe areas (notch/home indicator)

## Styling

### Bottom Bar
- Background: White with 95% opacity + backdrop blur
- Border: Top border, gray-200/50
- Shadow: Large shadow for elevation
- Padding: Safe area aware (bottom inset)

### Navigation Buttons
- Size: 64px width × 48px height (WCAG compliant)
- Active: Purple (#6366f1) with gradient glow
- Inactive: Gray (#6B7280)
- Animation: Scale up to 110% when active
- Label: Fades in when active

### Profile Menu
- Size: 192px wide (48 × 4)
- Position: Bottom-full with 8px margin
- Animation: Slide up smoothly
- Border: Rounded-xl with shadow-2xl
- Items: 48px height with hover states

## Implementation Notes

### State Management
```typescript
const [profileMenuOpen, setProfileMenuOpen] = useState(false)
const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
const [isHidden, setIsHidden] = useState(false)
```

### Click Outside Handler
```typescript
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
      setProfileMenuOpen(false)
    }
  }
  // ...
}, [profileMenuOpen])
```

### Keyboard Detection (iOS)
```typescript
const handleResize = () => {
  if (window.visualViewport) {
    const heightDiff = window.innerHeight - window.visualViewport.height
    setIsKeyboardOpen(heightDiff > 150)
  }
}
```

## Comparison: Before vs After

### Before (Hamburger Menu)
```
Header:  [PLAYR Logo]                    [☰]
                                          ↓
         ┌──────────────────────────────┐
         │ 👤 User Name (Coach)         │
         │ ────────────────────────────│
         │ 👥 Community                 │
         │ 💼 Opportunities             │
         │ 💬 Messages                  │
         │ ⚙️ Settings                  │
         │ 🚪 Sign Out                  │
         └──────────────────────────────┘
```

### After (Bottom Nav + Profile Menu)
```
Header:  [PLAYR Logo] [The Home of Field Hockey]

Bottom:  [👥] [💼] [💬] [📊] [👤]
                              ↓
                    ┌──────────────┐
                    │ ⚙️ Settings  │
                    │ ────────────│
                    │ 🚪 Sign Out  │
                    └──────────────┘
```

## Benefits

1. **Cleaner Header** - No hamburger clutter
2. **One-Tap Access** - Everything reachable with thumb
3. **Instagram-Like** - Familiar pattern for users
4. **Better UX** - Single navigation system
5. **More Screen Space** - No dropdown covering content
6. **Faster Navigation** - Direct icon access
7. **Profile Quick Actions** - Settings/Sign Out easily accessible

## Accessibility

- ✅ WCAG 2.1 AA compliant tap targets (48px+)
- ✅ ARIA labels on all buttons
- ✅ ARIA expanded/haspopup on menu
- ✅ Role attributes for screen readers
- ✅ Keyboard navigation support
- ✅ Focus management
- ✅ High contrast text
- ✅ Clear visual feedback
