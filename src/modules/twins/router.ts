import { Router, Response, NextFunction } from 'express';
import { prisma } from '../../common/prisma';
import { NotFoundError } from '../../common/errors';
import {
  AuthenticatedRequest,
  authenticateUser,
  loadUserContext,
  enforceTenancy,
} from '../../common/middleware';

const router = Router();

/**
 * @openapi
 * /api/devices/{id}/twin:
 *   get:
 *     tags: [DigitalTwins]
 *     summary: Get device digital twin state
 */
router.get(
  '/:id/twin',
  authenticateUser,
  loadUserContext,
  enforceTenancy,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const device = await prisma.device.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
      });
      if (!device) throw new NotFoundError('Device', req.params.id);

      const twin = await prisma.deviceTwin.findUnique({ where: { deviceId: device.id } });
      if (!twin) throw new NotFoundError('DeviceTwin');

      res.json(twin);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
