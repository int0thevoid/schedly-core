export function generateGoogleCalendarUrl(params: {
  title: string
  startDateTime: Date
  endDateTime: Date
  description: string
  location?: string
}): string {
  const format = (d: Date): string =>
    d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const search = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    dates: `${format(params.startDateTime)}/${format(params.endDateTime)}`,
    details: params.description,
    ...(params.location ? { location: params.location } : {}),
  })

  return `https://calendar.google.com/calendar/render?${search.toString()}`
}
