import crypto from "crypto";
import { renderEmailTemplate } from "../../../utils/email-template-renderer";
import { normalizeEmailLocale } from "../../../utils/email-locale";

export const ACCOUNT_DELETION_GRACE_DAYS = 30;

const SUPPORT_EMAIL = "suporte@cliavalia.com";

const REVIEW_USER_LINK_TABLE = "reviews_users_permissions_user_lnk";

function createHttpError(message: string, status = 400): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function buildLoginUrl(): string {
  const frontendUrl = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");

  return frontendUrl ? `${frontendUrl}/login` : "";
}

function formatDeletionDate(date: Date, locale: "pt" | "en"): string {
  const formatter = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-PT", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

  return formatter.format(date);
}

async function sendScheduledDeletionEmail(
  strapi: any,
  email: string,
  locale: "pt" | "en",
  scheduledDeletionAt: Date,
): Promise<void> {
  const emailService = strapi?.plugins?.email?.services?.email;
  if (!emailService?.send) {
    strapi.log?.warn("[ACCOUNT-DELETION] Email service unavailable; skipping scheduled deletion email");
    return;
  }

  const loginUrl = buildLoginUrl();
  const { subject, html, from } = await renderEmailTemplate(
    "account-deletion-scheduled",
    {
      scheduledDeletionDate: formatDeletionDate(scheduledDeletionAt, locale),
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
      loginUrl,
      supportEmail: SUPPORT_EMAIL,
    },
    locale,
  );

  await emailService.send({
    to: email,
    subject,
    html,
    from,
  });
}

async function getLinkedReviewIdsForUsers(
  strapi: any,
  userIds: number[],
): Promise<number[]> {
  if (userIds.length === 0) {
    return [];
  }

  const rows = await strapi.db.connection(REVIEW_USER_LINK_TABLE)
    .select("review_id")
    .whereIn("user_id", userIds);

  const normalizedReviewIds = rows
    .map((row: any) => Number(row?.review_id))
    .filter((value: number) => Number.isInteger(value) && value > 0);

  const reviewIds = Array.from(new Set<number>(normalizedReviewIds));

  return reviewIds;
}

