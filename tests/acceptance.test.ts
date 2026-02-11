import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/index';
import { prisma } from '../src/common/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const DEVICE_HMAC_SECRET = process.env.DEVICE_HMAC_SECRET || 'sswh-device-hmac-secret-change-in-production';

let platformAdminToken: string;
let tenantAAdminToken: string;
let tenantBAdminToken: string;
let endUserToken: string;
let tenantAId: string;
let tenantBId: string;
let siteAId: string;
let siteBId: string;
let deviceAId: string;
let deviceBId: string;
let deviceAToken: string;
let deviceBToken: string;
let commandId: string;
let alertRuleId: string;
let alertEventId: string;

function makeDeviceToken(deviceId: string): string {
  const hmac = crypto.createHmac('sha256', DEVICE_HMAC_SECRET).update(deviceId).digest('hex');
  return `${deviceId}:${hmac}`;
}

beforeAll(async () => {
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Clean database
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
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

// ─── A) TENANT + USER ─────────────────────────────────────────────────────

describe('A) Tenant + User lifecycle', () => {
  it('should register platform admin', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test.admin@sswh.io',
      password: 'testpass123',
      name: 'Test Platform Admin',
    });
    expect(res.status).toBe(201);
    platformAdminToken = res.body.token;

    // Make platform admin
    const user = await prisma.user.findUnique({ where: { email: 'test.admin@sswh.io' } });
    // Create a dummy tenant for platform admin membership
    const dummyTenant = await prisma.tenant.create({ data: { name: 'Platform', type: 'MANUFACTURER' } });
    await prisma.membership.create({
      data: { userId: user!.id, tenantId: dummyTenant.id, role: 'PLATFORM_ADMIN' },
    });
    // Refresh token
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'test.admin@sswh.io', password: 'testpass123',
    });
    platformAdminToken = loginRes.body.token;
  });

  it('should create Tenant A', async () => {
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ name: 'Test Tenant A', type: 'MANUFACTURER' });
    expect(res.status).toBe(201);
    tenantAId = res.body.id;
  });

  it('should create Tenant B', async () => {
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ name: 'Test Tenant B', type: 'RETAILER' });
    expect(res.status).toBe(201);
    tenantBId = res.body.id;
  });

  it('should invite user to Tenant A as TENANT_ADMIN', async () => {
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .set('x-tenant-id', tenantAId)
      .send({ email: 'ta.admin@test.io', name: 'TA Admin', role: 'TENANT_ADMIN', password: 'testpass123' });
    expect(res.status).toBe(201);

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'ta.admin@test.io', password: 'testpass123',
    });
    tenantAAdminToken = loginRes.body.token;
  });

  it('should invite end user to Tenant A', async () => {
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .set('x-tenant-id', tenantAId)
      .send({ email: 'enduser@test.io', name: 'End User', role: 'END_USER', password: 'testpass123' });
    expect(res.status).toBe(201);

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'enduser@test.io', password: 'testpass123',
    });
    endUserToken = loginRes.body.token;
  });

  it('should invite admin to Tenant B', async () => {
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .set('x-tenant-id', tenantBId)
      .send({ email: 'tb.admin@test.io', name: 'TB Admin', role: 'TENANT_ADMIN', password: 'testpass123' });
    expect(res.status).toBe(201);

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'tb.admin@test.io', password: 'testpass123',
    });
    tenantBAdminToken = loginRes.body.token;
  });
});

// ─── B) ONBOARDING ────────────────────────────────────────────────────────

describe('B) Device onboarding', () => {
  it('should create site in Tenant A', async () => {
    const res = await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .set('x-tenant-id', tenantAId)
      .send({ name: 'Test Site Athens', lat: 37.97, lon: 23.73, locationSource: 'MANUAL' });
    expect(res.status).toBe(201);
    siteAId = res.body.id;
  });

  it('should create site in Tenant B', async () => {
    const res = await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .set('x-tenant-id', tenantBId)
      .send({ name: 'Test Site Patras', lat: 38.24, lon: 21.73, locationSource: 'MANUAL' });
    expect(res.status).toBe(201);
    siteBId = res.body.id;
  });

  it('should register device in Tenant A', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .set('x-tenant-id', tenantAId)
      .send({ serialNumber: 'TEST-001', model: 'SSWH-200L', siteId: siteAId });
    expect(res.status).toBe(201);
    deviceAId = res.body.device.id;
    deviceAToken = res.body.deviceToken;
  });

  it('should register device in Tenant B', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .set('x-tenant-id', tenantBId)
      .send({ serialNumber: 'TEST-B01', model: 'SSWH-200L', siteId: siteBId });
    expect(res.status).toBe(201);
    deviceBId = res.body.device.id;
    deviceBToken = res.body.deviceToken;
  });

  it('should assign device to end user', async () => {
    const endUserRecord = await prisma.user.findUnique({ where: { email: 'enduser@test.io' } });
    const res = await request(app)
      .patch(`/api/devices/${deviceAId}`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .set('x-tenant-id', tenantAId)
      .send({ ownerUserId: endUserRecord!.id, status: 'ACTIVE' });
    expect(res.status).toBe(200);
  });
});

