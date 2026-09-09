import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 1. Password Hash for Users
  const hashedPassword = await bcrypt.hash('Admin@123456', 10);

  // 2. Create City Admin User
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cityservice.com' },
    update: {},
    create: {
      name: 'Md Rayhan Uddin',
      email: 'admin@cityservice.com',
      password: hashedPassword,
      role: Role.CITY_ADMIN, // Updated from Role.ADMIN
    },
  });

  console.log('City Admin created:', admin.email);

  // 3. Create Default Department & Categories
  const department = await prisma.department.upsert({
    where: { code: 'PWD' },
    update: {},
    create: {
      name: 'Public Works Department',
      code: 'PWD',
      description: 'Handles roads, bridges, and infrastructure issues.',
      categories: {
        create: [
          { name: 'Pothole Repair', description: 'Fixing damaged road potholes' },
          { name: 'Street Light Maintenance', description: 'Repairing non-working street lamps' },
        ],
      },
    },
  });

  console.log('Department created:', department.name);

  // 4. Create a Sample Technician (Linked to PWD Department)
  const technician = await prisma.user.upsert({
    where: { email: 'technician@cityservice.com' },
    update: {},
    create: {
      name: 'Rafiqul Islam (Technician)',
      email: 'technician@cityservice.com',
      password: hashedPassword,
      role: Role.TECHNICIAN, // Using the new TECHNICIAN role
      departmentId: department.id, // Automatically linked to Public Works Department
    },
  });

  console.log('Technician created:', technician.email);
  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });