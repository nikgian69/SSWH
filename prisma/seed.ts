import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();
const DEVICE_HMAC_SECRET = process.env.DEVICE_HMAC_SECRET || 'sswh-device-hmac-secret-change-in-production';

function deviceToken(deviceId: string): string {
  const hmac = crypto.createHmac('sha256', DEVICE_HMAC_SECRET).update(deviceId).digest('hex');
  return `${deviceId}:${hmac}`;
}

async function main() {
  console.log('🌱 Seeding SSWH database...\n');

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.notificationEvent.deleteMany();
  await prisma.notificationChannel.deleteMany();
  await prisma.alertEvent.deleteMany();
  await prisma.alertRule.deleteMany();
  await prisma.dailyRollup.deleteMany();
  await prisma.weatherData.deleteMany();
  await prisma.entitlement.deleteMany();
  await prisma.simAction.deleteMany();
  await prisma.otaJob.deleteMany();
  await prisma.firmwarePackage.deleteMany();
  await prisma.command.deleteMany();
  await prisma.telemetry.deleteMany();
  await prisma.deviceTwin.deleteMany();
  await prisma.deviceSecret.deleteMany();
  await prisma.device.deleteMany();
  await prisma.site.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.simInfo.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  // ─── USERS ──────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('password123', 12);

  const platformAdmin = await prisma.user.create({
    data: { email: 'admin@sswh.io', passwordHash, name: 'Platform Admin', status: 'ACTIVE' },
  });
  const tenantAdmin = await prisma.user.create({
    data: { email: 'tenant.admin@sswh.io', passwordHash, name: 'Tenant Admin', status: 'ACTIVE' },
  });
  const installer = await prisma.user.create({
    data: { email: 'installer@sswh.io', passwordHash, name: 'Demo Installer', status: 'ACTIVE' },
  });
  const endUser = await prisma.user.create({
    data: { email: 'user@sswh.io', passwordHash, name: 'Demo End User', status: 'ACTIVE' },
  });
  const tenantBAdmin = await prisma.user.create({
    data: { email: 'tenantb.admin@sswh.io', passwordHash, name: 'Tenant B Admin', status: 'ACTIVE' },
  });

  console.log('✅ Users created');

  // ─── TENANTS ────────────────────────────────────────────────────────────
  const tenantA = await prisma.tenant.create({
    data: { name: 'SolarHeat Co.', type: 'MANUFACTURER', status: 'ACTIVE' },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: 'GreenEnergy Retail', type: 'RETAILER', status: 'ACTIVE' },
  });

  console.log('✅ Tenants created');

  // ─── MEMBERSHIPS ────────────────────────────────────────────────────────
  await prisma.membership.createMany({
    data: [
      { userId: platformAdmin.id, tenantId: tenantA.id, role: 'PLATFORM_ADMIN' },
      { userId: tenantAdmin.id, tenantId: tenantA.id, role: 'TENANT_ADMIN' },
      { userId: installer.id, tenantId: tenantA.id, role: 'INSTALLER' },
      { userId: endUser.id, tenantId: tenantA.id, role: 'END_USER' },
      { userId: tenantBAdmin.id, tenantId: tenantB.id, role: 'TENANT_ADMIN' },
    ],
  });

  console.log('✅ Memberships created');

  // ─── SITES ──────────────────────────────────────────────────────────────
  const siteAthens = await prisma.site.create({
    data: {
      tenantId: tenantA.id,
      name: 'Athens Residence',
      addressLine1: '42 Ermou Street',
      city: 'Athens',
      country: 'GR',
      postalCode: '10563',
      lat: 37.9755,
      lon: 23.7348,
      locationSource: 'MANUAL',
      locationAccuracyM: 10,
      locationLock: false,
      locationUpdatedAt: new Date(),
      locationUpdatedByUserId: tenantAdmin.id,
    },
  });

  const siteThessaloniki = await prisma.site.create({
    data: {
      tenantId: tenantA.id,
      name: 'Thessaloniki Office',
      addressLine1: '15 Tsimiski Street',
      city: 'Thessaloniki',
      country: 'GR',
      postalCode: '54624',
      lat: 40.6401,
      lon: 22.9444,
      locationSource: 'MOBILE_GPS',
      locationAccuracyM: 5,
      locationLock: true,
      locationUpdatedAt: new Date(),
      locationUpdatedByUserId: installer.id,
    },
  });

  const siteTenantB = await prisma.site.create({
    data: {
      tenantId: tenantB.id,
      name: 'Patras Showroom',
      addressLine1: '8 Maizonos Street',
      city: 'Patras',
      country: 'GR',
      lat: 38.2466,
      lon: 21.7346,
      locationSource: 'MANUAL',
    },
  });

  console.log('✅ Sites created');

  // ─── SIM CARDS ──────────────────────────────────────────────────────────
  const sim1 = await prisma.simInfo.create({
    data: { iccid: '8930000000000000001', carrier: 'Cosmote', planName: 'IoT Basic', status: 'ACTIVE', dataUsageMb: 45.2, msisdn: '+306900000001' },
  });
  const sim2 = await prisma.simInfo.create({
    data: { iccid: '8930000000000000002', carrier: 'Vodafone', planName: 'IoT Pro', status: 'ACTIVE', dataUsageMb: 120.8, msisdn: '+306900000002' },
  });
  const sim3 = await prisma.simInfo.create({
    data: { iccid: '8930000000000000003', carrier: 'Cosmote', planName: 'IoT Basic', status: 'SUSPENDED', dataUsageMb: 5.1, msisdn: '+306900000003' },
  });

  console.log('✅ SIM cards created');

  // ─── DEVICES ────────────────────────────────────────────────────────────
  const device1 = await prisma.device.create({
    data: {
      tenantId: tenantA.id,
      siteId: siteAthens.id,
      ownerUserId: endUser.id,
      model: 'SSWH-200L',
      serialNumber: 'SSWH-2024-001',
      name: 'Rooftop Heater Athens',
      status: 'ACTIVE',
      firmwareVersion: '1.2.0',
      simIccid: sim1.iccid,
      lastSeenAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
      deviceLat: 37.9755,
      deviceLon: 23.7348,
      deviceLocationSource: 'EDGE_GNSS',
      deviceLocationAccuracyM: 15,
    },
  });

  const device2 = await prisma.device.create({
    data: {
      tenantId: tenantA.id,
      siteId: siteThessaloniki.id,
      model: 'SSWH-300L',
      serialNumber: 'SSWH-2024-002',
      name: 'Office Heater Thessaloniki',
      status: 'INSTALLED',
      firmwareVersion: '1.1.0',
      simIccid: sim2.iccid,
      lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      deviceLat: 40.6401,
      deviceLon: 22.9444,
      deviceLocationSource: 'EDGE_GNSS',
    },
  });

  const device3 = await prisma.device.create({
    data: {
      tenantId: tenantA.id,
      siteId: siteAthens.id,
      model: 'SSWH-150L',
      serialNumber: 'SSWH-2024-003',
      name: 'Guest House Heater',
      status: 'SUSPENDED',
      firmwareVersion: '1.0.0',
      simIccid: sim3.iccid,
    },
  });

  // Tenant B device (for isolation testing)
  const deviceB = await prisma.device.create({
    data: {
      tenantId: tenantB.id,
      siteId: siteTenantB.id,
      model: 'SSWH-200L',
      serialNumber: 'SSWH-2024-B01',
      name: 'Showroom Demo Unit',
      status: 'ACTIVE',
      firmwareVersion: '1.2.0',
      lastSeenAt: new Date(),
      deviceLat: 38.2466,
      deviceLon: 21.7346,
    },
  });

  console.log('✅ Devices created');

  // ─── DEVICE SECRETS ─────────────────────────────────────────────────────
  for (const device of [device1, device2, device3, deviceB]) {
    const hmac = crypto.createHmac('sha256', DEVICE_HMAC_SECRET).update(device.id).digest('hex');
    await prisma.deviceSecret.create({
      data: { deviceId: device.id, secretHash: hmac },
    });
  }

  console.log('✅ Device secrets created');

  // ─── DEVICE TWINS ───────────────────────────────────────────────────────
  await prisma.deviceTwin.create({
    data: {
      deviceId: device1.id,
      lastTs: new Date(Date.now() - 5 * 60 * 1000),
      derivedState: {
        isOnline: true, healthScore: 85, lastTankTempC: 58.2, lastAmbientTempC: 12.1,
        heaterOn: true, lastPowerW: 1800, lastRssi: -88, last_batteryPct: 92,
      },
    },
  });
  await prisma.deviceTwin.create({
    data: {
      deviceId: device2.id,
      lastTs: new Date(Date.now() - 2 * 60 * 60 * 1000),
      derivedState: {
        isOnline: false, healthScore: 60, lastTankTempC: 42.5, lastAmbientTempC: 8.3,
        heaterOn: false, lastPowerW: 0, lastRssi: -102,
      },
    },
  });
  await prisma.deviceTwin.create({
    data: { deviceId: device3.id, derivedState: { isOnline: false, healthScore: 0 } },
  });
  await prisma.deviceTwin.create({
    data: {
      deviceId: deviceB.id,
      lastTs: new Date(),
      derivedState: { isOnline: true, healthScore: 95, lastTankTempC: 55.0 },
    },
  });

  console.log('✅ Device twins created');

  // ─── SAMPLE TELEMETRY ───────────────────────────────────────────────────
  const now = Date.now();
  for (let i = 0; i < 24; i++) {
    const ts = new Date(now - (24 - i) * 60 * 60 * 1000);
    await prisma.telemetry.create({
      data: {
        deviceId: device1.id,
        ts,
        metrics: {
          tankTempC: 40 + Math.random() * 25,
          ambientTempC: 8 + Math.random() * 10,
          humidityPct: 50 + Math.random() * 30,
          lux: 1000 + Math.random() * 15000,
          flowLpm: Math.random() > 0.7 ? 2 + Math.random() * 3 : 0,
          heaterOn: Math.random() > 0.4,
          powerW: Math.random() > 0.4 ? 1500 + Math.random() * 500 : 0,
          batteryPct: 85 + Math.random() * 15,
          rssiDbm: -70 - Math.random() * 30,
        },
        geo: { lat: 37.9755, lon: 23.7348, accuracyM: 15, source: 'EDGE_GNSS' },
      },
    });
  }

  console.log('✅ Sample telemetry created (24 readings for device 1)');

  // ─── ALERT RULES ────────────────────────────────────────────────────────
  const noTelemetryRule = await prisma.alertRule.create({
    data: {
      tenantId: tenantA.id,
      name: 'No Telemetry Alert',
      type: 'NO_TELEMETRY',
      params: { thresholdMinutes: 30 },
      severity: 'WARNING',
      enabled: true,
    },
  });

  await prisma.alertRule.create({
    data: {
      tenantId: tenantA.id,
      name: 'Over Temperature Alert',
      type: 'OVER_TEMP',
      params: { thresholdC: 85 },
      severity: 'CRITICAL',
      enabled: true,
    },
  });

  await prisma.alertRule.create({
    data: {
      tenantId: tenantA.id,
      name: 'Possible Leak Detection',
      type: 'POSSIBLE_LEAK',
      params: { lookbackMinutes: 60 },
      severity: 'CRITICAL',
      enabled: true,
    },
  });

  console.log('✅ Alert rules created');

  // ─── OPEN ALERT EVENT ───────────────────────────────────────────────────
  const alertEvent = await prisma.alertEvent.create({
    data: {
      tenantId: tenantA.id,
      deviceId: device2.id,
      ruleId: noTelemetryRule.id,
      severity: 'WARNING',
      status: 'OPEN',
      details: { lastSeenAt: device2.lastSeenAt, thresholdMinutes: 30 },
      dedupeKey: `${device2.id}:${noTelemetryRule.id}`,
    },
  });

  console.log('✅ Open alert event created');

  // ─── NOTIFICATION CHANNELS ──────────────────────────────────────────────
  const webhookChannel = await prisma.notificationChannel.create({
    data: {
      tenantId: tenantA.id,
      type: 'WEBHOOK',
      config: { url: 'https://hooks.example.com/sswh-alerts', secret: 'webhook-secret' },
      enabled: true,
    },
  });

  await prisma.notificationChannel.create({
    data: {
      tenantId: tenantA.id,
      type: 'EMAIL',
      config: { to: 'alerts@sswh.io', from: 'noreply@sswh.io' },
      enabled: true,
    },
  });

  // Create notification event for the open alert
  await prisma.notificationEvent.create({
    data: {
      tenantId: tenantA.id,
      channelId: webhookChannel.id,
      alertEventId: alertEvent.id,
      status: 'QUEUED',
      payload: { alertEventId: alertEvent.id, severity: 'WARNING', type: 'NO_TELEMETRY' },
    },
  });

  console.log('✅ Notification channels and events created');

  // ─── FIRMWARE & OTA ─────────────────────────────────────────────────────
  const firmware = await prisma.firmwarePackage.create({
    data: {
      version: '1.3.0',
      fileUrl: 'https://firmware.sswh.io/v1.3.0/sswh-edge.bin',
      checksum: 'sha256:abc123def456',
      releaseNotes: 'Bug fixes, improved temperature sensor calibration, reduced power consumption.',
    },
  });

  const otaJob = await prisma.otaJob.create({
    data: {
      tenantId: tenantA.id,
      targetType: 'DEVICE',
      deviceId: device2.id,
      firmwarePackageId: firmware.id,
      status: 'SCHEDULED',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdByUserId: tenantAdmin.id,
    },
  });

  console.log('✅ Firmware package and OTA job created');

  // ─── COMMANDS ───────────────────────────────────────────────────────────
  await prisma.command.create({
    data: {
      deviceId: device1.id,
      type: 'REMOTE_BOOST_SET',
      payload: { enabled: true },
      status: 'ACKED',
      requestedByUserId: endUser.id,
      requestedAt: new Date(Date.now() - 60 * 60 * 1000),
      deliveredAt: new Date(Date.now() - 59 * 60 * 1000),
      ackAt: new Date(Date.now() - 58 * 60 * 1000),
    },
  });

  console.log('✅ Sample command created');

  // ─── DAILY ROLLUPS ──────────────────────────────────────────────────────
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  await prisma.dailyRollup.create({
    data: {
      tenantId: tenantA.id,
      deviceId: device1.id,
      dayDate: yesterday,
      energyKwhDay: 8.5,
      hotWaterUsageLitersDay: 120,
      heaterOnMinutesDay: 340,
      tankTempMinC: 35.2,
      tankTempMaxC: 68.1,
      ambientTempAvgC: 14.3,
    },
  });

  console.log('✅ Daily rollup created');

  // ─── ENTITLEMENTS ───────────────────────────────────────────────────────
  await prisma.entitlement.create({
    data: {
      tenantId: tenantA.id,
      scope: 'TENANT',
      key: 'BASIC_REMOTE_BOOST',
      enabled: true,
    },
  });
  await prisma.entitlement.create({
    data: {
      tenantId: tenantA.id,
      scope: 'TENANT',
      key: 'SMART_HOME_INTEGRATION',
      enabled: false,
    },
  });

  console.log('✅ Entitlements created');

  // ─── PRINT SUMMARY ─────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('🌞 SSWH Seed Data Summary');
  console.log('═'.repeat(60));
  console.log(`\nUsers (password: password123 for all):`);
  console.log(`  Platform Admin: admin@sswh.io`);
  console.log(`  Tenant A Admin: tenant.admin@sswh.io`);
  console.log(`  Installer:      installer@sswh.io`);
  console.log(`  End User:       user@sswh.io`);
  console.log(`  Tenant B Admin: tenantb.admin@sswh.io`);
  console.log(`\nTenants:`);
  console.log(`  Tenant A: ${tenantA.name} (${tenantA.id})`);
  console.log(`  Tenant B: ${tenantB.name} (${tenantB.id})`);
  console.log(`\nSites: Athens, Thessaloniki (Tenant A), Patras (Tenant B)`);
  console.log(`\nDevices:`);
  console.log(`  Device 1 (ACTIVE):    ${device1.serialNumber} → ${device1.id}`);
  console.log(`  Device 2 (INSTALLED): ${device2.serialNumber} → ${device2.id}`);
  console.log(`  Device 3 (SUSPENDED): ${device3.serialNumber} → ${device3.id}`);
  console.log(`  Device B (ACTIVE):    ${deviceB.serialNumber} → ${deviceB.id}`);
  console.log(`\nDevice Tokens (for telemetry ingestion):`);
  console.log(`  Device 1: ${deviceToken(device1.id)}`);
  console.log(`  Device 2: ${deviceToken(device2.id)}`);
  console.log(`\nOTA Job: ${otaJob.id} (SCHEDULED for device 2)`);
  console.log(`Open Alert: ${alertEvent.id} (NO_TELEMETRY on device 2)`);
  console.log('═'.repeat(60) + '\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
