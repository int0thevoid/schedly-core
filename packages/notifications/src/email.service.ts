import { Resend } from 'resend'
import { appointmentConfirmationTemplate, type AppointmentConfirmationData } from './templates/appointment-confirmation.js'
import { appointmentReminderTemplate, type AppointmentReminderData } from './templates/appointment-reminder.js'
import { professionalNewBookingTemplate, type ProfessionalNewBookingData } from './templates/professional-new-booking.js'
import { appointmentModifiedTemplate, type AppointmentModifiedData } from './templates/appointment-modified.js'
import { appointmentCancelledByPatientTemplate, type AppointmentCancelledByPatientData } from './templates/appointment-cancelled-by-patient.js'
import { professionalCancellationNoticeTemplate, type ProfessionalCancellationNoticeData } from './templates/professional-cancellation-notice.js'
import { reviewRequestTemplate, type ReviewRequestData } from './templates/review-request.js'
import { dailyDigestTemplate, type DailyDigestData } from './templates/daily-digest.js'
import { generateICSFile } from './utils/ics-generator.js'

type Attachment = { filename: string; content: Buffer }

export class EmailService {
  private resend: Resend
  private from: string

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY)
    this.from = `${process.env.RESEND_FROM_NAME} <${process.env.RESEND_FROM_EMAIL}>`
  }

  async sendAppointmentConfirmation(to: string, data: AppointmentConfirmationData): Promise<void> {
    const { subject, html } = appointmentConfirmationTemplate(data)
    const ics = generateICSFile({
      title: data.serviceName,
      startDateTime: data.startDateTime,
      endDateTime: data.endDateTime,
      location: data.modality === 'presential' ? data.address : undefined,
    })
    await this.send(to, subject, html, [{ filename: 'cita.ics', content: ics }])
  }

  async sendAppointmentReminder(to: string, data: AppointmentReminderData): Promise<void> {
    const { subject, html } = appointmentReminderTemplate(data)
    const ics = generateICSFile({
      title: data.serviceName,
      startDateTime: data.startDateTime,
      endDateTime: data.endDateTime,
      location: data.modality === 'presential' ? data.address : undefined,
    })
    await this.send(to, subject, html, [{ filename: 'cita.ics', content: ics }])
  }

  async sendNewBookingToProfessional(to: string, data: ProfessionalNewBookingData): Promise<void> {
    const { subject, html } = professionalNewBookingTemplate(data)
    await this.send(to, subject, html)
  }

  async sendAppointmentModified(to: string, data: AppointmentModifiedData): Promise<void> {
    const { subject, html } = appointmentModifiedTemplate(data)
    const ics = generateICSFile({
      title: data.newServiceName,
      startDateTime: data.newStartDateTime,
      endDateTime: data.newEndDateTime,
      location: data.modality === 'presential' ? data.address : undefined,
    })
    await this.send(to, subject, html, [{ filename: 'cita.ics', content: ics }])
  }

  async sendAppointmentCancelledByPatient(to: string, data: AppointmentCancelledByPatientData): Promise<void> {
    const { subject, html } = appointmentCancelledByPatientTemplate(data)
    await this.send(to, subject, html)
  }

  async sendProfessionalCancellationNotice(to: string, data: ProfessionalCancellationNoticeData): Promise<void> {
    const { subject, html } = professionalCancellationNoticeTemplate(data)
    await this.send(to, subject, html)
  }

  async sendReviewRequest(to: string, data: ReviewRequestData): Promise<void> {
    const { subject, html } = reviewRequestTemplate(data)
    await this.send(to, subject, html)
  }

  async sendDailyDigest(to: string, data: DailyDigestData): Promise<void> {
    const { subject, html } = dailyDigestTemplate(data)
    await this.send(to, subject, html)
  }

  private async send(to: string, subject: string, html: string, attachments?: Attachment[]): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
      ...(attachments ? { attachments } : {}),
    })

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`)
    }
  }
}
