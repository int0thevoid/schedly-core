import { createEvent } from 'ics'

export interface ICSParams {
  title: string
  startDateTime: Date
  endDateTime: Date
  description?: string
  location?: string
}

export function generateICSFile(params: ICSParams): Buffer {
  const toArr = (d: Date): [number, number, number, number, number] => [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ]

  const { error, value } = createEvent({
    title: params.title,
    start: toArr(params.startDateTime),
    startInputType: 'utc',
    end: toArr(params.endDateTime),
    endInputType: 'utc',
    description: params.description,
    location: params.location,
    status: 'CONFIRMED',
  })

  if (error || !value) {
    throw new Error(`Failed to generate ICS file: ${error?.message ?? 'unknown error'}`)
  }

  return Buffer.from(value)
}
