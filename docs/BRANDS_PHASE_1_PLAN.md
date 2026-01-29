# Brands Feature: Phase 1 Implementation Plan

> **Status:** Ready for implementation
> **Scope:** MVP — Brand profiles, directory, onboarding
> **Excludes:** Products, sponsorships, following (Phase 2+)

---

## Overview

Brands are a new user role in PLAYR. A brand represents equipment manufacturers, apparel companies, and service providers in the hockey ecosystem. Brands can:

- Create a public profile with logo, bio, and links
- Be discovered in a dedicated `/brands` directory
- Receive and reply to messages (cannot initiate)

---

## Constraints

| Rule | Description |
|------|-------------|
| One role per user | A user is either Player, Coach, Club, Agent, OR Brand |
| One brand per user | A brand user has exactly one brand profile |
| No role switching | Once registered as Brand, cannot become Player (and vice versa) |
| Reply-only messaging | Brands cannot start conversations; they can only reply |

---

## Data Model

### 1. Add 'brand' to role enum

```sql
-- Migration: add_brand_role.sql
ALTER TYPE user_role ADD VALUE 'brand';
```

### 2. Create brands table

```sql
-- Migration: create_brands_table.sql
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Identity
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  cover_url TEXT,

  -- Details
  bio TEXT,
  website_url TEXT,
  instagram_url TEXT,
  category TEXT NOT NULL DEFAULT 'other',

  -- Metadata
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_category CHECK (category IN (
    'equipment', 'apparel', 'accessories',
    'nutrition', 'services', 'technology', 'other'
  ))
);

-- Indexes
CREATE INDEX idx_brands_slug ON brands(slug);
CREATE INDEX idx_brands_category ON brands(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_brands_profile_id ON brands(profile_id);

-- Trigger for updated_at
CREATE TRIGGER set_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 3. Row Level Security

```sql
-- Migration: brands_rls.sql
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- Public read access (non-deleted brands)
CREATE POLICY "Brands are publicly readable"
  ON brands FOR SELECT
  USING (deleted_at IS NULL);

-- Owner can insert (during onboarding)
CREATE POLICY "Users can create their own brand"
  ON brands FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

-- Owner can update their brand
CREATE POLICY "Users can update their own brand"
  ON brands FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- Soft delete only (owner)
CREATE POLICY "Users can soft delete their own brand"
  ON brands FOR UPDATE
  USING (auth.uid() = profile_id);
```

---

## RPC Functions

### get_brands

```sql
CREATE OR REPLACE FUNCTION get_brands(
  p_category TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'brands', COALESCE(json_agg(row_to_json(b)), '[]'::json),
      'total', (SELECT COUNT(*) FROM brands WHERE deleted_at IS NULL
                AND (p_category IS NULL OR category = p_category)
                AND (p_search IS NULL OR name ILIKE '%' || p_search || '%'))
    )
    FROM (
      SELECT
        id, slug, name, logo_url, bio, category, website_url
      FROM brands
      WHERE deleted_at IS NULL
        AND (p_category IS NULL OR category = p_category)
        AND (p_search IS NULL OR name ILIKE '%' || p_search || '%')
      ORDER BY created_at DESC
      LIMIT p_limit
      OFFSET p_offset
    ) b
  );
END;
$$;
```

### get_brand_by_slug

```sql
CREATE OR REPLACE FUNCTION get_brand_by_slug(p_slug TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT row_to_json(b)
    FROM (
      SELECT
        br.id, br.slug, br.name, br.logo_url, br.cover_url,
        br.bio, br.website_url, br.instagram_url, br.category,
        br.is_verified, br.created_at,
        p.id as profile_id
      FROM brands br
      JOIN profiles p ON p.id = br.profile_id
      WHERE br.slug = p_slug
        AND br.deleted_at IS NULL
    ) b
  );
