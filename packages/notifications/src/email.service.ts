import { Resend } from 'resend'
import { appointmentConfirmationTemplate, type AppointmentConfirmationData } from './templates/appointment-confirmation.js'
import { appointmentReminderTemplate, type AppointmentReminderData } from './templates/appointment-reminder.js'
import { paymentReminderTemplate, type PaymentReminderData } from './templates/payment-reminder.js'
import { reviewRequestTemplate, type ReviewRequestData } from './templates/review-request.js'
import { dailyDigestTemplate, type DailyDigestData } from './templates/daily-digest.js'
import { appointmentCancelledTemplate, type AppointmentCancelledData } from './templates/appointment-cancelled.js'

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

  async sendPaymentReminder(to: string, data: PaymentReminderData): Promise<void> {
    const { subject, html } = paymentReminderTemplate(data)
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

  async sendAppointmentCancelled(to: string, data: AppointmentCancelledData): Promise<void> {
    const { subject, html } = appointmentCancelledTemplate(data)
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
