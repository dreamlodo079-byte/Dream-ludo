import { Router, Request, Response } from 'express';
import { Notification } from '../models/Notification';
import { Types } from 'mongoose';

export const notificationRouter = Router();

/**
 * GET /api/v1/notifications/:userId
 * Returns list of user notifications and unread notification count
 */
notificationRouter.get(['/:userId', '/v1/notifications/:userId'], async (req: Request, res: Response) => {
  const { userId } = req.params;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;

  try {
    const userObjectId = new Types.ObjectId(userId);
    const query = { userId: userObjectId };

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ userId: userObjectId, isRead: false });
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.json({
      success: true,
      unreadCount,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      notifications,
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/notifications/read
 * Marks notifications as read
 */
notificationRouter.post(['/read', '/v1/notifications/read'], async (req: Request, res: Response) => {
  const { userId, notificationIds } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId parameter is required' });
  }

  try {
    const userObjectId = new Types.ObjectId(userId);
    let updateQuery: any = { userId: userObjectId, isRead: false };

    if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      updateQuery._id = { $in: notificationIds.map((id: string) => new Types.ObjectId(id)) };
    }

    const result = await Notification.updateMany(updateQuery, { $set: { isRead: true } });

    const remainingUnread = await Notification.countDocuments({ userId: userObjectId, isRead: false });

    return res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      unreadCount: remainingUnread,
    });
  } catch (error: any) {
    console.error('Error marking notifications as read:', error);
    return res.status(500).json({ error: error.message });
  }
});
