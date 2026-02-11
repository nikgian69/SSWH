-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('MANUFACTURER', 'RETAILER', 'INSTALLER', 'PROPERTY_MANAGER');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('PLATFORM_ADMIN', 'TENANT_ADMIN', 'INSTALLER', 'SUPPORT_AGENT', 'END_USER');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('MOBILE_GPS', 'EDGE_GNSS', 'EDGE_CELL', 'MANUAL');

-- CreateEnum
CREATE TYPE "DeviceLocationSource" AS ENUM ('EDGE_GNSS', 'EDGE_CELL');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('PROVISIONED', 'INSTALLED', 'ACTIVE', 'SUSPENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "CommandType" AS ENUM ('REMOTE_BOOST_SET', 'SET_SCHEDULE', 'SET_CONFIG');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('QUEUED', 'DELIVERED', 'ACKED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OtaTargetType" AS ENUM ('DEVICE', 'GROUP');

-- CreateEnum
CREATE TYPE "OtaJobStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SimStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SimActionType" AS ENUM ('ACTIVATE', 'DEACTIVATE', 'SUSPEND', 'RESUME');

-- CreateEnum
CREATE TYPE "SimActionStatus" AS ENUM ('REQUESTED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertRuleType" AS ENUM ('NO_TELEMETRY', 'OVER_TEMP', 'POSSIBLE_LEAK', 'SENSOR_OUT_OF_RANGE');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertEventStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('EMAIL', 'SMS', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationEventStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EntitlementScope" AS ENUM ('TENANT', 'DEVICE');

-- CreateEnum
CREATE TYPE "EntitlementKey" AS ENUM ('BASIC_REMOTE_BOOST', 'SMART_HOME_INTEGRATION');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'DEVICE', 'SYSTEM');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TenantType" NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "locationSource" "LocationSource",
    "locationAccuracyM" DOUBLE PRECISION,
    "locationConfidence" DOUBLE PRECISION,
    "locationUpdatedAt" TIMESTAMP(3),
    "locationUpdatedByUserId" TEXT,
    "locationLock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "ownerUserId" TEXT,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "name" TEXT,
    "notes" TEXT,
    "tags" JSONB,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PROVISIONED',
    "lastSeenAt" TIMESTAMP(3),
    "firmwareVersion" TEXT,
    "simIccid" TEXT,
    "deviceLat" DOUBLE PRECISION,
    "deviceLon" DOUBLE PRECISION,
    "deviceLocationTs" TIMESTAMP(3),
    "deviceLocationSource" "DeviceLocationSource",
    "deviceLocationAccuracyM" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSecret" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "publicKey" TEXT,
    "rotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Telemetry" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "geo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceTwin" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "lastTs" TIMESTAMP(3),
    "derivedState" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceTwin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Command" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "CommandType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "CommandStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedByUserId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "ackAt" TIMESTAMP(3),
    "errorMsg" TEXT,

    CONSTRAINT "Command_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmwarePackage" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "releaseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmwarePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtaJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetType" "OtaTargetType" NOT NULL,
    "deviceId" TEXT,
    "groupFilter" JSONB,
    "firmwarePackageId" TEXT NOT NULL,
    "status" "OtaJobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "progress" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtaJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimInfo" (
    "iccid" TEXT NOT NULL,
    "carrier" TEXT,
    "planName" TEXT,
    "status" "SimStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastSyncAt" TIMESTAMP(3),
    "dataUsageMb" DOUBLE PRECISION,
    "msisdn" TEXT,
    "imsi" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimInfo_pkey" PRIMARY KEY ("iccid")
);

-- CreateTable
CREATE TABLE "SimAction" (
    "id" TEXT NOT NULL,
    "iccid" TEXT NOT NULL,
    "action" "SimActionType" NOT NULL,
    "requestedByUserId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SimActionStatus" NOT NULL DEFAULT 'REQUESTED',
    "providerRef" TEXT,
    "errorMsg" TEXT,

    CONSTRAINT "SimAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "type" "AlertRuleType" NOT NULL,
    "params" JSONB NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertEventStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "details" JSONB,
    "dedupeKey" TEXT,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "NotificationChannelType" NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "alertEventId" TEXT,
    "status" "NotificationEventStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRollup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "dayDate" DATE NOT NULL,
    "energyKwhDay" DOUBLE PRECISION,
    "hotWaterUsageLitersDay" DOUBLE PRECISION,
    "heaterOnMinutesDay" DOUBLE PRECISION,
    "tankTempMinC" DOUBLE PRECISION,
    "tankTempMaxC" DOUBLE PRECISION,
    "ambientTempAvgC" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" "EntitlementScope" NOT NULL,
    "deviceId" TEXT,
    "key" "EntitlementKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorUserId" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherData" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "Site_tenantId_idx" ON "Site"("tenantId");

-- CreateIndex
CREATE INDEX "Site_lat_lon_idx" ON "Site"("lat", "lon");

-- CreateIndex
CREATE INDEX "Site_tenantId_lat_lon_idx" ON "Site"("tenantId", "lat", "lon");

-- CreateIndex
CREATE INDEX "Device_tenantId_idx" ON "Device"("tenantId");

-- CreateIndex
CREATE INDEX "Device_siteId_idx" ON "Device"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tenantId_serialNumber_key" ON "Device"("tenantId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSecret_deviceId_key" ON "DeviceSecret"("deviceId");

-- CreateIndex
CREATE INDEX "Telemetry_deviceId_ts_idx" ON "Telemetry"("deviceId", "ts" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceTwin_deviceId_key" ON "DeviceTwin"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "FirmwarePackage_version_key" ON "FirmwarePackage"("version");

-- CreateIndex
CREATE INDEX "AlertRule_tenantId_idx" ON "AlertRule"("tenantId");

-- CreateIndex
CREATE INDEX "AlertEvent_tenantId_status_idx" ON "AlertEvent"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AlertEvent_deviceId_status_idx" ON "AlertEvent"("deviceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_dedupeKey_key" ON "AlertEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationChannel_tenantId_idx" ON "NotificationChannel"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationEvent_tenantId_idx" ON "NotificationEvent"("tenantId");

-- CreateIndex
CREATE INDEX "DailyRollup_deviceId_dayDate_idx" ON "DailyRollup"("deviceId", "dayDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRollup_deviceId_dayDate_key" ON "DailyRollup"("deviceId", "dayDate");

-- CreateIndex
CREATE INDEX "Entitlement_tenantId_idx" ON "Entitlement"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_tenantId_key_deviceId_key" ON "Entitlement"("tenantId", "key", "deviceId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "WeatherData_tenantId_idx" ON "WeatherData"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherData_siteId_date_key" ON "WeatherData"("siteId", "date");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_locationUpdatedByUserId_fkey" FOREIGN KEY ("locationUpdatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_simIccid_fkey" FOREIGN KEY ("simIccid") REFERENCES "SimInfo"("iccid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSecret" ADD CONSTRAINT "DeviceSecret_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Telemetry" ADD CONSTRAINT "Telemetry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceTwin" ADD CONSTRAINT "DeviceTwin_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtaJob" ADD CONSTRAINT "OtaJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtaJob" ADD CONSTRAINT "OtaJob_firmwarePackageId_fkey" FOREIGN KEY ("firmwarePackageId") REFERENCES "FirmwarePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtaJob" ADD CONSTRAINT "OtaJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimAction" ADD CONSTRAINT "SimAction_iccid_fkey" FOREIGN KEY ("iccid") REFERENCES "SimInfo"("iccid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimAction" ADD CONSTRAINT "SimAction_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationChannel" ADD CONSTRAINT "NotificationChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_alertEventId_fkey" FOREIGN KEY ("alertEventId") REFERENCES "AlertEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRollup" ADD CONSTRAINT "DailyRollup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRollup" ADD CONSTRAINT "DailyRollup_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeatherData" ADD CONSTRAINT "WeatherData_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeatherData" ADD CONSTRAINT "WeatherData_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

