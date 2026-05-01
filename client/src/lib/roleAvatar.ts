/**
 * Role-avatar helpers.
 *
 * Type guard for narrowing arbitrary `string | null` profile.role values to
 * the 5 known HOCKIA roles before passing to the RolePlaceholder component.
 * Lives here (and not in the component file) so the component file only
 * exports a component — keeps Vite's react-refresh fast-refresh happy.
 */

export type RoleAvatarRole = 'player' | 'coach' | 'club' | 'brand' | 'umpire'

export function isRoleAvatarRole(value: unknown): value is RoleAvatarRole {
  return value === 'player' || value === 'coach' || value === 'club' || value === 'brand' || value === 'umpire'
}
