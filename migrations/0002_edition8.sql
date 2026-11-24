-- Tutor Amma edition 8 modules: classrooms, PTM, rules profiles, AI tutor sessions (idempotent).
-- CreateTable
CREATE TABLE IF NOT EXISTS "Classroom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tutorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "board" TEXT NOT NULL DEFAULT 'CBSE',
    "grade" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'English',
    "mode" TEXT NOT NULL DEFAULT 'online',
    "visibility" TEXT NOT NULL DEFAULT 'link',
    "joinPolicy" TEXT NOT NULL DEFAULT 'approval',
    "seats" INTEGER NOT NULL DEFAULT 30,
    "waitlist" BOOLEAN NOT NULL DEFAULT true,
    "pricePlan" TEXT NOT NULL DEFAULT 'free',
    "price" INTEGER NOT NULL DEFAULT 0,
    "joinCode" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "schedule" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "recording" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClassroomMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "via" TEXT NOT NULL DEFAULT 'link',
    "progressShare" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassroomMember_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PtmBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 10,
    "mode" TEXT NOT NULL DEFAULT 'online',
    "status" TEXT NOT NULL DEFAULT 'booked',
    "brief" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RulesProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "country" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rules" TEXT NOT NULL DEFAULT '[]',
    "gates" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "submittedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiTutorSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'en',
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "understanding" INTEGER NOT NULL DEFAULT 50,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Classroom_joinCode_key" ON "Classroom"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Classroom_shareToken_key" ON "Classroom"("shareToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Classroom_tutorId_idx" ON "Classroom"("tutorId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomMember_classroomId_studentId_key" ON "ClassroomMember"("classroomId", "studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PtmBooking_tutorId_startAt_idx" ON "PtmBooking"("tutorId", "startAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PtmBooking_parentId_idx" ON "PtmBooking"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RulesProfile_country_version_key" ON "RulesProfile"("country", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiTutorSession_studentId_idx" ON "AiTutorSession"("studentId");

