/**
 * Error Budget Tracking
 *
 * Builds on the performance monitor to provide a high-level
 * reliability signal: are we within our error budget?
 *
 * 99% reliability target = 1% error budget.
 * When 70% of budget is consumed → warning.
 * When 100% is consumed → exceeded.
 */

import { monitor } from './monitor'

export interface ErrorBudgetStatus {
  /** Current error rate as percentage (0-100) */
  errorRate: number
  /** Budget threshold percentage */
  budget: number
  /** Remaining budget percentage */
  remaining: number
  /** Whether we are within budget */
  withinBudget: boolean
  /** Status label */
  status: 'good' | 'warning' | 'exceeded'
}

const ERROR_BUDGET_PERCENT = 1.0  // 99% reliability target
const WARNING_THRESHOLD = 0.7     // Warn when 70% of budget consumed

export function getErrorBudgetStatus(timeWindowMs = 3600000): ErrorBudgetStatus {
  const errorRate = monitor.getErrorRate(timeWindowMs)
  const remaining = Math.max(0, ERROR_BUDGET_PERCENT - errorRate)

  let status: ErrorBudgetStatus['status'] = 'good'
  if (errorRate >= ERROR_BUDGET_PERCENT) {
    status = 'exceeded'
  } else if (errorRate >= ERROR_BUDGET_PERCENT * WARNING_THRESHOLD) {
    status = 'warning'
  }

  return {
    errorRate,
    budget: ERROR_BUDGET_PERCENT,
    remaining,
    withinBudget: errorRate < ERROR_BUDGET_PERCENT,
    status,
  }
}
