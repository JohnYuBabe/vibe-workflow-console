-- CreateTable
CREATE TABLE `decisions` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NULL,
    `title` VARCHAR(200) NOT NULL,
    `context` TEXT NOT NULL,
    `options` TEXT NOT NULL,
    `decision` TEXT NOT NULL,
    `consequences` TEXT NULL,
    `status` ENUM('proposed', 'accepted', 'superseded') NOT NULL DEFAULT 'proposed',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `decisions_projectId_status_idx`(`projectId`, `status`),
    INDEX `decisions_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `decisions` ADD CONSTRAINT `decisions_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `decisions` ADD CONSTRAINT `decisions_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `decisions` ADD CONSTRAINT `decisions_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
