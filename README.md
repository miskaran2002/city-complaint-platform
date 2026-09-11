# 🏙️ Smart City Complaint & Service Request Platform

A robust, scalable, and intelligent backend platform designed to bridge the gap between citizens and city administration. This system streamlines the process of submitting, tracking, and resolving public complaints (e.g., broken streetlights, water leaks, road damages) through an automated workflow, Role-Based Access Control (RBAC), and integrated payment systems for emergency services.

## 📖 Project Overview
The **City Complaint & Service Request Platform** aims to digitize public service management. Citizens can raise localized complaints, which are automatically routed to the relevant city departments. Managers can assign these tasks to technicians, track Service Level Agreements (SLAs), and monitor the real-time status of resolutions. The system also supports bKash tokenized payments for emergency priority services and collects post-resolution feedback.

---

## ✨ Key Features & Workflows

### 👥 User Roles (RBAC)
- **Citizen:** Can create complaints, track status, make payments for emergencies, and submit feedback.
- **Department Staff:** Can view and manage complaints within their specific department.
- **Department Manager:** Oversees department operations, assigns tasks to technicians.
- **Technician:** Receives task assignments, updates complaint status (e.g., In Progress, Resolved).
- **City Admin:** Has super-admin access, manages users, roles, and views system-wide statistics and audit logs.

### 🔄 Complaint Lifecycle Workflow
1. **Initiation:** Citizen submits a complaint with category and location details.
2. **Routing:** System assigns the complaint to the relevant department.
3. **Assignment:** Department Manager/Admin assigns a Technician to the task.
4. **Action:** Technician investigates and updates the status (`PENDING` ➔ `IN_PROGRESS`).
5. **Resolution:** Technician marks the issue as `RESOLVED`.
6. **Feedback:** Citizen provides a rating and comment on the resolved service.

### 💡 Advanced Backend Implementations
- **Role-Based Access Control (RBAC):** Secure middleware to protect routes based on user roles.
- **bKash Payment Integration:** Tokenized checkout for emergency service prioritization using Prisma Transactions.
- **Complex Database Relationships:** One-to-many and many-to-many relations using PostgreSQL.
- **Smart Audit Logs:** Tracking system changes and user activities dynamically.
- **Advanced Querying:** Pagination, dynamic filtering, and search capabilities.

---

## 🛠️ Tech Stack

- **Runtime Environment:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Payment Gateway:** bKash Tokenized Checkout API (Sandbox)

---

## 🗄️ Entity Relationship Diagram (ERD)

The core database architecture includes models for Users, Departments, Categories, Complaints, Payments, Feedbacks, and Assignments.

![Database ERD](image_cc79e8.png)

---

## 🚀 Installation & Setup Instructions

Follow these steps to set up the project locally.

### 1. Prerequisites
- Node.js (v18 or higher)
- PostgreSQL installed and running locally (or a cloud instance)

### 2. Clone the Repository
```bash
git clone <your-repository-url>
cd <your-project-folder>
3. Install DependenciesBashnpm install
4. Environment Variables (.env)Create a .env file in the root directory and configure the following variables:Code snippetPORT=5000
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/YOUR_DATABASE_NAME?schema=public"

# JWT Configuration
JWT_SECRET="your_super_secret_key"
JWT_EXPIRES_IN="7d"

# bKash Sandbox Credentials
BKASH_BASE_URL="[https://tokenized.sandbox.bka.sh/v1.2.0-beta](https://tokenized.sandbox.bka.sh/v1.2.0-beta)"
BKASH_USERNAME="your_sandbox_username"
BKASH_PASSWORD="your_sandbox_password"
BKASH_APP_KEY="your_app_key"
BKASH_APP_SECRET="your_app_secret"
BKASH_CALLBACK_URL="http://localhost:5000/api/v1/payments/webhook"
5. Prisma ORM SetupGenerate the Prisma Client and run database migrations:Bashnpx prisma generate
npx prisma migrate dev --name init
6. Start the ServerRun the development server:Bashnpm run dev
The server should now be running on http://localhost:5000.📡 API Documentation🔐 AuthenticationMethodEndpointDescriptionPOST/api/v1/auth/registerRegister a new user (Citizen by default)POST/api/v1/auth/loginAuthenticate user and get access tokenPOST/api/v1/auth/refresh-tokenGenerate a new access token👤 User / ProfileMethodEndpointDescriptionGET/api/v1/users/meGet logged-in user profilePATCH/api/v1/users/meUpdate profile information🏢 Core Resources (Complaints, Departments, Categories)(Supports pagination and filtering: ?page=1&limit=10&status=active)MethodEndpointDescriptionPOST/api/v1/resourcesCreate a new resource (e.g., Complaint)GET/api/v1/resourcesGet all resources (with filters)GET/api/v1/resources/:idGet a specific resource by IDPATCH/api/v1/resources/:idUpdate resource detailsDELETE/api/v1/resources/:idSoft delete a resourceGET/api/v1/resources/search?q=keywordSearch resources⚙️ Business OperationsMethodEndpointDescriptionPOST/api/v1/resources/:id/assignAssign a complaint to a TechnicianPATCH/api/v1/resources/:id/statusUpdate complaint status (e.g., In Progress)POST/api/v1/resources/:id/cancelCancel a service requestGET/api/v1/resources/my-assignedGet tasks assigned to the logged-in technician💳 Payment Integration (bKash)MethodEndpointDescriptionPOST/api/v1/payments/initiateInitiate an emergency payment sessionPOST/api/v1/payments/webhookExecute payment (bKash callback URL)GET/api/v1/payments/:idCheck payment status🛡️ Admin OperationsMethodEndpointDescriptionGET/api/v1/admin/usersView all system users (Pagination & Search)PATCH/api/v1/admin/users/:id/roleUpdate user roles (e.g., promote to Admin)GET/api/v1/admin/dashboard-statsView total complaints, revenue, and user statsGET/api/v1/admin/audit-logsTrack recent system changes and activities👨‍💻 Developed ByMd Rayhan UddinComputer Science and Engineering, University of Barishal
