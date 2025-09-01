#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Hook script to check TypeScript and ESLint errors across entire project
 * Blocks operations if there are type errors or lint errors in any package
 */

const PROJECT_ROOT = process.cwd();

function runCommand(command, description) {
  try {
    console.log(`🔍 Checking ${description}...`);
    const output = execSync(command, { 
      cwd: PROJECT_ROOT, 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output };
  } catch (error) {
    return { 
      success: false, 
      output: error.stdout || error.message,
      stderr: error.stderr || ''
    };
  }
}

function getModifiedFiles() {
  try {
    // Get files that are staged or modified (not committed yet)
    const stagedFiles = execSync('git diff --cached --name-only --diff-filter=ACM', { 
      encoding: 'utf8', 
      cwd: PROJECT_ROOT 
    }).trim().split('\n').filter(f => f);
    
    const modifiedFiles = execSync('git diff --name-only --diff-filter=ACM', { 
      encoding: 'utf8', 
      cwd: PROJECT_ROOT 
    }).trim().split('\n').filter(f => f);
    
    // Combine and deduplicate
    const allFiles = [...new Set([...stagedFiles, ...modifiedFiles])];
    
    // Filter for TypeScript/JavaScript files in entire project (excluding node_modules)
    return allFiles.filter(file => {
      return !file.includes('node_modules/') && 
             !file.includes('.git/') &&
             /\.(ts|tsx|js|jsx)$/.test(file) &&
             fs.existsSync(path.join(PROJECT_ROOT, file));
    });
  } catch (error) {
    // If git commands fail, fall back to checking all files
    console.log('⚠️ Could not determine modified files, checking entire project' + error);
    return null;
  }
}

function main() {
  console.log('🚀 Running post-tool quality checks...');
  
  const modifiedFiles = getModifiedFiles();
  
  if (modifiedFiles && modifiedFiles.length === 0) {
    console.log('✅ No TypeScript/JavaScript files modified in project, skipping checks');
    return;
  }
  
  if (modifiedFiles && modifiedFiles.length > 0) {
    console.log(`📁 Checking ${modifiedFiles.length} modified file(s):`, modifiedFiles.map(f => path.basename(f)).join(', '));
  }

  // TypeScript check - check only modified TypeScript files
  const typescriptModifiedFiles = modifiedFiles ? modifiedFiles.filter(f => /\.tsx?$/.test(f)) : [];
  
  if (typescriptModifiedFiles.length > 0) {
    console.log(`📁 Checking TypeScript for ${typescriptModifiedFiles.length} modified file(s): ${typescriptModifiedFiles.map(f => path.basename(f)).join(', ')}`);
    
    // Check TypeScript by running tsc with --noEmit on specific files
    // We need to find the appropriate tsconfig for each file
    const allPackages = ['packages/backend', 'packages/contracts', 'packages/types', 'packages/ui', 'apps/mobile', 'apps/landing'];
    const packageFileMap = new Map();
    
    // Group files by package
    for (const file of typescriptModifiedFiles) {
      const pkg = allPackages.find(p => file.startsWith(p + '/'));
      if (pkg) {
        if (!packageFileMap.has(pkg)) {
          packageFileMap.set(pkg, []);
        }
        packageFileMap.get(pkg).push(file);
      }
    }
    
    let hasErrors = false;
    
    // Check each package's files
    for (const [pkg, files] of packageFileMap.entries()) {
      const tsconfigPath = path.join(PROJECT_ROOT, pkg, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        const relativeFiles = files.map(f => f.replace(pkg + '/', '')).join(' ');
        console.log(`🔍 Checking TypeScript in ${pkg} for: ${files.map(f => path.basename(f)).join(', ')}`);
        
        const tscResult = runCommand(
          `cd ${pkg} && npx tsc --noEmit --skipLibCheck ${relativeFiles}`,
          `TypeScript compilation for specific files in ${pkg}`
        );
        
        if (!tscResult.success) {
          console.error(`❌ TypeScript errors found in ${pkg}:`);
          console.error(tscResult.output);
          hasErrors = true;
        }
      }
    }
    
    if (hasErrors) {
      console.error('\n🚫 BLOCKING: Please fix TypeScript errors before continuing.');
      process.exit(2);
    }
  } else if (!modifiedFiles) {
    // Fallback: check all packages if we can't determine modified files
    console.log('⚠️ Cannot determine modified files, checking all packages...');
    const allPackages = ['packages/backend', 'packages/contracts', 'packages/types', 'packages/ui', 'apps/mobile', 'apps/landing'];
    let hasErrors = false;
    
    for (const pkg of allPackages) {
      const tsconfigPath = path.join(PROJECT_ROOT, pkg, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        console.log(`🔍 Checking TypeScript in ${pkg}...`);
        const tscResult = runCommand(
          `cd ${pkg} && npx tsc --noEmit --skipLibCheck`,
          `TypeScript compilation in ${pkg}`
        );
        
        if (!tscResult.success) {
          console.error(`❌ TypeScript errors found in ${pkg}:`);
          console.error(tscResult.output);
          hasErrors = true;
        }
      }
    }
    
    if (hasErrors) {
      console.error('\n🚫 BLOCKING: Please fix TypeScript errors before continuing.');
      process.exit(2);
    }
  } else {
    console.log('📝 TypeScript: Skipped (no .ts/.tsx files modified)');
  }
  
  // ESLint check - only on modified files
  if (modifiedFiles && modifiedFiles.length > 0) {
    const fileList = modifiedFiles.join(' ');
    const eslintResult = runCommand(
      `npx eslint ${fileList} --max-warnings 0`,
      `ESLint on modified files`
    );
    
    if (!eslintResult.success) {
      console.error('❌ ESLint errors found:');
      console.error(eslintResult.output);
      console.error('\n🚫 BLOCKING: Please fix ESLint errors before continuing.');
      process.exit(2);
    }
  } else if (modifiedFiles === null) {
    // Fallback to checking all TypeScript/JavaScript files in the project
    const eslintResult = runCommand(
      'npx eslint "**/*.{ts,tsx,js,jsx}" --ignore-pattern "node_modules/**" --ignore-pattern "dist/**" --ignore-pattern "build/**" --max-warnings 0',
      'ESLint validation (fallback - entire project)'
    );
    
    if (!eslintResult.success) {
      console.error('❌ ESLint errors found:');
      console.error(eslintResult.output);
      console.error('\n🚫 BLOCKING: Please fix ESLint errors before continuing.');
      process.exit(2);
    }
  }
  
  console.log('✅ All quality checks passed!');
  if (typescriptModifiedFiles.length > 0 || !modifiedFiles) {
    const checkedPackages = modifiedFiles ? 
      [...new Set(typescriptModifiedFiles.map(file => {
        const allPackages = ['packages/backend', 'packages/contracts', 'packages/types', 'packages/ui', 'apps/mobile', 'apps/landing'];
        return allPackages.find(p => file.startsWith(p + '/'));
      }).filter(Boolean))] : 
      ['packages/backend', 'packages/types', 'packages/ui', 'apps/mobile', 'apps/landing'];
    console.log(`📝 TypeScript: No errors in ${checkedPackages.length} package(s)`);
  }
  console.log('📝 ESLint: No errors or warnings');
}

if (require.main === module) {
  main();
}