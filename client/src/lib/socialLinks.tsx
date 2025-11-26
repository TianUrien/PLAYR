import { Instagram, Linkedin, Twitter, Facebook } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

// TikTok icon component (not in lucide-react)
export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}

export type SocialPlatform = 'instagram' | 'tiktok' | 'linkedin' | 'twitter' | 'facebook'

export type SocialLinks = Partial<Record<SocialPlatform, string>>

type IconComponent = LucideIcon | ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

export interface SocialPlatformConfig {
  key: SocialPlatform
  label: string
  icon: IconComponent
  placeholder: string
  urlPrefix: string
  color: string
  hoverColor: string
}

export const SOCIAL_PLATFORMS: SocialPlatformConfig[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    icon: Instagram,
    placeholder: 'https://instagram.com/username',
    urlPrefix: 'https://instagram.com/',
    color: 'text-pink-500',
    hoverColor: 'hover:text-pink-600',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    icon: TikTokIcon,
    placeholder: 'https://tiktok.com/@username',
    urlPrefix: 'https://tiktok.com/@',
    color: 'text-gray-900',
    hoverColor: 'hover:text-gray-700',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    placeholder: 'https://linkedin.com/in/username',
    urlPrefix: 'https://linkedin.com/in/',
    color: 'text-blue-600',
    hoverColor: 'hover:text-blue-700',
  },
  {
    key: 'twitter',
    label: 'X (Twitter)',
    icon: Twitter,
    placeholder: 'https://x.com/username',
    urlPrefix: 'https://x.com/',
    color: 'text-gray-800',
    hoverColor: 'hover:text-gray-600',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: Facebook,
    placeholder: 'https://facebook.com/username',
    urlPrefix: 'https://facebook.com/',
    color: 'text-blue-500',
    hoverColor: 'hover:text-blue-600',
  },
]

/**
 * Validates a social media URL
 */
export const validateSocialUrl = (url: string): boolean => {
  if (!url || !url.trim()) return true // Empty is valid
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) && trimmed.length <= 500
}

/**
 * Validates all social links
 */
export const validateSocialLinks = (links: SocialLinks): { valid: boolean; error?: string } => {
  const validKeys = SOCIAL_PLATFORMS.map(p => p.key)
  
  for (const [key, value] of Object.entries(links)) {
    if (!validKeys.includes(key as SocialPlatform)) {
      return { valid: false, error: `Invalid social platform: ${key}` }
    }
    if (value && !validateSocialUrl(value)) {
      return { valid: false, error: `Invalid URL for ${key}. URLs must start with http:// or https://` }
    }
  }
  
  return { valid: true }
}

/**
 * Cleans social links by removing empty values
 */
export const cleanSocialLinks = (links: SocialLinks): SocialLinks => {
  const cleaned: SocialLinks = {}
  for (const [key, value] of Object.entries(links)) {
    const trimmed = value?.trim()
    if (trimmed) {
      cleaned[key as SocialPlatform] = trimmed
    }
  }
  return cleaned
}