END;
$$;
```

### create_brand

```sql
CREATE OR REPLACE FUNCTION create_brand(
  p_name TEXT,
  p_slug TEXT,
  p_category TEXT,
  p_bio TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL,
  p_instagram_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id UUID;
  v_profile_role TEXT;
  v_brand_id UUID;
BEGIN
  -- Get caller's profile
  SELECT id, role INTO v_profile_id, v_profile_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Verify role is brand
  IF v_profile_role != 'brand' THEN
    RAISE EXCEPTION 'Only brand accounts can create a brand profile';
  END IF;

  -- Check if brand already exists for this profile
  IF EXISTS (SELECT 1 FROM brands WHERE profile_id = v_profile_id) THEN
    RAISE EXCEPTION 'Brand already exists for this account';
  END IF;

  -- Check slug uniqueness
  IF EXISTS (SELECT 1 FROM brands WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'Brand slug already taken';
  END IF;

  -- Create brand
  INSERT INTO brands (profile_id, name, slug, category, bio, logo_url, website_url, instagram_url)
  VALUES (v_profile_id, p_name, p_slug, p_category, p_bio, p_logo_url, p_website_url, p_instagram_url)
  RETURNING id INTO v_brand_id;

  RETURN json_build_object(
    'success', true,
    'brand_id', v_brand_id,
    'slug', p_slug
  );
END;
$$;
```

### update_brand

```sql
CREATE OR REPLACE FUNCTION update_brand(
  p_name TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL,
  p_cover_url TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL,
  p_instagram_url TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_brand_id UUID;
BEGIN
  -- Get caller's brand
  SELECT id INTO v_brand_id
  FROM brands
  WHERE profile_id = auth.uid()
    AND deleted_at IS NULL;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Brand not found';
  END IF;

  -- Update only provided fields
  UPDATE brands
  SET
    name = COALESCE(p_name, name),
    bio = COALESCE(p_bio, bio),
    logo_url = COALESCE(p_logo_url, logo_url),
    cover_url = COALESCE(p_cover_url, cover_url),
    website_url = COALESCE(p_website_url, website_url),
    instagram_url = COALESCE(p_instagram_url, instagram_url),
    category = COALESCE(p_category, category),
    updated_at = NOW()
  WHERE id = v_brand_id;

  RETURN json_build_object('success', true);
END;
$$;
```

---

## Messaging Constraint

Update the `send_message` or `create_conversation` RPC to enforce:

```sql
-- Add to existing send_message function
DECLARE
  v_sender_role TEXT;
  v_thread_exists BOOLEAN;
BEGIN
  -- Get sender role
  SELECT role INTO v_sender_role FROM profiles WHERE id = auth.uid();

  -- If sender is a brand, verify thread exists
  IF v_sender_role = 'brand' THEN
    SELECT EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = p_conversation_id
        AND profile_id = auth.uid()
    ) INTO v_thread_exists;

    IF NOT v_thread_exists THEN
      RAISE EXCEPTION 'Brands cannot initiate conversations';
    END IF;
  END IF;

  -- Continue with normal send logic...
END;
```

---

## Frontend: Pages & Routes

### New Routes (App.tsx)

```tsx
// Public
<Route path="/brands" element={<BrandsPage />} />
<Route path="/brands/:slug" element={<BrandProfilePage />} />

// Authenticated (brand role)
<Route path="/brands/onboarding" element={<BrandOnboardingPage />} />
<Route path="/dashboard/brand" element={<BrandDashboardPage />} />
```

### Page Descriptions

| Page | Route | Purpose |
|------|-------|---------|
| BrandsPage | `/brands` | Directory listing with category filters |
| BrandProfilePage | `/brands/:slug` | Public brand profile |
| BrandOnboardingPage | `/brands/onboarding` | Create brand after signup |
| BrandDashboardPage | `/dashboard/brand` | Edit brand profile |

---

## Frontend: Components

### Component Tree

```
/components/brands/
├── BrandCard.tsx           # Card for directory grid
├── BrandProfile.tsx        # Full profile layout
├── BrandHeader.tsx         # Cover + logo + name section
├── BrandForm.tsx           # Create/edit form
├── BrandCategoryFilter.tsx # Filter pills
└── index.ts                # Exports

/pages/
├── BrandsPage.tsx          # Directory
├── BrandProfilePage.tsx    # Profile wrapper
├── BrandOnboardingPage.tsx # Onboarding flow
└── BrandDashboardPage.tsx  # Dashboard
```

### BrandCard Component

```tsx
interface BrandCardProps {
  brand: {
    slug: string
    name: string
    logo_url: string | null
    bio: string | null
    category: string
  }
}

export function BrandCard({ brand }: BrandCardProps) {
  return (
    <Link to={`/brands/${brand.slug}`} className="...">
      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
        {brand.logo_url ? (
          <img src={brand.logo_url} alt={brand.name} className="w-full h-full object-contain p-4" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Store className="h-12 w-12 text-gray-400" />
          </div>
        )}
      </div>
      <h3 className="mt-2 font-medium text-gray-900 truncate">{brand.name}</h3>
      <p className="text-sm text-gray-500 capitalize">{brand.category}</p>
    </Link>
  )
}
```

### BrandCategoryFilter Component

```tsx
const CATEGORIES = [
  { value: null, label: 'All' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'apparel', label: 'Apparel' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'services', label: 'Services' },
  { value: 'technology', label: 'Technology' },
  { value: 'other', label: 'Other' },
]

export function BrandCategoryFilter({ value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {CATEGORIES.map(cat => (
        <button
          key={cat.value ?? 'all'}
          onClick={() => onChange(cat.value)}
          className={cn(
            'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap',
            value === cat.value
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          {cat.label}
        </button>
      ))}
    </div>
  )
}
```

---

## Frontend: Hooks

### useBrands

```tsx
// hooks/useBrands.ts
export function useBrands(options?: { category?: string; search?: string }) {
  return useQuery({
    queryKey: ['brands', options],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_brands', {
          p_category: options?.category,
          p_search: options?.search,
        })
      if (error) throw error
      return data
    },
  })
}
```

### useBrand

```tsx
// hooks/useBrand.ts
export function useBrand(slug: string) {
  return useQuery({
    queryKey: ['brand', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_brand_by_slug', { p_slug: slug })
      if (error) throw error
      return data
    },
    enabled: !!slug,
  })
}
```

### useMyBrand

```tsx
// hooks/useMyBrand.ts
export function useMyBrand() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-brand', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .eq('profile_id', user?.id)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    enabled: !!user,
  })
}
```

---

## Onboarding Flow Changes

### Current Flow
```
Signup → Choose Role → Complete Profile → Dashboard
```

### Updated Flow
```
Signup → Choose Role
  ├─ Player/Coach/Club/Agent → Complete Profile → Dashboard
  └─ Brand → Brand Onboarding → /brands/:slug
