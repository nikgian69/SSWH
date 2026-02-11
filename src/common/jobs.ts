import { CronJob } from 'cron';
import { config } from './config';
import { evaluateAlerts } from '../modules/alerts/router';
import { computeDailyRollups } from '../modules/analytics/router';
import { processNotificationQueue } from '../modules/notifications/router';
import { fetchWeatherForAllTenants } from '../modules/integrations/router';

let alertJob: CronJob;
let rollupJob: CronJob;
let notificationJob: CronJob;
let weatherJob: CronJob;

export function startBackgroundJobs(): void {
  console.log('[JOBS] Starting background job scheduler...');

  // Alert evaluation: every N minutes
  alertJob = new CronJob(`0 */${config.alertEvalIntervalMinutes} * * * *`, async () => {
    try {
      const count = await evaluateAlerts();
      if (count > 0) console.log(`[JOBS] Alert evaluation created ${count} new alerts`);
    } catch (err) {
      console.error('[JOBS] Alert evaluation failed:', err);
    }
  });
  alertJob.start();
  console.log(`[JOBS] Alert evaluation scheduled every ${config.alertEvalIntervalMinutes} minutes`);

  // Daily rollups: default 2 AM
  rollupJob = new CronJob('0 0 2 * * *', async () => {
    try {
      const count = await computeDailyRollups();
      console.log(`[JOBS] Daily rollups computed for ${count} devices`);
    } catch (err) {
      console.error('[JOBS] Daily rollup failed:', err);
    }
  });
  rollupJob.start();
  console.log('[JOBS] Daily rollup scheduled at 2:00 AM');

  // Notification processing: every minute
  notificationJob = new CronJob('0 * * * * *', async () => {
    try {
      const count = await processNotificationQueue();
      if (count > 0) console.log(`[JOBS] Processed ${count} notifications`);
    } catch (err) {
      console.error('[JOBS] Notification processing failed:', err);
    }
  });
  notificationJob.start();
  console.log('[JOBS] Notification processing scheduled every minute');

  // Weather fetch: default 6 AM
  weatherJob = new CronJob('0 0 6 * * *', async () => {
    try {
      const count = await fetchWeatherForAllTenants();
      console.log(`[JOBS] Weather data fetched for ${count} sites`);
    } catch (err) {
      console.error('[JOBS] Weather fetch failed:', err);
    }
  });
  weatherJob.start();
  console.log('[JOBS] Weather fetch scheduled at 6:00 AM');
}

export function stopBackgroundJobs(): void {
  alertJob?.stop();
  rollupJob?.stop();
  notificationJob?.stop();
  weatherJob?.stop();
  console.log('[JOBS] Background jobs stopped');
}
