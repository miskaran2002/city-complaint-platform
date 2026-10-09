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

  // 1. Default Password Hash for All Users (Password: 123456)
  const hashedPassword = await bcrypt.hash('123456', 10);

  // 2. Create City Admin User
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cityservice.com' },
    update: {
      password: hashedPassword,
    },
    create: {
      name: 'Md Rayhan Uddin',
      email: 'admin@cityservice.com',
      password: hashedPassword,
      role: Role.CITY_ADMIN,
    },
  });

  console.log('City Admin created:', admin.email);

  // 3. Departments Data List
  const departmentsData = [
    {
      name: 'Public Works Department',
      code: 'PWD',
      description: 'Handles roads, bridges, and infrastructure issues.',
      categories: [
        { name: 'Pothole Repair', description: 'Fixing damaged road potholes' },
        { name: 'Street Light Maintenance', description: 'Repairing non-working street lamps' },
      ],
    },
    {
      name: 'Public Health and Sanitation',
      code: 'PHS',
      description: 'Handles public health, sanitation, and hygiene.',
      categories: [
        { name: 'Mosquito Control', description: 'Spraying and fogging for mosquitoes' },
        { name: 'Drainage Cleaning', description: 'Clearing blocked open drains' },
      ],
    },
    {
      name: 'Electricity and Power Board',
      code: 'EPB',
      description: 'Manages municipal power distribution and electrical lines.',
      categories: [
        { name: 'Power Outage', description: 'Reporting localized electrical outages' },
        { name: 'Transformer Repair', description: 'Fixing hazardous power transformers' },
      ],
    },
    {
      name: 'Waste Management Department',
      code: 'WMD',
      description: 'Collects solid waste and maintains urban cleanliness.',
      categories: [
        { name: 'Garbage Collection', description: 'Scheduled waste collection requests' },
        { name: 'Illegal Dumping', description: 'Reporting illegal waste dumping' },
      ],
    },
    {
      name: 'Department of Environment',
      code: 'DOE',
      description: 'Monitors pollution, tree planting, and green initiatives.',
      categories: [
        { name: 'Air & Noise Pollution', description: 'Reporting environmental violations' },
        { name: 'Tree Trimming', description: 'Trimming hazardous tree branches' },
      ],
    },
    {
      name: 'Water & Station',
      code: 'WSD',
      description: 'Manages water supply, pipelines, and pump stations.',
      categories: [
        { name: 'Water Leakage', description: 'Fixing pipe leaks and line bursts' },
        { name: 'Low Water Pressure', description: 'Resolving supply pressure issues' },
      ],
    },
  ];

  // 4. Create Departments, Categories & Assigned Personnel
  for (const deptData of departmentsData) {
    const department = await prisma.department.upsert({
      where: { code: deptData.code },
      update: {
        name: deptData.name,
        description: deptData.description,
      },
      create: {
        name: deptData.name,
        code: deptData.code,
        description: deptData.description,
        categories: {
          create: deptData.categories,
        },
      },
    });

    console.log(`\nDepartment created/updated: ${department.name} (${department.code})`);

    const codeLower = deptData.code.toLowerCase();

    // Create 1 x DEPARTMENT_MANAGER
    const manager = await prisma.user.upsert({
      where: { email: `manager.${codeLower}@cityservice.com` },
      update: {
        departmentId: department.id,
        role: Role.DEPARTMENT_MANAGER,
      },
      create: {
        name: `${deptData.name} Manager`,
        email: `manager.${codeLower}@cityservice.com`,
        password: hashedPassword,
        role: Role.DEPARTMENT_MANAGER,
        departmentId: department.id,
      },
    });
    console.log(`  - Manager: ${manager.email}`);

    // Create 1 x TECHNICIAN
    const technician = await prisma.user.upsert({
      where: { email: `tech.${codeLower}@cityservice.com` },
      update: {
        departmentId: department.id,
        role: Role.TECHNICIAN,
      },
      create: {
        name: `${deptData.name} Technician`,
        email: `tech.${codeLower}@cityservice.com`,
        password: hashedPassword,
        role: Role.TECHNICIAN,
        departmentId: department.id,
      },
    });
    console.log(`  - Technician: ${technician.email}`);

    // Create 1 x DEPARTMENT_STAFF
    const staff = await prisma.user.upsert({
      where: { email: `staff.${codeLower}@cityservice.com` },
      update: {
        departmentId: department.id,
        role: Role.DEPARTMENT_STAFF,
      },
      create: {
        name: `${deptData.name} Staff`,
        email: `staff.${codeLower}@cityservice.com`,
        password: hashedPassword,
        role: Role.DEPARTMENT_STAFF,
        departmentId: department.id,
      },
    });
    console.log(`  - Staff: ${staff.email}`);
  }

  console.log('\nSeeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });