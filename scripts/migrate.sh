#!/bin/bash
# Migration script for BaseBytes database
# Applies all migrations in migrations/ directory

set -euo pipefail

# Check DATABASE_URL is set
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  echo "Example: export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/basebytes'"
  exit 1
fi

echo "🔍 Checking database connection..."
if ! psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
  echo "❌ ERROR: Cannot connect to database"
  echo "DATABASE_URL: $DATABASE_URL"
  exit 1
fi

echo "✅ Database connection successful"
echo ""

# Create migrations directory if it doesn't exist
MIGRATIONS_DIR="$(dirname "$0")/../migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "❌ ERROR: migrations/ directory not found"
  exit 1
fi

# Apply each migration
echo "📦 Applying migrations..."
for migration in "$MIGRATIONS_DIR"/*.sql; do
  if [ -f "$migration" ]; then
    filename=$(basename "$migration")
    echo "  ▶ Applying $filename..."
    
    if psql "$DATABASE_URL" -f "$migration" > /dev/null 2>&1; then
      echo "    ✅ $filename applied successfully"
    else
      echo "    ❌ ERROR: Failed to apply $filename"
      exit 1
    fi
  fi
done

echo ""
echo "✅ All migrations applied successfully!"
echo ""

# Verify receipts table exists and has EAS columns
echo "🔍 Verifying database schema..."
SCHEMA_CHECK=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_name = 'receipts'
    AND column_name IN ('attestation_status', 'attestation_tx', 'attestation_uid');
" 2>/dev/null || echo "0")

if [ "$SCHEMA_CHECK" -eq "3" ]; then
  echo "✅ EAS columns verified in receipts table"
else
  echo "⚠️  WARNING: EAS columns may not be present"
  echo "   Expected 3 columns, found: $SCHEMA_CHECK"
fi

echo ""
echo "🎉 Migration complete!"
