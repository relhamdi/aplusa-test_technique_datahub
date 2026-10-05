import type { ColumnType } from '../types/api'

export const INTEGER_RE = /^[+-]?\d+$/
// Same lexical rules as the backend detection: a decimal comma is accepted.
export const FLOAT_RE = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/

export function isNumberText(type: ColumnType, raw: string): boolean {
  return (type === 'integer' ? INTEGER_RE : FLOAT_RE).test(raw)
}