```

### Role Selection Update

In the role selection step, add "Brand" as an option:

```tsx
const ROLES = [
  { value: 'player', label: 'Player', icon: User },
  { value: 'coach', label: 'Coach', icon: Whistle },
  { value: 'club', label: 'Club', icon: Shield },
  { value: 'agent', label: 'Agent', icon: Briefcase },
  { value: 'brand', label: 'Brand', icon: Store },  // NEW
]
```

### Brand Onboarding Page

```tsx
// pages/BrandOnboardingPage.tsx
export default function BrandOnboardingPage() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    category: 'equipment',
    bio: '',
    website_url: '',
    instagram_url: '',
    logo_url: '',
  })

  const createBrand = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_brand', {
        p_name: formData.name,
        p_slug: formData.slug,
        p_category: formData.category,
        p_bio: formData.bio || null,
        p_website_url: formData.website_url || null,
        p_instagram_url: formData.instagram_url || null,
        p_logo_url: formData.logo_url || null,
      })
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      navigate(`/brands/${data.slug}`)
    },
  })

  // Form UI...
}
```

---

## Navigation Changes

### MobileBottomNav.tsx

```diff
- import { Users, Briefcase, MessageCircle, Globe } from 'lucide-react'
+ import { Users, Briefcase, Store, Globe } from 'lucide-react'

