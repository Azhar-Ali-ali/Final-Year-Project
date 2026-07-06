function isDeliveredOrderStatus(status) {
  return String(status || '').trim().toLowerCase() === 'delivered';
}

function canEditReview(review, now = new Date()) {
  if (!review || !review.createdAt) {
    return false;
  }

  const createdAt = new Date(review.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }

  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  return new Date(now).getTime() < expiresAt.getTime();
}

function getReviewState({ review, eligibleForReview, now = new Date() }) {
  const hasReview = Boolean(review && review.id);
  const canEdit = hasReview && canEditReview(review, now);
  const canDelete = hasReview;
  const canCreate = Boolean(eligibleForReview) && !hasReview;
  const expiresAt = hasReview && review.createdAt ? new Date(new Date(review.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString() : null;

  return {
    hasReview,
    canCreate,
    canEdit,
    canDelete,
    eligibleForReview: Boolean(eligibleForReview),
    expiresAt,
    review
  };
}

module.exports = {
  isDeliveredOrderStatus,
  canEditReview,
  getReviewState
};
