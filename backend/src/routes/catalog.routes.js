import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { requireActiveUser } from "../middleware/auth.middleware.js";
import {
  getUserQuotaAndUsage,
  getInfrastructureCapacity,
} from "../integrations/opennebula/inventory.service.js";

const router = Router();

router.get(
  "/catalog/operating-systems",
  requireActiveUser,
  async (req, res) => {
    const systems = await prisma.operatingSystem.findMany({
      where: { active: true },
      orderBy: { displayOrder: "asc" },
      include: {
        customPolicies: {
          where: { active: true },
        },
      },
    });

    return res.json({ operatingSystems: systems });
  },
);

router.get("/catalog/offerings", requireActiveUser, async (req, res) => {
  const offerings = await prisma.vmOffering.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
    include: {
      templateMappings: {
        where: { active: true },
        select: {
          operatingSystemId: true,
          opennebulaTemplateId: true,
        },
      },
    },
  });

  return res.json({ offerings });
});

router.get("/resources/me", requireActiveUser, async (req, res) => {
  const user = req.currentUser;

  if (!user.opennebulaUsername) {
    return res
      .status(400)
      .json({ error: "OpenNebula identity is not linked to this account." });
  }

  try {
    const [quotaInfo, infra] = await Promise.all([
      getUserQuotaAndUsage(user.opennebulaUsername),
      getInfrastructureCapacity(),
    ]);

    return res.json({
      ...quotaInfo,
      hostAvailable: {
        memoryMb: infra.summary.availableMemoryMb,
        cpuUnits: infra.summary.availableCpuUnits,
        diskMb: infra.summary.availableDiskMb,
      },
    });
  } catch (err) {
    return res
      .status(502)
      .json({
        error: `Unable to fetch OpenNebula resource limits: ${err.message}`,
      });
  }
});

export default router;