const navItems: NavItem[] = [
  { id: 'community', label: 'Community', path: '/community', icon: Users },
  { id: 'world', label: 'World', path: '/world', icon: Globe },
  { id: 'opportunities', label: 'Opportunities', path: '/opportunities', icon: Briefcase },
- { id: 'messages', label: 'Messages', path: '/messages', icon: MessageCircle },
+ { id: 'brands', label: 'Brands', path: '/brands', icon: Store },
]
```

### Header.tsx (Mobile Section)

```tsx
// Add Messages icon to mobile header, next to notifications
<div className="flex items-center gap-1 lg:hidden">
  <Link
    to="/messages"
    className="relative p-2 rounded-full hover:bg-gray-100"
    aria-label="Messages"
  >
    <MessageCircle className="h-6 w-6 text-gray-600" />
    {unreadMessageCount > 0 && (
      <NotificationBadge count={unreadMessageCount} />
    )}
  </Link>
  <button onClick={toggleNotifications} className="relative p-2 rounded-full hover:bg-gray-100">
    <Bell className="h-6 w-6 text-gray-600" />
    {unreadCount > 0 && <NotificationBadge count={unreadCount} />}
  </button>
</div>
```

---

## Implementation Checklist

### Database (Priority 1)
- [ ] Migration: Add 'brand' to user_role enum
- [ ] Migration: Create brands table
- [ ] Migration: Add RLS policies
- [ ] Migration: Create RPC functions (get_brands, get_brand_by_slug, create_brand, update_brand)
- [ ] Migration: Update send_message to enforce brand messaging constraint

### Frontend - Core (Priority 2)
- [ ] Add Brand to role selection in onboarding
- [ ] Create BrandOnboardingPage
- [ ] Create useBrands, useBrand, useMyBrand hooks
- [ ] Add routes to App.tsx

### Frontend - Components (Priority 3)
- [ ] BrandCard component
- [ ] BrandCategoryFilter component
- [ ] BrandHeader component
- [ ] BrandProfile component
- [ ] BrandForm component

### Frontend - Pages (Priority 4)
- [ ] BrandsPage (directory)
- [ ] BrandProfilePage
- [ ] BrandDashboardPage

### Navigation (Priority 5)
- [ ] Update MobileBottomNav (replace Messages with Brands)
- [ ] Update Header (add Messages icon to mobile)
- [ ] Wire up unread message count in Header

### Testing
- [ ] Test brand signup flow end-to-end
- [ ] Test brand profile creation
- [ ] Test brand profile editing
- [ ] Test brands directory with filters
- [ ] Test messaging constraint (brand cannot initiate)
- [ ] Test navigation on mobile

---

## File Structure (New Files)

```
client/src/
├── components/brands/
│   ├── BrandCard.tsx
│   ├── BrandCategoryFilter.tsx
│   ├── BrandForm.tsx
│   ├── BrandHeader.tsx
│   ├── BrandProfile.tsx
│   └── index.ts
├── hooks/
│   ├── useBrand.ts
│   ├── useBrands.ts
│   └── useMyBrand.ts
├── pages/
│   ├── BrandsPage.tsx
│   ├── BrandProfilePage.tsx
│   ├── BrandOnboardingPage.tsx
│   └── BrandDashboardPage.tsx

supabase/migrations/
├── YYYYMMDDHHMMSS_add_brand_role.sql
├── YYYYMMDDHHMMSS_create_brands_table.sql
├── YYYYMMDDHHMMSS_brands_rls.sql
├── YYYYMMDDHHMMSS_brands_rpc_functions.sql
└── YYYYMMDDHHMMSS_brand_messaging_constraint.sql
```

---

## Estimated Scope

| Area | Files | Complexity |
|------|-------|------------|
| Database | 5 migrations | Low-Medium |
| Components | 6 new | Medium |
| Hooks | 3 new | Low |
| Pages | 4 new | Medium |
| Navigation | 2 edits | Low |
| Onboarding | 1-2 edits | Medium |

---

## Out of Scope (Phase 2+)

- Product showcase
- Sponsorship management
- Follow/unfollow brands
- "Open to sponsorships" flag on player profiles
- Brand verification/claiming
- Brand posts to World/Community

---

## Ready for Implementation

This plan is complete and ready for your approval. Once approved, implementation can begin with the database migrations.
