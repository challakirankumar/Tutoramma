-- Tutor Amma D1 schema (generated from prisma/schema.prisma, made idempotent).
-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "city" TEXT NOT NULL DEFAULT 'Chennai',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "avatarColor" TEXT NOT NULL DEFAULT '#315BE5',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StudentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "badges" TEXT NOT NULL DEFAULT '[]',
    "goals" TEXT NOT NULL DEFAULT '[]',
    "weakTopics" TEXT NOT NULL DEFAULT '[]',
    "examDate" DATETIME,
    "parentEmail" TEXT,
    "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ParentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "emergencyName" TEXT NOT NULL DEFAULT '',
    "emergencyPhone" TEXT NOT NULL DEFAULT '',
    "consents" TEXT NOT NULL DEFAULT '{}',
    "childrenEmails" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "ParentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InstituteProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "academyName" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Chennai',
    "about" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "InstituteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TutorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "headline" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "rating" REAL NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "sessionsDone" INTEGER NOT NULL DEFAULT 0,
    "trustScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "badges" TEXT NOT NULL DEFAULT '[]',
    "languages" TEXT NOT NULL DEFAULT '[]',
    "modes" TEXT NOT NULL DEFAULT '[]',
    "rateOnline" INTEGER NOT NULL DEFAULT 0,
    "rateHome" INTEGER NOT NULL DEFAULT 0,
    "travelRadiusKm" INTEGER NOT NULL DEFAULT 0,
    "responseMins" INTEGER NOT NULL DEFAULT 30,
    "qualifications" TEXT NOT NULL DEFAULT '[]',
    "experience" TEXT NOT NULL DEFAULT '[]',
    "availabilityJson" TEXT NOT NULL DEFAULT '{}',
    "travelBufferMin" INTEGER NOT NULL DEFAULT 15,
    "verificationNote" TEXT,
    "instituteEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TutorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TutorDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tutorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT,
    "note" TEXT
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CurriculumBoard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "verifyState" TEXT NOT NULL DEFAULT 'verified',
    "lastExam" TEXT,
    "bodies" TEXT NOT NULL DEFAULT '',
    "levels" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT,
    "verifiedAt" DATETIME,
    "language" TEXT NOT NULL DEFAULT 'English',
    "languages" TEXT NOT NULL DEFAULT '[]',
    "taxonomy" TEXT NOT NULL DEFAULT '{}',
    "yearFormat" TEXT NOT NULL DEFAULT 'split',
    "pathways" TEXT NOT NULL DEFAULT '[]',
    "approvedQ" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CurriculumGrade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "CurriculumGrade_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "CurriculumBoard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CurriculumSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "CurriculumSubject_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "CurriculumBoard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CurriculumSubject_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "CurriculumGrade" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CurriculumChapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'NCERT Textbook',
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marks" INTEGER NOT NULL DEFAULT 5,
    CONSTRAINT "CurriculumChapter_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "CurriculumSubject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CurriculumTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "subTopics" TEXT NOT NULL DEFAULT '[]',
    "marks" INTEGER NOT NULL DEFAULT 2,
    CONSTRAINT "CurriculumTopic_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "CurriculumChapter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Offering" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tutorId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "price" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Address" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Chennai',
    "area" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'requested',
    "sessionFee" INTEGER NOT NULL,
    "platformFee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "addressId" TEXT,
    "batchId" TEXT,
    "meetUrl" TEXT,
    "policySnapshot" TEXT NOT NULL DEFAULT '{}',
    "topics" TEXT,
    "rating" INTEGER,
    "reviewComment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HomeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'scheduled',
    "otp" TEXT NOT NULL DEFAULT '0000',
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpExpiresAt" DATETIME,
    "onMyWayAt" DATETIME,
    "checkedInAt" DATETIME,
    "checkedOutAt" DATETIME,
    "sosActive" BOOLEAN NOT NULL DEFAULT false,
    "sosAt" DATETIME,
    "silentCheckStatus" TEXT,
    "silentCheckAt" DATETIME,
    "battery" INTEGER NOT NULL DEFAULT 88,
    "routeJson" TEXT NOT NULL DEFAULT '[]',
    "destLat" REAL NOT NULL,
    "destLng" REAL NOT NULL,
    "destArea" TEXT NOT NULL DEFAULT '',
    "geofenceMeters" INTEGER NOT NULL DEFAULT 150,
    "summaryJson" TEXT,
    CONSTRAINT "HomeSession_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AlertEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "bookingRef" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LocationPing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'enroute',
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "accuracy" REAL NOT NULL DEFAULT 15,
    "speed" REAL NOT NULL DEFAULT 0,
    "battery" INTEGER NOT NULL DEFAULT 88,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "bookingRef" TEXT,
    "tutorId" TEXT,
    "tutorName" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "summary" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL DEFAULT 'admin',
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tutorId" TEXT NOT NULL,
    "instituteEmail" TEXT,
    "subject" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "dayPattern" TEXT NOT NULL DEFAULT '[]',
    "minSeats" INTEGER NOT NULL DEFAULT 3,
    "maxSeats" INTEGER NOT NULL DEFAULT 12,
    "seatsFilled" INTEGER NOT NULL DEFAULT 0,
    "pricePerSeat" INTEGER NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL DEFAULT 'online',
    "venue" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "startDate" DATETIME NOT NULL,
    "rating" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BatchSeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'joined',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT,
    "batchId" TEXT,
    "payerId" TEXT NOT NULL,
    "tutorId" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'booking',
    "method" TEXT NOT NULL DEFAULT 'upi',
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "sessionFee" INTEGER NOT NULL,
    "platformFee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'created',
    "escrowReleasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'paid',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "escrow" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "bankMask" TEXT NOT NULL DEFAULT '',
    "bankVerified" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Payout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tutorId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "bankMask" TEXT NOT NULL DEFAULT 'SBI •••• 4821',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LessonPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tutorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "chapterNames" TEXT NOT NULL DEFAULT '[]',
    "difficulty" TEXT NOT NULL DEFAULT 'Medium',
    "periods" INTEGER NOT NULL DEFAULT 1,
    "periodMinutes" INTEGER NOT NULL DEFAULT 45,
    "slideCount" INTEGER NOT NULL DEFAULT 8,
    "contentJson" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'AI draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sharedWith" TEXT NOT NULL DEFAULT '[]',
    "linkedSlotId" TEXT,
    "sourceRefs" TEXT NOT NULL DEFAULT '[]',
    "reflectionJson" TEXT NOT NULL DEFAULT '{}',
    "reflectionStatus" TEXT NOT NULL DEFAULT 'none',
    "reflectionUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QuestionPaper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tutorId" TEXT NOT NULL,
    "lessonPlanId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'paper',
    "sourceVersion" INTEGER,
    "board" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "chapters" TEXT NOT NULL DEFAULT '[]',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "contentJson" TEXT NOT NULL DEFAULT '{}',
    "answerKeyJson" TEXT NOT NULL DEFAULT '{}',
    "allotmentJson" TEXT NOT NULL DEFAULT '{}',
    "headerJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "provenance" TEXT NOT NULL DEFAULT 'AI draft',
    "sharedWith" TEXT NOT NULL DEFAULT '[]',
    "sharedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LiveClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tutorId" TEXT NOT NULL,
    "batchId" TEXT,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "board" TEXT,
    "grade" TEXT,
    "agenda" TEXT NOT NULL DEFAULT '',
    "scheduledAt" DATETIME NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "hostKey" TEXT NOT NULL,
    "waitingRoom" BOOLEAN NOT NULL DEFAULT true,
    "allowChat" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "attendanceJson" TEXT NOT NULL DEFAULT '{}',
    "notifiedCount" INTEGER NOT NULL DEFAULT 0,
    "lessonPlanId" TEXT,
    "recorded" BOOLEAN NOT NULL DEFAULT false,
    "recordingSec" INTEGER NOT NULL DEFAULT 0,
    "notesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "endedAt" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TimetableEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "batchId" TEXT,
    "day" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tutorName" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#315BE5'
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Homework" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT,
    "batchId" TEXT,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "score" INTEGER,
    "feedback" TEXT,
    "submission" TEXT,
    "questionsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 20,
    "weakTopics" TEXT NOT NULL DEFAULT '[]',
    "takenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PassportTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "mastery" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SavedTutor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MessageThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "lastAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unread" INTEGER NOT NULL DEFAULT 0,
    "blocked" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MessageReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'system',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Dispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "raisedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ParentReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "contentJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting',
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FlashDeck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "color" TEXT NOT NULL DEFAULT '#315BE5',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Flashcard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "ease" REAL NOT NULL DEFAULT 2.5,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" DATETIME,
    CONSTRAINT "Flashcard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "FlashDeck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FocusSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StudyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "examName" TEXT NOT NULL,
    "examDate" DATETIME NOT NULL,
    "hoursPerDay" REAL NOT NULL DEFAULT 2,
    "plan" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'smart',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ParentProfile_userId_key" ON "ParentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InstituteProfile_userId_key" ON "InstituteProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TutorProfile_userId_key" ON "TutorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CurriculumBoard_code_key" ON "CurriculumBoard"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "HomeSession_bookingId_key" ON "HomeSession"("bookingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LocationPing_sessionId_ts_idx" ON "LocationPing"("sessionId", "ts");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_bookingId_key" ON "Payment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_paymentId_key" ON "Invoice"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LiveClass_code_key" ON "LiveClass"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LiveClass_slug_key" ON "LiveClass"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ParentReport_studentId_tutorId_weekStart_key" ON "ParentReport"("studentId", "tutorId", "weekStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FlashDeck_ownerId_idx" ON "FlashDeck"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Flashcard_deckId_dueAt_idx" ON "Flashcard"("deckId", "dueAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FocusSession_userId_createdAt_idx" ON "FocusSession"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StudyPlan_userId_key" ON "StudyPlan"("userId");

