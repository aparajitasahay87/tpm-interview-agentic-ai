const ADMIN_EMAIL = 'aparajita.sahay87@gmail.com';
const usageTracker = new Map(); // In-memory storage

function checkRateLimit(req, res, next) {
  const { userId, userEmail } = req.body;

  // Validate userId provided
  if (!userId || !userEmail) {
    return res.status(400).json({
      success: false,
      error: 'User authentication required'
    });
  }

  // Admin bypass
  if (userEmail === ADMIN_EMAIL) {
    req.isAdmin = true;
    return next();
  }

  // Check usage
  const currentUsage = usageTracker.get(userId) || 0;

  if (currentUsage >= 2) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded. You have used your 2 free analyses.',
      usageCount: currentUsage,
      maxUsage: 2
    });
  }

  // Increment usage
  usageTracker.set(userId, currentUsage + 1);
  req.usageCount = currentUsage + 1;
  
  next();
}

module.exports = { checkRateLimit };