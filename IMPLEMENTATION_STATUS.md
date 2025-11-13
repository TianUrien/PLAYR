# PLAYR - Implementation Status & Next Steps

## ✅ What's Been Implemented

### 1. Database & Backend (Complete)
- ✅ **Profiles Table Created** with fields:
  - id (UUID, references auth.users)
  - full_name, email, role (player/club)
  - base_location, nationality
  - date_of_birth (optional)
  - profile_photo_url (optional)
  - created_at, updated_at timestamps
- ✅ **Row Level Security (RLS)** policies configured
- ✅ **TypeScript Types Generated** from database schema
- ✅ Migration pushed to remote Supabase project

### 2. Authentication System (Complete)
- ✅ **Auth Store** (Zustand) for global state management
- ✅ **Session Management** with automatic refresh
- ✅ **Auth Listener** initialized in App.tsx
- ✅ **Profile Fetching** on sign-in
- ✅ Ready for social auth (Google, Apple, Facebook)

### 3. UI Components (Complete)
- ✅ **Button** - variants: primary, glass, outline
- ✅ **Input** - with label, error, icon support
- ✅ **Modal** - backdrop blur, keyboard navigation
- ✅ **Avatar** - image or initials support

### 4. Pages & Routing (Complete)
- ✅ **Landing Page** - Hero with glassmorphic sign-in card
- ✅ **Sign Up Page** - Two-step modal (auth → profile)
- ✅ **React Router** configured
- ✅ **Protected Routes** ready for implementation

### 5. Styling System (Complete)
- ✅ **Tailwind CSS v3** configured (downgraded from v4 for stability)
- ✅ **PLAYR Brand Colors** defined
- ✅ **Glassmorphism Classes** (.glass, .glass-strong, .glass-light)
- ✅ **Custom Animations** (fade-in, slide-in-up, scale-in)
- ✅ **Gradient Utilities** (.gradient-playr, .text-gradient)
- ✅ **Inter Font** loaded from Google Fonts

### 6. Development Environment (Complete)
- ✅ **Vite Dev Server** running on http://localhost:5173
- ✅ **Hot Module Replacement** working
- ✅ **Path Aliases** configured (@/*)
- ✅ **Environment Variables** set up
- ✅ **TypeScript** strict mode enabled

## 📋 What Still Needs Implementation

### 1. Global Header Component
**Priority: HIGH**

Create `src/components/Header.tsx` with:
- PLAYR logo (left)
- "Make Hockey Better" orange pill button
- User avatar/menu when logged in
- "Join PLAYR" button when logged out
- Responsive mobile menu

**Copy from references:**
- Logo text: "PLAYR"
- Pill text: "Make Hockey Better."
- Orange color: `#ff9500`

### 2. Dashboard Pages
**Priority: HIGH**

#### Player Dashboard (`src/pages/PlayerDashboard.tsx`)
- Profile header: name, nationality flag, base location
- Avatar (photo or initials)
- Tabs: Profile, Media, History, Achievements, Availability
- "Profile" tab content:
  - Basic info display
  - Role/Position field (optional)
  - Edit profile button

#### Club Dashboard (`src/pages/ClubDashboard.tsx`)
- Club header: name, league, location
- Club logo/avatar
- Tabs: Overview, Media, Vacancies, Players
- "Overview" tab content:
  - Founded date
  - League/Division
  - Website, Phone
  - Mission, Vision, Core Values
  - Quick Action: "Create Vacancy" button (placeholder)

### 3. Protected Routes
**Priority: MEDIUM**

Create `src/components/ProtectedRoute.tsx`:
```typescript
// Redirect to landing if not authenticated
// Check if profile exists, redirect to onboarding if not
// Route to correct dashboard based on role
```

Update App.tsx routes:
```typescript
<Route path="/dashboard/profile" element={
  <ProtectedRoute>
    <DashboardRouter />
  </ProtectedRoute>
} />
```

### 4. Background Images
**Priority: MEDIUM**

- Download/add field hockey images to `public/images/`
- Update Landing.tsx background image src
- Ensure dark overlay for text readability

### 5. Social Auth Integration
**Priority: LOW (MVP)**

Update Supabase dashboard:
- Enable Google OAuth
- Enable Apple OAuth  
- Enable Facebook OAuth

Update SignUp.tsx social buttons to actually trigger auth.

### 6. File Upload (Profile Photos)
**Priority: LOW (MVP)**

- Implement file upload in profile completion
- Upload to Supabase Storage
- Save URL to profile_photo_url
- Display in avatar component

### 7. Form Validation
**Priority: MEDIUM**

Add React Hook Form + Zod validation to:
- Sign In form
- Sign Up form (both steps)
- Profile edit forms

Already installed: `react-hook-form`, `@hookform/resolvers`, `zod`

### 8. Loading & Error States
**Priority: MEDIUM**

- Loading spinners during auth operations
- Error toast notifications
- Form field error messages
- Empty states for dashboards

## 🚀 Quick Implementation Guide

### Step 1: Create Header (30 mins)
```typescript
// src/components/Header.tsx
import { useAuthStore } from '@/lib/auth'
import { Avatar } from '@/components'
import { useNavigate } from 'react-router-dom'

export default function Header() {
  const { user, profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
      <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">PLAYR</span>
          <span className="px-3 py-1 rounded-full text-sm font-medium" 
                style={{background: '#ff9500', color: 'white'}}>
            Make Hockey Better.
          </span>
        </div>
        
        {/* Right Side */}
        {user && profile ? (
          <div className="flex items-center gap-4">
            <Avatar 
              src={profile.profile_photo_url}
              initials={profile.full_name.split(' ').map(n => n[0]).join('')}
            />
            <button onClick={() => signOut()}>Sign Out</button>
          </div>
        ) : (
          <button 
            onClick={() => navigate('/signup')}
            className="px-6 py-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
          >
            Join PLAYR
          </button>
        )}
      </nav>
    </header>
  )
}
```

### Step 2: Create Dashboard Router (20 mins)
```typescript
// src/pages/DashboardRouter.tsx
import { useAuthStore } from '@/lib/auth'
import PlayerDashboard from './PlayerDashboard'
import ClubDashboard from './ClubDashboard'

