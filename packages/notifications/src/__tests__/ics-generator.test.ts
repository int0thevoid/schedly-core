import { describe, it, expect } from 'vitest'
import { generateICSFile } from '../utils/ics-generator.js'

const START = new Date('2026-07-15T10:00:00.000Z')
const END = new Date('2026-07-15T10:45:00.000Z')

describe('generateICSFile', () => {
  it('returns a Buffer', () => {
    const result = generateICSFile({ title: 'Psicoterapia', startDateTime: START, endDateTime: END })
    expect(result).toBeInstanceOf(Buffer)
  })

  it('contains valid VCALENDAR wrapper', () => {
    const content = generateICSFile({ title: 'Psicoterapia', startDateTime: START, endDateTime: END }).toString()
    expect(content).toContain('BEGIN:VCALENDAR')
    expect(content).toContain('END:VCALENDAR')
    expect(content).toContain('BEGIN:VEVENT')
    expect(content).toContain('END:VEVENT')
  })

  it('sets SUMMARY to the provided title', () => {
    const content = generateICSFile({ title: 'Psicoterapia', startDateTime: START, endDateTime: END }).toString()
    expect(content).toContain('SUMMARY:Psicoterapia')
  })

  it('encodes DTSTART as UTC', () => {
    const content = generateICSFile({ title: 'Test', startDateTime: START, endDateTime: END }).toString()
    expect(content).toContain('DTSTART:20260715T100000Z')
  })

  it('encodes DTEND as UTC', () => {
    const content = generateICSFile({ title: 'Test', startDateTime: START, endDateTime: END }).toString()
    expect(content).toContain('DTEND:20260715T104500Z')
  })

  it('includes LOCATION when provided', () => {
    const content = generateICSFile({
      title: 'Test',
      startDateTime: START,
      endDateTime: END,
      location: 'Buenos Aires 1088, Villa Alemana',
    }).toString()
    expect(content).toContain('LOCATION:Buenos Aires 1088')
  })

  it('omits LOCATION when not provided', () => {
    const content = generateICSFile({ title: 'Test', startDateTime: START, endDateTime: END }).toString()
    expect(content).not.toContain('LOCATION:')
  })

  it('sets STATUS:CONFIRMED', () => {
    const content = generateICSFile({ title: 'Test', startDateTime: START, endDateTime: END }).toString()
    expect(content).toContain('STATUS:CONFIRMED')
  })

  it('uses a unique UID per call', () => {
    const c1 = generateICSFile({ title: 'T', startDateTime: START, endDateTime: END }).toString()
    const c2 = generateICSFile({ title: 'T', startDateTime: START, endDateTime: END }).toString()
    const uid1 = c1.match(/UID:(.+)/)?.[1]
    const uid2 = c2.match(/UID:(.+)/)?.[1]
    expect(uid1).toBeDefined()
    expect(uid2).toBeDefined()
    expect(uid1).not.toBe(uid2)
  })
})