// ─── C) TELEMETRY ─────────────────────────────────────────────────────────

describe('C) Telemetry ingestion', () => {
  it('should ingest telemetry and update twin', async () => {
    const res = await request(app)
      .post('/api/ingest/telemetry')
      .set('Authorization', `Bearer ${deviceAToken}`)
      .send({
        deviceId: deviceAId,
        ts: new Date().toISOString(),
        metrics: {
          tankTempC: 58.2, ambientTempC: 12.1, humidityPct: 68,
          lux: 12500, flowLpm: 3.2, heaterOn: true, powerW: 1800,
          batteryPct: 92, rssiDbm: -88,
        },
        geo: { lat: 37.97, lon: 23.73, accuracyM: 15, source: 'EDGE_GNSS' },
      });
    expect(res.status).toBe(201);

    // Verify device lastSeenAt updated
    const device = await prisma.device.findUnique({ where: { id: deviceAId } });
    expect(device!.lastSeenAt).not.toBeNull();

    // Verify twin updated
    const twin = await prisma.deviceTwin.findUnique({ where: { deviceId: deviceAId } });
    expect(twin).not.toBeNull();
    const state = twin!.derivedState as any;
    expect(state.isOnline).toBe(true);
    expect(state.lastTankTempC).toBe(58.2);
  });
});

// ─── D) MAP & LOCATION LOCK ──────────────────────────────────────────────

describe('D) Map and location lock', () => {
  it('should update site location as end user', async () => {
    // First assign device to end user so they have access
    const res = await request(app)
      .patch(`/api/sites/${siteAId}/location`)
      .set('Authorization', `Bearer ${endUserToken}`)
      .set('x-tenant-id', tenantAId)
      .send({ lat: 37.975, lon: 23.735, source: 'MOBILE_GPS', accuracyM: 5 });
    expect(res.status).toBe(200);
  });

  it('should return device markers in bbox', async () => {
    const res = await request(app)
      .get('/api/map/devices?bbox=23.0,37.0,24.0,38.5')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .set('x-tenant-id', tenantAId);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should NOT update locked site location from EDGE geo', async () => {
    // Lock the site
    await prisma.site.update({ where: { id: siteAId }, data: { locationLock: true, lat: 37.975, lon: 23.735 } });

    // Ingest telemetry with different geo
    await request(app)
      .post('/api/ingest/telemetry')
      .set('Authorization', `Bearer ${deviceAToken}`)
      .send({
        deviceId: deviceAId,
        ts: new Date().toISOString(),
        metrics: { tankTempC: 55 },
        geo: { lat: 38.5, lon: 24.5, accuracyM: 50, source: 'EDGE_GNSS' },
      });

    // Verify site location unchanged
    const site = await prisma.site.findUnique({ where: { id: siteAId } });
    expect(site!.lat).toBe(37.975);
    expect(site!.lon).toBe(23.735);
  });
});

// ─── E) COMMANDS ──────────────────────────────────────────────────────────

