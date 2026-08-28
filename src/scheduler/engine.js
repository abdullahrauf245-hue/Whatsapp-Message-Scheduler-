const cron = require('node-cron');
const { dbQuery } = require('../db/database');
const waClient = require('../whatsapp/client');
const { v4: uuidv4 } = require('uuid');

class SchedulerEngine {
  constructor() {
    this.cronTask = null;
  }

  start() {
    console.log('⏰ Starting Scheduler Engine worker...');
    // Run check every 30 seconds
    this.cronTask = cron.schedule('*/30 * * * * *', async () => {
      await this.processPendingSchedules();
    });
  }

  async processPendingSchedules() {
    try {
      const status = waClient.getStatus();
      if (status.status !== 'CONNECTED') {
        return; // Skip execution if WhatsApp isn't connected yet
      }

      const nowIso = new Date().toISOString();

      // Fetch pending schedules where scheduled_at <= current time
      const pendingSchedules = await dbQuery.all(
        `SELECT * FROM schedules WHERE status = 'pending' AND scheduled_at <= ?`,
        [nowIso]
      );

      if (!pendingSchedules || pendingSchedules.length === 0) {
        return;
      }

      console.log(`🚀 Found ${pendingSchedules.length} pending message(s) to process.`);

      for (const item of pendingSchedules) {
        await this.executeScheduleItem(item);
      }
    } catch (err) {
      console.error('❌ Scheduler process error:', err);
    }
  }

  async executeScheduleItem(item) {
    try {
      console.log(`Sending message ${item.id} to ${item.recipient}...`);
      
      // Personalization placeholders: Replace {name} if recipient is in contacts database
      let finalMessage = item.message;
      const contact = await dbQuery.get(`SELECT name FROM contacts WHERE phone = ?`, [item.recipient]);
      if (contact && contact.name) {
        finalMessage = finalMessage.replace(/\{name\}/gi, contact.name);
      } else {
        finalMessage = finalMessage.replace(/\{name\}/gi, item.recipient);
      }

      // Send via WhatsApp client
      await waClient.sendMessage(item.recipient, finalMessage, item.media_url);

      const sentTime = new Date().toISOString();

      // Update schedule status to 'sent'
      await dbQuery.run(
        `UPDATE schedules SET status = 'sent', sent_at = ? WHERE id = ?`,
        [sentTime, item.id]
      );

      // Log activity
      await dbQuery.run(
        `INSERT INTO logs (id, schedule_id, type, message, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), item.id, 'SUCCESS', `Message successfully sent to ${item.recipient}`, sentTime]
      );

      waClient.broadcast('schedule_sent', { id: item.id, recipient: item.recipient, sent_at: sentTime });

      // Handle Recurring Schedules if configured
      if (item.recurring_type && item.recurring_type !== 'none') {
        await this.handleRecurringSchedule(item);
      }

    } catch (err) {
      console.error(`❌ Failed to send schedule ${item.id}:`, err.message);
      
      const errorTime = new Date().toISOString();
      await dbQuery.run(
        `UPDATE schedules SET status = 'failed', error_message = ? WHERE id = ?`,
        [err.message, item.id]
      );

      await dbQuery.run(
        `INSERT INTO logs (id, schedule_id, type, message, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), item.id, 'ERROR', `Failed to send message to ${item.recipient}: ${err.message}`, errorTime]
      );

      waClient.broadcast('schedule_failed', { id: item.id, recipient: item.recipient, error: err.message });
    }
  }

  async handleRecurringSchedule(item) {
    try {
      const currentScheduleDate = new Date(item.scheduled_at);
      let nextScheduleDate = new Date(currentScheduleDate);

      switch (item.recurring_type) {
        case 'daily':
          nextScheduleDate.setDate(nextScheduleDate.getDate() + 1);
          break;
        case 'weekly':
          nextScheduleDate.setDate(nextScheduleDate.getDate() + 7);
          break;
        case 'monthly':
          nextScheduleDate.setMonth(nextScheduleDate.getMonth() + 1);
          break;
        default:
          return;
      }

      const nextIso = nextScheduleDate.toISOString();
      const newScheduleId = uuidv4();
      const createdAt = new Date().toISOString();

      await dbQuery.run(
        `INSERT INTO schedules 
        (id, recipient, message, scheduled_at, recurring_type, recurring_value, status, created_at, media_url) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newScheduleId,
          item.recipient,
          item.message,
          nextIso,
          item.recurring_type,
          item.recurring_value,
          'pending',
          createdAt,
          item.media_url
        ]
      );

      console.log(`🔁 Created next recurring schedule (${item.recurring_type}) for ${item.recipient} at ${nextIso}`);
      waClient.broadcast('schedule_created', { id: newScheduleId, recipient: item.recipient });
    } catch (err) {
      console.error('Error handling recurring schedule:', err);
    }
  }
}

module.exports = new SchedulerEngine();
