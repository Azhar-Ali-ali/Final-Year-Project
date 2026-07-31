# LUMINA - AI-Powered E-Commerce Platform

A comprehensive marketplace platform with AI-powered visual product recommendations, seller dashboard, and admin management system.

## Project Structure

```
Final-Year-Project/
├── AI-Clothing-AI/          # AI recommendation service
├── back_end/
│   ├── admin_backend/       # Admin API server
│   ├── customer_backend/    # Customer API server
│   ├── seller_backend/      # Seller API server
│   └── database/            # Database configuration
├── Front_End/
│   ├── Admin/              # Admin dashboard
│   ├── Customer/           # Customer website
│   └── Seller/             # Seller dashboard
└── README.md
```

## Requirements

- **Python 3.10+** (for AI service)
- **Node.js 18+** (for backend servers)
- **PostgreSQL** (database)
- **Git Bash / PowerShell / Command Prompt**

---

## Part 1: AI Recommendation Service Setup

### Step 1: Navigate to AI Directory

```powershell
cd C:\files\Final-Year-Project\AI-Clothing-AI
```

### Step 2: Create Python Virtual Environment

```powershell
python -m venv .venv
```

### Step 3: Activate Virtual Environment

```powershell
.venv\Scripts\activate
```

You should see `(.venv)` prefix in your terminal prompt.

### Step 4: Install Python Dependencies

```powershell
pip install -r requirements.txt
```

### Step 5: Build AI Index from Database

This step builds the recommendation index using products from your database:

```powershell
python build_index_from_db.py
```

**Alternative:** If you have a pre-built dataset, you can use:
```powershell
python build_index.py
```

### Step 6: Start AI Recommendation Service

Set the Python path and start the Uvicorn server:

```powershell
$env:PYTHONPATH = 'C:\files\Final-Year-Project\AI-Clothing-AI'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Step 7: Verify AI Service is Running

Open a new PowerShell terminal and test the health endpoint:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -UseBasicParsing
```

Expected response:
```json
{"status":"working"}
```

### Available AI Service Endpoints

- **Health Check**: `http://127.0.0.1:8000/api/health`
- **Visual Search**: `http://127.0.0.1:8000/api/visual-search`
- **Documentation**: `http://127.0.0.1:8000/docs` (Swagger UI)

---

## Part 2: Website Backend Setup

### Step 1: Navigate to Backend Directory

```powershell
cd C:\files\Final-Year-Project\back_end\admin_backend
```

### Step 2: Set Database Connection (if needed)

```powershell
$env:DATABASE_URL = "postgres://postgres:1234@localhost:5432/lumina"
```

Adjust the credentials if your PostgreSQL setup differs.

### Step 3: Install Node Dependencies

```powershell
npm install
```

### Step 4: Start the Backend Server

```powershell
npm start
```

Or run directly:

```powershell
node src/unifiedServer.js
```

### Step 5: Verify Backend is Running

Test the health endpoint:

```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing
```

Expected response: Successful JSON response confirming backend connection.

### Backend Server Runs On

- **Website**: `http://localhost:5000`
- **Admin Panel**: `http://localhost:5000/Front_End/Admin/pages/admin_login.html`
- **Seller Dashboard**: `http://localhost:5000/seller-pages/Dashboard.html`
- **Product Details**: `http://localhost:5000/products_details.html?id=PRODUCT_ID`
- **All Products**: `http://localhost:5000/all_product_spages.html`

---

## Part 3: Complete Startup Sequence

### Terminal 1: AI Recommendation Service

```powershell
cd C:\files\Final-Year-Project\AI-Clothing-AI
.venv\Scripts\activate
$env:PYTHONPATH = 'C:\files\Final-Year-Project\AI-Clothing-AI'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Terminal 2: Website Backend

```powershell
cd C:\files\Final-Year-Project\back_end\admin_backend
$env:DATABASE_URL = "postgres://postgres:1234@localhost:5432/lumina"
npm start
```

### Expected Output

**AI Service Ready:**
```
Uvicorn running on http://127.0.0.1:8000
Press CTRL+C to quit
```

**Backend Server Ready:**
```
Server running on http://localhost:5000
Connected to database
```

---

## Troubleshooting

### AI Service Issues

**Error: `ModuleNotFoundError: No module named 'app'`**
- Solution: Make sure PYTHONPATH is set correctly and you're running from the AI-Clothing-AI directory

**Error: `No module named 'uvicorn'`**
- Solution: Ensure virtual environment is activated and dependencies installed: `pip install -r requirements.txt`

**Error: Port 8000 already in use**
- Solution: Kill existing process or use a different port:
  ```powershell
  netstat -ano | findstr :8000
  taskkill /PID <PID> /F
  ```

### Backend Service Issues

**Error: Cannot connect to PostgreSQL**
- Solution: Verify PostgreSQL is running and DATABASE_URL is correct
- Check: `psql -U postgres -d lumina`

**Error: Port 5000 already in use**
- Solution: Kill existing process or restart:
  ```powershell
  $port = 5000
  $proc = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' } | Select-Object -ExpandProperty OwningProcess -Unique
  if ($proc) { Stop-Process -Id $proc -Force }
  ```

**Error: Module not found**
- Solution: Reinstall dependencies: `npm install`

---

## Development Notes

### AI Service Files
- **Main App**: `AI-Clothing-AI/app/main.py` - FastAPI application
- **Model Service**: `AI-Clothing-AI/app/model_service.py` - ML model handling
- **Database**: `AI-Clothing-AI/app/db.py` - Database connection
- **Build Index**: `AI-Clothing-AI/build_index_from_db.py` - Index building from database

### Backend Files
- **Server**: `back_end/admin_backend/src/unifiedServer.js` - Main server entry point
- **Routes**: 
  - Admin: `back_end/admin_backend/src/routes/`
  - Customer: `back_end/customer_backend/src/routes/`
  - Seller: `back_end/seller_backend/src/routes/`
- **Database**: `back_end/database/postgresClient.js` - PostgreSQL connection

### Frontend Files
- **Admin**: `Front_End/Admin/pages/` - Admin dashboard pages
- **Customer**: `Front_End/Customer/` - Customer-facing website
- **Seller**: `Front_End/Seller/pages/` - Seller dashboard pages

---

## API Documentation

### AI Service API

**GET /api/health**
- Check if AI service is running
- Response: `{"status":"working"}`

**POST /api/visual-search**
- Visual similarity search for products
- Request: Image file or base64
- Response: Array of similar products

### Backend API

**GET /api/health**
- Check backend service status

**GET /api/admin/dashboard/summary**
- Admin dashboard statistics

**GET /api/seller/dashboard/metrics**
- Seller dashboard metrics

---

## Quick Start Summary

```powershell
# Terminal 1: AI Service
cd C:\files\Final-Year-Project\AI-Clothing-AI
.venv\Scripts\activate
python build_index_from_db.py
$env:PYTHONPATH = '.'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2: Backend
cd C:\files\Final-Year-Project\back_end\admin_backend
$env:DATABASE_URL = "postgres://postgres:1234@localhost:5432/lumina"
npm install
npm start

# Access
# Website: http://localhost:5000
# Admin: http://localhost:5000/Front_End/Admin/pages/admin_login.html
# AI Health: http://127.0.0.1:8000/api/health
```

---

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review logs in the terminal where services are running
3. Verify all required software is installed and accessible
4. Ensure database is running and accessible

---

## Version Info

- **Python**: 3.10+
- **Node.js**: 18+
- **FastAPI/Uvicorn**: Latest from requirements.txt
- **Express.js**: Latest from package.json
- **PostgreSQL**: 12+
