#!/bin/bash

# Quick Start - Onboarding Visibility Fix Testing
# Run this script to start testing the changes on localhost

echo "🚀 Starting PLAYR Localhost Testing..."
echo ""

# Check if we're in the right directory
if [ ! -d "client" ]; then
    echo "❌ Error: client directory not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "📋 Pre-flight checklist:"
echo "1. Have you run the database migration in Supabase?"
echo "   → Go to Supabase Dashboard → SQL Editor"
echo "   → Run: supabase/migrations/20251103120000_add_onboarding_completed.sql"
echo ""
read -p "Migration completed? (y/n): " migration_done

if [ "$migration_done" != "y" ]; then
    echo ""
    echo "⚠️  Please run the migration first:"
    echo "   1. Open Supabase Dashboard"
    echo "   2. Navigate to SQL Editor"
    echo "   3. Copy and paste the content from:"
    echo "      supabase/migrations/20251103120000_add_onboarding_completed.sql"
    echo "   4. Click 'Run'"
    echo ""
    read -p "Press Enter to continue anyway or Ctrl+C to exit..."
fi

echo ""
echo "🔧 Starting development server..."
echo ""

cd client
npm run dev
