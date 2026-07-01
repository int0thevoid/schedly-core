import { Resend } from 'resend'
import { appointmentConfirmationTemplate, type AppointmentConfirmationData } from './templates/appointment-confirmation.js'
import { appointmentReminderTemplate, type AppointmentReminderData } from './templates/appointment-reminder.js'
import { professionalNewBookingTemplate, type ProfessionalNewBookingData } from './templates/professional-new-booking.js'
import { appointmentModifiedTemplate, type AppointmentModifiedData } from './templates/appointment-modified.js'
import { appointmentCancelledByPatientTemplate, type AppointmentCancelledByPatientData } from './templates/appointment-cancelled-by-patient.js'
import { professionalCancellationNoticeTemplate, type ProfessionalCancellationNoticeData } from './templates/professional-cancellation-notice.js'
import { reviewRequestTemplate, type ReviewRequestData } from './templates/review-request.js'
import { dailyDigestTemplate, type DailyDigestData } from './templates/daily-digest.js'

export class EmailService {
  private resend: Resend
  private from: string

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY)
    this.from = `${process.env.RESEND_FROM_NAME} <${process.env.RESEND_FROM_EMAIL}>`
  }

  async sendAppointmentConfirmation(to: string, data: AppointmentConfirmationData): Promise<void> {
    const { subject, html } = appointmentConfirmationTemplate(data)
    await this.send(to, subject, html)
  }

  async sendAppointmentReminder(to: string, data: AppointmentReminderData): Promise<void> {
    const { subject, html } = appointmentReminderTemplate(data)
    await this.send(to, subject, html)
  }

  async sendNewBookingToProfessional(to: string, data: ProfessionalNewBookingData): Promise<void> {
    const { subject, html } = professionalNewBookingTemplate(data)
    await this.send(to, subject, html)
  }

  async sendAppointmentModified(to: string, data: AppointmentModifiedData): Promise<void> {
    const { subject, html } = appointmentModifiedTemplate(data)
    await this.send(to, subject, html)
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

  private async send(to: string, subject: string, html: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    })

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`)
    }
  }
}
