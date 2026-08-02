#!/bin/bash
# PostgreSQL Migration Quick Start Script
# Run this to set up PostgreSQL migration

set -e

echo "🚀 Discord Bot - PostgreSQL Migration Setup"
echo "==========================================="
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL first."
    echo "   macOS: brew install postgresql"
    echo "   Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    echo "   Windows: Download from https://www.postgresql.org/download/windows/"
    exit 1
fi

echo "✅ PostgreSQL found"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    exit 1
fi

echo "✅ Node.js found"
echo ""

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update .env with your PostgreSQL connection string"
    echo "   DATABASE_URL=postgresql://asephs:***@100.121.180.82:6432/dcbot"
    echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm add pg pg-pool node-pg-migrate
pnpm add -D @types/pg @types/node-pg-migrate
pnpm remove better-sqlite3 @types/better-sqlite3 2>/dev/null || true

echo "✅ Dependencies installed"
echo ""

# Create database
read -p "Enter PostgreSQL username (default: postgres): " PG_USER
PG_USER=${PG_USER:-postgres}

read -p "Enter PostgreSQL password: " -s PG_PASSWORD
echo ""

read -p "Enter database name (default: discord_bot): " DB_NAME
DB_NAME=${DB_NAME:-discord_bot}

read -p "Enter PostgreSQL host (default: localhost): " PG_HOST
PG_HOST=${PG_HOST:-100.121.180.82}

read -p "Enter PostgreSQL port (default: 5432): " PG_PORT
PG_PORT=${PG_PORT:-6432}

echo ""
echo "🗄️  Creating database..."

PGPASSWORD=$PG_PASSWORD psql -h $PG_HOST -U $PG_USER -p $PG_PORT -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
PGPASSWORD=$PG_PASSWORD psql -h $PG_HOST -U $PG_USER -p $PG_PORT -c "CREATE DATABASE $DB_NAME"

echo "✅ Database created"
echo ""

# Update .env with connection string
DATABASE_URL="postgresql://$PG_USER:$PG_PASSWORD@$PG_HOST:$PG_PORT/$DB_NAME"
sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL|" .env
rm -f .env.bak

echo "✅ .env updated with DATABASE_URL"
echo ""

# Run migrations
echo "🔄 Running migrations..."
npx node-pg-migrate up

echo "✅ Migrations completed"
echo ""

echo "🎉 PostgreSQL migration setup complete!"
echo ""
echo "Next steps:"
echo "1. Review the migration files in src/db/migrations/"
echo "2. Update imports in your code (see POSTGRES_IMPLEMENTATION.md)"
echo "3. Run: pnpm run typecheck"
echo "4. Run: pnpm run dev"
echo ""
