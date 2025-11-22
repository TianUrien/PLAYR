import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import VacanciesTab from '@/components/VacanciesTab'

const mockSupabaseRpc = vi.fn()
const mockSupabaseFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  SUPABASE_URL: 'https://supabase.test',
  supabase: {
    rpc: (...args: unknown[]) => mockSupabaseRpc(...args),
    from: (...args: unknown[]) => mockSupabaseFrom(...args)
  }
}))

type AuthSnapshot = {
  user: { id: string } | null
  profile: { id: string; role: 'club' | 'player' | 'coach' } | null
}

const authState: AuthSnapshot = {
  user: { id: 'club-1' },
  profile: { id: 'club-1', role: 'club' }
}

vi.mock('@/lib/auth', () => ({
  useAuthStore: () => authState
}))

const addToast = vi.fn()
vi.mock('@/lib/toast', () => ({
  useToastStore: () => ({ addToast })
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

vi.mock('@/components/CreateVacancyModal', () => ({
  __esModule: true,
  default: () => null
}))

vi.mock('@/components/ApplyToVacancyModal', () => ({
  __esModule: true,
  default: () => null
}))

vi.mock('@/components/VacancyDetailView', () => ({
  __esModule: true,
  default: () => null
}))

vi.mock('@/components/PublishConfirmationModal', () => ({
  __esModule: true,
  default: () => null
}))

vi.mock('@/components/DeleteVacancyModal', () => ({
  __esModule: true,
  default: () => null
}))

const user = userEvent.setup()

const createQueryBuilder = (rows: Array<Record<string, unknown>> = []) => ({
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
  or: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
  single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null })
})

let rpcResponse: Array<Record<string, unknown>> = []
let applicationRows: Array<{ vacancy_id: string }> = []

beforeEach(() => {
  rpcResponse = []
  applicationRows = []
  mockSupabaseRpc.mockImplementation((fnName: string) => {
    if (fnName === 'fetch_club_vacancies_with_counts') {
      return {
        returns: () => Promise.resolve({ data: rpcResponse, error: null })
      }
    }
    return {
      returns: () => Promise.resolve({ data: [], error: null })
    }
  })

  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'vacancy_applications') {
      return createQueryBuilder(applicationRows)
    }
    return createQueryBuilder([])
  })

  mockNavigate.mockReset()
  addToast.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

const renderTab = (props?: Partial<React.ComponentProps<typeof VacanciesTab>>) => {
  const resolvedProfileId = props?.profileId ?? authState.user?.id
  return render(
    <MemoryRouter>
      <VacanciesTab profileId={resolvedProfileId} {...props} />
    </MemoryRouter>
  )
}

const baseVacancy = {
  id: 'vac-1',
  title: 'Midfield Maestro',
  status: 'open',
  opportunity_type: 'player',
  position: 'midfielder',
  gender: 'Men',
  location_city: 'London',
  location_country: 'United Kingdom',
  start_date: '2024-12-01',
  duration_text: 'Full season',
  description: 'Looking for a technical number 8',
  benefits: ['housing', 'car'],
  priority: 'high',
  club_id: 'club-1',
  created_at: '2024-11-01',
  updated_at: '2024-11-05',
  published_at: '2024-11-06',
  closed_at: null
}

describe('Vacancies tab', () => {
  it('renders club management view with applicant controls', async () => {
    rpcResponse = [{ ...baseVacancy, applicant_count: 4 }]

    renderTab()

    await waitFor(() => expect(screen.getByText('Midfield Maestro')).toBeInTheDocument())
    expect(screen.getByText('✓ Published')).toBeInTheDocument()
    expect(screen.getByText(/^player$/i)).toBeInTheDocument()
    expect(screen.getByText('4 applicants')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /4 applicants/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/club/vacancies/vac-1/applicants')

    expect(screen.getByLabelText(/open vacancy menu/i)).toBeInTheDocument()
  })

  it('shows public view with accurate cards and actions', async () => {
    authState.user = { id: 'player-9' }
    authState.profile = { id: 'player-9', role: 'player' }
    rpcResponse = [{ ...baseVacancy, applicant_count: 0 }]
    applicationRows = []

    renderTab({ readOnly: true, profileId: 'club-1' })

    await waitFor(() => expect(screen.getByText('Open opportunities')).toBeInTheDocument())
    expect(screen.getByText('Midfield Maestro')).toBeInTheDocument()
    expect(screen.getByText(/start dec/i)).toBeInTheDocument()
    expect(screen.getByText(/apply now/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /apply now/i }))
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
