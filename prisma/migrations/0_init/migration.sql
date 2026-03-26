-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "OrgTier" AS ENUM ('free', 'pro', 'team', 'team_founding');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('x', 'instagram', 'reddit', 'linkedin', 'tiktok', 'bluesky', 'threads');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "PostIntegrationStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookEvent" AS ENUM ('post_published', 'post_failed');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "paymentId" TEXT,
    "isTrialing" BOOLEAN NOT NULL DEFAULT true,
    "tier" "OrgTier" NOT NULL DEFAULT 'free',
    "postQuota" INTEGER DEFAULT 100,
    "platformQuota" INTEGER DEFAULT 3,
    "postsUsed" INTEGER NOT NULL DEFAULT 0,
    "quotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "providerName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOrganization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT,
    "internalId" TEXT NOT NULL,
    "identifier" "SocialPlatform" NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "handle" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "options" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostIntegration" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "status" "PostIntegrationStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "externalId" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT,
    "redirectUri" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "whatAreYouBuilding" TEXT,
    "source" TEXT NOT NULL DEFAULT 'landing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" "WebhookEvent"[],
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_apiKey_key" ON "Organization"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserOrganization_organizationId_idx" ON "UserOrganization"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOrganization_userId_organizationId_key" ON "UserOrganization"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "Integration_organizationId_idx" ON "Integration"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_organizationId_identifier_internalId_key" ON "Integration"("organizationId", "identifier", "internalId");

-- CreateIndex
CREATE INDEX "Post_organizationId_status_idx" ON "Post"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Post_scheduledAt_status_idx" ON "Post"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "PostIntegration_integrationId_idx" ON "PostIntegration"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "PostIntegration_postId_integrationId_key" ON "PostIntegration"("postId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState"("state");

-- CreateIndex
CREATE INDEX "OAuthState_state_idx" ON "OAuthState"("state");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_email_key" ON "WaitlistEntry"("email");

-- CreateIndex
CREATE INDEX "WaitlistEntry_createdAt_idx" ON "WaitlistEntry"("createdAt");

-- CreateIndex
CREATE INDEX "Webhook_organizationId_idx" ON "Webhook"("organizationId");

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostIntegration" ADD CONSTRAINT "PostIntegration_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostIntegration" ADD CONSTRAINT "PostIntegration_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

