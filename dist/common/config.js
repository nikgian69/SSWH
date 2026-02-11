"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || 'change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    deviceHmacSecret: process.env.DEVICE_HMAC_SECRET || 'change-me',
    databaseUrl: process.env.DATABASE_URL || '',
    logLevel: process.env.LOG_LEVEL || 'info',
    alertEvalIntervalMinutes: parseInt(process.env.ALERT_EVAL_INTERVAL_MINUTES || '5', 10),
    rollupCron: process.env.ROLLUP_CRON || '0 2 * * *',
    weatherCron: process.env.WEATHER_CRON || '0 6 * * *',
    noTelemetryThresholdMinutes: parseInt(process.env.NO_TELEMETRY_THRESHOLD_MINUTES || '30', 10),
    overTempThresholdC: parseFloat(process.env.OVER_TEMP_THRESHOLD_C || '85'),
    sensorOutOfRangeRepeatCount: parseInt(process.env.SENSOR_OUT_OF_RANGE_REPEAT_COUNT || '3', 10),
};
//# sourceMappingURL=config.js.map