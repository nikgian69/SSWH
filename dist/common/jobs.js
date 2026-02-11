"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBackgroundJobs = startBackgroundJobs;
exports.stopBackgroundJobs = stopBackgroundJobs;
const cron_1 = require("cron");
const config_1 = require("./config");
const router_1 = require("../modules/alerts/router");
const router_2 = require("../modules/analytics/router");
const router_3 = require("../modules/notifications/router");
const router_4 = require("../modules/integrations/router");
let alertJob;
let rollupJob;
let notificationJob;
let weatherJob;
function startBackgroundJobs() {
    console.log('[JOBS] Starting background job scheduler...');
    // Alert evaluation: every N minutes
    alertJob = new cron_1.CronJob(`0 */${config_1.config.alertEvalIntervalMinutes} * * * *`, async () => {
        try {
            const count = await (0, router_1.evaluateAlerts)();
            if (count > 0)
                console.log(`[JOBS] Alert evaluation created ${count} new alerts`);
        }
        catch (err) {
            console.error('[JOBS] Alert evaluation failed:', err);
        }
    });
    alertJob.start();
    console.log(`[JOBS] Alert evaluation scheduled every ${config_1.config.alertEvalIntervalMinutes} minutes`);
    // Daily rollups: default 2 AM
    rollupJob = new cron_1.CronJob('0 0 2 * * *', async () => {
        try {
            const count = await (0, router_2.computeDailyRollups)();
            console.log(`[JOBS] Daily rollups computed for ${count} devices`);
        }
        catch (err) {
            console.error('[JOBS] Daily rollup failed:', err);
        }
    });
    rollupJob.start();
    console.log('[JOBS] Daily rollup scheduled at 2:00 AM');
    // Notification processing: every minute
    notificationJob = new cron_1.CronJob('0 * * * * *', async () => {
        try {
            const count = await (0, router_3.processNotificationQueue)();
            if (count > 0)
                console.log(`[JOBS] Processed ${count} notifications`);
        }
        catch (err) {
            console.error('[JOBS] Notification processing failed:', err);
        }
    });
    notificationJob.start();
    console.log('[JOBS] Notification processing scheduled every minute');
    // Weather fetch: default 6 AM
    weatherJob = new cron_1.CronJob('0 0 6 * * *', async () => {
        try {
            const count = await (0, router_4.fetchWeatherForAllTenants)();
            console.log(`[JOBS] Weather data fetched for ${count} sites`);
        }
        catch (err) {
            console.error('[JOBS] Weather fetch failed:', err);
        }
    });
    weatherJob.start();
    console.log('[JOBS] Weather fetch scheduled at 6:00 AM');
}
function stopBackgroundJobs() {
    alertJob?.stop();
    rollupJob?.stop();
    notificationJob?.stop();
    weatherJob?.stop();
    console.log('[JOBS] Background jobs stopped');
}
//# sourceMappingURL=jobs.js.map