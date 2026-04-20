import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SearchAppearancesCard from '@/components/SearchAppearancesCard'

const sampleDays = [
  { day: '2026-04-14', appearances: 2 },
  { day: '2026-04-15', appearances: 5 },
  { day: '2026-04-16', appearances: 3 },
]

describe('SearchAppearancesCard', () => {
  it('renders nothing when the window has zero appearances', () => {
    const { container } = render(
      <SearchAppearancesCard days={[]} total={0} windowDays={7} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the total count + window copy when there are appearances', () => {
    render(<SearchAppearancesCard days={sampleDays} total={10} windowDays={7} />)
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText(/in the last/i)).toBeInTheDocument()
    expect(screen.getByText('7 days')).toBeInTheDocument()
  })

  it('uses the singular form when total is 1', () => {
    render(
      <SearchAppearancesCard
        days={[{ day: '2026-04-16', appearances: 1 }]}
        total={1}
        windowDays={7}
      />
    )
    // Look for "active search" (singular) somewhere in the rendered content.
    const messages = screen.getAllByText((_, node) => {
      const text = node?.textContent ?? ''
      return /active search(?!es)/i.test(text)
    })
    expect(messages.length).toBeGreaterThan(0)
  })

  it('renders one bar per day bucket for the mini-trend viz', () => {
    const { container } = render(
      <SearchAppearancesCard days={sampleDays} total={10} windowDays={7} />
    )
    const chart = container.querySelector('[role="img"]')
    expect(chart).not.toBeNull()
    const bars = chart?.querySelectorAll('div')
    expect(bars?.length).toBe(sampleDays.length)
  })
})