async function restoreReviewsForUser(
  strapi: any,
  userId: number,
  reviewIds: number[] | null | undefined,
): Promise<number> {
  const normalizedReviewIds = (Array.isArray(reviewIds) ? reviewIds : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (normalizedReviewIds.length === 0) {
    return 0;
  }

  const existingRows = await strapi.db.connection(REVIEW_USER_LINK_TABLE)
    .select("review_id")
    .whereIn("review_id", normalizedReviewIds);

  const existingReviewIds = new Set(
    existingRows
      .map((row: any) => Number(row?.review_id))
      .filter((value: number) => Number.isInteger(value) && value > 0),
  );

  const reviewIdsToRestore = normalizedReviewIds.filter((reviewId) => !existingReviewIds.has(reviewId));

  if (reviewIdsToRestore.length === 0) {
    return 0;
  }

  await strapi.db.connection(REVIEW_USER_LINK_TABLE).insert(
    reviewIdsToRestore.map((reviewId) => ({
      review_id: reviewId,
      user_id: userId,
    })),
  );

  strapi.log?.info(
    `[ACCOUNT-DELETION] Restored ${reviewIdsToRestore.length} review link(s) for user ${userId}`,
  );

  return reviewIdsToRestore.length;
}

export async function orphanReviewsForUsers(
  strapi: any,
  userIds: number | number[] | null | undefined,
): Promise<number> {
  const normalizedIds = (Array.isArray(userIds) ? userIds : [userIds])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (normalizedIds.length === 0) {
    return 0;
  }

  const uniqueIds = [...new Set(normalizedIds)];

  // Strapi 5 uses a link table for manyToOne relations.
  // `updateMany` silently ignores relation fields in `data`, so we must
  // directly delete rows from the link table to remove the user association.
  // After this, the review still exists but has no linked user (null relation).
  await strapi.db.connection("reviews_users_permissions_user_lnk")
    .whereIn("user_id", uniqueIds)
    .delete();

  strapi.log?.info(
    `[ACCOUNT-DELETION] Orphaned reviews for user IDs: ${uniqueIds.join(", ")}`,
  );

  return uniqueIds.length;
}

export async function scheduleUserAccountDeletion(
  strapi: any,
  userId: number,
  localeValue?: string,
): Promise<{ scheduledDeletionAt: string; alreadyPending: boolean }> {
  const locale = normalizeEmailLocale(localeValue);

  const user = await strapi.db.query("plugin::users-permissions.user").findOne({
    where: { id: userId },
    populate: { role: true },
  });

  if (!user) {
    throw createHttpError("User not found.", 404);
  }

  const roleName = user?.role?.name?.toLowerCase?.() || "";
  if (roleName.includes("admin")) {
    throw createHttpError("Admin accounts cannot be deleted via this endpoint.", 403);
  }

  const ownedBusiness = await strapi.db.query("api::business.business").findOne({
    where: { owner: userId },
    select: ["id"],
  });

  if (ownedBusiness) {
    throw createHttpError(
      "You must transfer or remove your business ownership before deleting this account.",
      400,
    );
  }

  if (user.isDeletionPending && user.scheduledDeletionAt) {
    return {
      scheduledDeletionAt: new Date(user.scheduledDeletionAt).toISOString(),
      alreadyPending: true,
    };
  }

  const now = new Date();
  const scheduledDeletionAt = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const linkedReviewIds = await getLinkedReviewIdsForUsers(strapi, [userId]);

  await orphanReviewsForUsers(strapi, userId);

  await strapi.db.query("plugin::users-permissions.user").update({
    where: { id: userId },
    data: {
      isDeletionPending: true,
      deletionRequestedAt: now,
      scheduledDeletionAt,
      deletionCancelledAt: null,
      deletionFinalizedAt: null,
      anonymizedAt: now,
      pendingDeletionReviewIds: linkedReviewIds,
      reviewer_level: null,
    },
  });

  if (user.email) {
    try {
      await sendScheduledDeletionEmail(strapi, user.email, locale, scheduledDeletionAt);
    } catch (error: any) {
      strapi.log?.warn(
        `[ACCOUNT-DELETION] Failed to send scheduled deletion email to ${user.email}: ${error?.message || error}`,
      );
    }
  }

  return {
    scheduledDeletionAt: scheduledDeletionAt.toISOString(),
    alreadyPending: false,
  };
}

export async function cancelScheduledAccountDeletion(strapi: any, userId: number): Promise<boolean> {
  const user = await strapi.db.query("plugin::users-permissions.user").findOne({
    where: { id: userId },
    select: ["id", "isDeletionPending", "pendingDeletionReviewIds", "anonymizedAt"],
  });

  const pendingDeletionReviewIds = Array.isArray(user?.pendingDeletionReviewIds)
    ? user.pendingDeletionReviewIds
    : null;

  const shouldAttemptRecovery = Boolean(
    user?.isDeletionPending
    || user?.anonymizedAt
    || (pendingDeletionReviewIds && pendingDeletionReviewIds.length > 0),
  );

  if (!user || !shouldAttemptRecovery) {
    return false;
  }

  const restoredReviewCount = await restoreReviewsForUser(strapi, userId, pendingDeletionReviewIds);

  const updateData: Record<string, unknown> = {
    isDeletionPending: false,
    scheduledDeletionAt: null,
    deletionCancelledAt: new Date(),
    pendingDeletionReviewIds: null,
  };

  const hasLegacyMissingReviewBackup = Boolean(user.anonymizedAt) && pendingDeletionReviewIds === null;

  if (!hasLegacyMissingReviewBackup || restoredReviewCount > 0) {
    updateData.anonymizedAt = null;
  } else {
    strapi.log?.warn(
      `[ACCOUNT-DELETION] User ${userId} is still anonymized but has no stored pendingDeletionReviewIds; manual review-link restoration is required`,
    );
  }

  await strapi.db.query("plugin::users-permissions.user").update({
    where: { id: userId },
    data: updateData,
  });

  return true;
}

async function scrubUserAsDeleted(strapi: any, userId: number): Promise<void> {
  const timestamp = Date.now();
  const uniqueSuffix = crypto.randomBytes(4).toString("hex");

  await strapi.db.query("plugin::users-permissions.user").update({
    where: { id: userId },
    data: {
      username: `deleted_user_${userId}_${uniqueSuffix}`.slice(0, 255),
      email: `deleted+${userId}.${timestamp}@cliavalia.invalid`,
      provider: "deleted",
      firstName: "Deleted",
      lastName: "User",
      phoneNumber: null,
      otpCode: null,
      otpExpiry: null,
      profileImage: null,
      coverPhoto: null,
      verified: false,
      province: null,
      showProvinceOnPublicProfile: false,
      reviewer_level: null,
      resetPasswordToken: null,
      confirmationToken: null,
      confirmationTokenSentAt: null,
      resetPasswordTokenSentAt: null,
      confirmed: false,
      blocked: true,
      isDeletionPending: false,
      deletionFinalizedAt: new Date(),
      scheduledDeletionAt: null,
      pendingDeletionReviewIds: null,
    },
  });
}

export async function runScheduledAccountDeletionPurge(strapi: any): Promise<{ finalized: number; scrubbed: number }> {
  const users = await strapi.db.query("plugin::users-permissions.user").findMany({
    where: {
      isDeletionPending: true,
      scheduledDeletionAt: {
        $lte: new Date(),
      },
    },
    select: ["id"],
  });

  let finalized = 0;
  let scrubbed = 0;

  for (const user of users) {
    await orphanReviewsForUsers(strapi, user.id);

    try {
      await strapi.db.query("plugin::users-permissions.user").delete({
        where: { id: user.id },
      });
      finalized += 1;
    } catch (error: any) {
      strapi.log?.warn(
        `[ACCOUNT-DELETION] Hard delete failed for user ${user.id}; scrubbing row instead: ${error?.message || error}`,
      );
      await scrubUserAsDeleted(strapi, user.id);
      scrubbed += 1;
    }
  }

  return { finalized, scrubbed };
}