describe('E) Command lifecycle', () => {
  it('should create REMOTE_BOOST_SET command', async () => {
    // Create entitlement first
    await prisma.entitlement.create({
      data: { tenantId: tenantAId, scope: 'TENANT', key: 'BASIC_REMOTE_BOOST', enabled: true },
    });

    const res = await request(app)
      .post(`/api/devices/${deviceAId}/commands`)
      .set('Authorization', `Bearer ${endUserToken}`)
      .set('x-tenant-id', tenantAId)
      .send({ type: 'REMOTE_BOOST_SET', payload: { enabled: true } });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('QUEUED');
    commandId = res.body.id;
  });

  it('should poll pending commands (device-auth)', async () => {
    const res = await request(app)
      .get(`/api/devices/${deviceAId}/commands/pending`)
      .set('Authorization', `Bearer ${deviceAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].id).toBe(commandId);
  });

  it('should ACK command (device-auth)', async () => {
    const res = await request(app)
      .post(`/api/devices/${deviceAId}/commands/${commandId}/ack`)
      .set('Authorization', `Bearer ${deviceAToken}`)
      .send({ status: 'ACKED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACKED');
    expect(res.body.ackAt).not.toBeNull();
  });
});

// ─── F) ALERTS ────────────────────────────────────────────────────────────

describe('F) Alert lifecycle', () => {
  it('should create alert rule', async () => {
    const res = await request(app)
      .post('/api/alerts/rules')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .set('x-tenant-id', tenantAId)
      .send({
        name: 'Test No Telemetry',
        type: 'NO_TELEMETRY',
        params: { thresholdMinutes: 1 },
        severity: 'WARNING',
      });
    expect(res.status).toBe(201);
    alertRuleId = res.body.id;
  });

  it('should create alert event (simulate)', async () => {
    // Manually create an alert event for testing
    const event = await prisma.alertEvent.create({
      data: {
        tenantId: tenantAId,
        deviceId: deviceAId,
        ruleId: alertRuleId,
        severity: 'WARNING',
        status: 'OPEN',
        details: { test: true },
        dedupeKey: `test-dedup-${Date.now()}`,
      },
    });
    alertEventId = event.id;

    // Create notification event
    const channel = await prisma.notificationChannel.create({
      data: { tenantId: tenantAId, type: 'WEBHOOK', config: { url: 'https://test.hook' }, enabled: true },
    });
    await prisma.notificationEvent.create({
      data: {
        tenantId: tenantAId,
        channelId: channel.id,
        alertEventId: event.id,
        status: 'QUEUED',
        payload: { test: true },
      },
    });
  });

  it('should list alerts', async () => {
    const res = await request(app)
      .get('/api/alerts?status=OPEN')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .set('x-tenant-id', tenantAId);
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThan(0);
  });

  it('should ACK alert', async () => {
    const res = await request(app)
      .post(`/api/alerts/${alertEventId}/ack`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .set('x-tenant-id', tenantAId);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACKNOWLEDGED');
  });

  it('should CLOSE alert', async () => {
    const res = await request(app)
      .post(`/api/alerts/${alertEventId}/close`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .set('x-tenant-id', tenantAId);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED');
  });

  it('should deduplicate alerts (no duplicate for same device+rule)', async () => {
    const dedupeKey = `dedup-test-${deviceAId}:${alertRuleId}`;
    await prisma.alertEvent.create({
      data: {
        tenantId: tenantAId, deviceId: deviceAId, ruleId: alertRuleId,
        severity: 'WARNING', status: 'OPEN', dedupeKey,
      },
    });

    // Attempt duplicate
    try {
      await prisma.alertEvent.create({
        data: {
          tenantId: tenantAId, deviceId: deviceAId, ruleId: alertRuleId,
          severity: 'WARNING', status: 'OPEN', dedupeKey,
        },
      });
      expect(true).toBe(false); // Should not reach here
    } catch (err: any) {
      expect(err.code).toBe('P2002'); // Unique constraint violation
    }
  });
});

// ─── G) OTA & SIM ────────────────────────────────────────────────────────

describe('G) OTA and SIM management', () => {
  it('should register firmware package', async () => {
    const res = await request(app)
      .post('/api/ota/firmware')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        version: '2.0.0-test',
        fileUrl: 'https://firmware.test/v2.0.0.bin',
        checksum: 'sha256:test123',
        releaseNotes: 'Test firmware',
      });
    expect(res.status).toBe(201);
  });

  it('should schedule OTA job', async () => {
    const firmware = await prisma.firmwarePackage.findFirst({ where: { version: '2.0.0-test' } });
    const res = await request(app)
      .post('/api/ota/jobs')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .set('x-tenant-id', tenantAId)
      .send({
        targetType: 'DEVICE',
        deviceId: deviceAId,
        firmwarePackageId: firmware!.id,
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SCHEDULED');
  });

  it('should create SIM and request action', async () => {
    await prisma.simInfo.create({
      data: { iccid: 'TEST-SIM-001', carrier: 'Test Carrier', status: 'INACTIVE' },
    });

    const res = await request(app)
      .post('/api/sim/TEST-SIM-001/actions')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ action: 'ACTIVATE' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED'); // Stub provider always succeeds
  });
});

// ─── H) TENANT ISOLATION ─────────────────────────────────────────────────

describe('H) Tenant isolation', () => {
  it('Tenant B admin cannot access Tenant A devices', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .set('x-tenant-id', tenantAId);
    expect(res.status).toBe(403);
  });

  it('Tenant B admin cannot access Tenant A sites', async () => {
    const res = await request(app)
      .get('/api/sites')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .set('x-tenant-id', tenantAId);
    expect(res.status).toBe(403);
  });

  it('Tenant B admin cannot access Tenant A alerts', async () => {
    const res = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .set('x-tenant-id', tenantAId);
    expect(res.status).toBe(403);
  });

  it('Tenant B admin cannot access Tenant A map markers', async () => {
    const res = await request(app)
      .get('/api/map/devices?bbox=23.0,37.0,24.0,38.5')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .set('x-tenant-id', tenantAId);
    expect(res.status).toBe(403);
  });

  it('Tenant A devices are not visible in Tenant B queries', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .set('x-tenant-id', tenantBId);
    expect(res.status).toBe(200);
    const deviceIds = res.body.devices.map((d: any) => d.id);
    expect(deviceIds).not.toContain(deviceAId);
  });
});
