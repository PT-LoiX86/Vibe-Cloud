import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL.toLowerCase();
  const adminUsername = process.env.SEED_ADMIN_USERNAME.toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
  });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      username: adminUsername,
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
      accountStatus: "ACTIVE",
      emailVerifiedAt: new Date(),
      activatedAt: new Date(),
      opennebulaUserId: 0,
      opennebulaUsername: "oneadmin",
    },
  });

  // Seed Alpine Linux 3.20 mapped to discovered Image ID 1 and Template ID 1
  const alpineOs = await prisma.operatingSystem.upsert({
    where: { slug: "alpine-3-20" },
    update: {
      opennebulaImageId: 1,
      baseTemplateId: 1,
      baseDiskMb: 512,
      defaultSshUser: "root",
      active: true,
    },
    create: {
      slug: "alpine-3-20",
      name: "Alpine Linux 3.20",
      description:
        "Ultra-lightweight, fast-booting Linux distribution ideal for learning SSH, networking, and containers.",
      defaultSshUser: "root",
      icon: "alpine",
      opennebulaImageId: 1,
      baseTemplateId: 1,
      baseDiskMb: 512,
      active: true,
      displayOrder: 1,
    },
  });

  // Right-sized offerings for 13.6 GiB lab host
  const offeringsData = [
    {
      slug: "starter-sandbox",
      name: "Starter Sandbox",
      description:
        "Great for practicing Linux commands, SSH access, and lightweight scripts.",
      workloadTag: "Learning & CLI",
      vcpu: 1,
      cpuCapacity: 0.5,
      memoryMb: 512,
      rootDiskGb: 2,
      displayOrder: 1,
    },
    {
      slug: "standard-dev",
      name: "Standard Dev",
      description:
        "Balanced memory and storage for running web APIs, Docker containers, or small services.",
      workloadTag: "Web & App Dev",
      vcpu: 1,
      cpuCapacity: 1.0,
      memoryMb: 1024,
      rootDiskGb: 5,
      displayOrder: 2,
    },
    {
      slug: "compute-plus",
      name: "Compute Plus",
      description:
        "Extra vCPU and RAM headroom for compiling code or running multi-service stacks.",
      workloadTag: "Heavy Tasks",
      vcpu: 2,
      cpuCapacity: 1.5,
      memoryMb: 2048,
      rootDiskGb: 10,
      displayOrder: 3,
    },
  ];

  for (const item of offeringsData) {
    const offering = await prisma.vmOffering.upsert({
      where: { slug: item.slug },
      update: item,
      create: item,
    });

    await prisma.offeringTemplateMapping.upsert({
      where: {
        operatingSystemId_vmOfferingId: {
          operatingSystemId: alpineOs.id,
          vmOfferingId: offering.id,
        },
      },
      update: { opennebulaTemplateId: 1, active: true },
      create: {
        operatingSystemId: alpineOs.id,
        vmOfferingId: offering.id,
        opennebulaTemplateId: 1,
        active: true,
      },
    });
  }

  await prisma.customProvisioningPolicy.upsert({
    where: { operatingSystemId: alpineOs.id },
    update: {
      opennebulaTemplateId: 1,
      minVcpu: 1,
      maxVcpu: 2,
      stepVcpu: 1,
      minMemoryMb: 256,
      maxMemoryMb: 2048,
      stepMemoryMb: 256,
      minDiskGb: 1,
      maxDiskGb: 15,
      stepDiskGb: 1,
      active: true,
    },
    create: {
      operatingSystemId: alpineOs.id,
      opennebulaTemplateId: 1,
      minVcpu: 1,
      maxVcpu: 2,
      stepVcpu: 1,
      minMemoryMb: 256,
      maxMemoryMb: 2048,
      stepMemoryMb: 256,
      minDiskGb: 1,
      maxDiskGb: 15,
      stepDiskGb: 1,
      active: true,
    },
  });

  console.log("Seed completed successfully.");
  console.log(
    `Initial Admin Login -> Username: ${admin.username} | Email: ${admin.email} | Password: ${adminPassword}`,
  );
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