export default function DashboardRouter() {
  const { profile } = useAuthStore()
  
  if (!profile) return <div>Loading...</div>
  
  return profile.role === 'player' 
    ? <PlayerDashboard /> 
    : <ClubDashboard />
}
```

### Step 3: Create Player Dashboard (45 mins)
```typescript
// src/pages/PlayerDashboard.tsx
import { useState } from 'react'
import { useAuthStore } from '@/lib/auth'
import { Avatar } from '@/components'
import Header from '@/components/Header'

export default function PlayerDashboard() {
  const { profile } = useAuthStore()
  const [activeTab, setActiveTab] = useState('profile')
  
  const tabs = ['Profile', 'Media', 'History', 'Achievements', 'Availability']
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
        {/* Profile Header */}
        <div className="bg-white rounded-2xl p-8 shadow-sm mb-6">
          <div className="flex items-start gap-6">
            <Avatar 
              src={profile?.profile_photo_url}
              initials={profile?.full_name.split(' ').map(n => n[0]).join('')}
              size="xl"
            />
            <div>
              <h1 className="text-3xl font-bold mb-2">{profile?.full_name}</h1>
              <div className="flex items-center gap-4 text-gray-600">
                <span>🏴 {profile?.nationality}</span>
                <span>📍 {profile?.base_location}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="border-b border-gray-200">
            <nav className="flex gap-8 px-6">
              {tabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab.toLowerCase())}
                  className={`py-4 border-b-2 transition-colors ${
                    activeTab === tab.toLowerCase()
                      ? 'border-[#6366f1] text-[#6366f1]'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'profile' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Role</label>
                  <p className="mt-1">Player</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Date of Birth</label>
                  <p className="mt-1">{profile?.date_of_birth || 'Not provided'}</p>
                </div>
                <button className="px-4 py-2 bg-[#6366f1] text-white rounded-lg">
                  Edit Profile
                </button>
              </div>
            )}
            {activeTab !== 'profile' && (
              <p className="text-gray-500">Content coming soon...</p>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
```

### Step 4: Create Club Dashboard (Similar structure, 45 mins)

### Step 5: Connect Routes (10 mins)
Update `App.tsx`:
```typescript
import DashboardRouter from '@/pages/DashboardRouter'

// In Routes:
<Route path="/dashboard/profile" element={<DashboardRouter />} />
```

## 📊 Current Project Status

**Overall Progress: 60% Complete**

- ✅ Backend & Database: 100%
- ✅ Authentication: 100%
- ✅ Core UI Components: 100%
- ✅ Landing & Sign Up: 100%
- ⏳ Dashboards: 0%
- ⏳ Global Header: 0%
- ⏳ Protected Routes: 0%

**Estimated Time to MVP: 3-4 hours**

## 🎯 Testing Checklist

Once dashboards are implemented, test:

1. [ ] Sign up as Player → redirects to Player Dashboard
2. [ ] Sign up as Club → redirects to Club Dashboard
3. [ ] Sign in existing user → redirects to correct dashboard
4. [ ] Profile photo uploads and displays correctly
5. [ ] Initials show when no photo provided
6. [ ] Header persists across all pages
7. [ ] Sign out works and redirects to landing
8. [ ] Responsive design on mobile
9. [ ] Tab navigation works
10. [ ] All copy matches specifications

## 🔗 Resources

- **Dev Server:** http://localhost:5173
- **Supabase Dashboard:** https://supabase.com/dashboard/project/xtertgftujnebubxgqit
- **Design References:** Provided images
- **Database Types:** `client/src/lib/database.types.ts`

## 💡 Pro Tips

1. **Copy Exact Text:** Use the exact copy from the brief for consistency
2. **Colors:** Primary `#6366f1`, Secondary `#8b5cf6`, Orange `#ff9500`
3. **Icons:** Use lucide-react for consistent icon style
4. **Responsiveness:** Mobile-first approach, test on small screens
5. **Accessibility:** Keyboard navigation, focus states, alt text

---

**Next Action:** Implement Header component, then dashboards. Development server is running and ready! 🚀
