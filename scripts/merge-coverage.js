#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Paths
const rootDir = process.cwd();
const coverageDir = path.join(rootDir, 'coverage');
const mergedDir = path.join(coverageDir, 'merged');
const tempDir = path.join(coverageDir, '.nyc_output');

// Create directories
if (!fs.existsSync(mergedDir)) {
  fs.mkdirSync(mergedDir, { recursive: true });
}
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

console.log('📊 Merging coverage reports...');

// Find all lcov.info files (excluding merged directory to avoid recursion)
const lcovFiles = [];
const findLcovFiles = (dir) => {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory() && item.name !== 'merged' && item.name !== '.nyc_output') {
      findLcovFiles(path.join(dir, item.name));
    } else if (item.name === 'lcov.info') {
      lcovFiles.push(path.join(dir, item.name));
    }
  }
};

findLcovFiles(coverageDir);

console.log(`📁 Found ${lcovFiles.length} LCOV files:`);
lcovFiles.forEach(file => {
  console.log(`   - ${path.relative(rootDir, file)}`);
});

if (lcovFiles.length === 0) {
  console.log('❌ No LCOV files found. Run coverage tests first.');
  process.exit(1);
}

// Merge LCOV files using lcov-result-merger if available, otherwise manual merge
try {
  // Try to use genhtml from lcov package if available
  try {
    const lcovMerged = path.join(mergedDir, 'lcov.info');
    
    // Simple concatenation for LCOV files (works for most cases)
    let mergedContent = '';
    lcovFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      mergedContent += content + '\n';
    });
    
    fs.writeFileSync(lcovMerged, mergedContent);
    
    // Generate HTML report using genhtml if available
    try {
      execSync(`genhtml --output-directory "${mergedDir}" --title "SuperPool Coverage Report" "${lcovMerged}"`, { stdio: 'inherit' });
      console.log('✅ HTML coverage report generated using genhtml');
    } catch (error) {
      console.log('⚠️  genhtml not available, using basic merge');
      
      // Parse LCOV files to get coverage metrics
      const parseLcovFile = (filePath) => {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          let totalLines = 0, coveredLines = 0, totalFunctions = 0, coveredFunctions = 0, totalBranches = 0, coveredBranches = 0;
          
          const lines = content.split('\n');
          for (const line of lines) {
            if (line.startsWith('LF:')) totalLines += parseInt(line.split(':')[1]);
            if (line.startsWith('LH:')) coveredLines += parseInt(line.split(':')[1]);
            if (line.startsWith('FNF:')) totalFunctions += parseInt(line.split(':')[1]);
            if (line.startsWith('FNH:')) coveredFunctions += parseInt(line.split(':')[1]);
            if (line.startsWith('BRF:')) totalBranches += parseInt(line.split(':')[1]);
            if (line.startsWith('BRH:')) coveredBranches += parseInt(line.split(':')[1]);
          }
          
          return {
            lines: { total: totalLines, covered: coveredLines, percent: totalLines ? (coveredLines / totalLines * 100).toFixed(1) : 0 },
            functions: { total: totalFunctions, covered: coveredFunctions, percent: totalFunctions ? (coveredFunctions / totalFunctions * 100).toFixed(1) : 0 },
            branches: { total: totalBranches, covered: coveredBranches, percent: totalBranches ? (coveredBranches / totalBranches * 100).toFixed(1) : 0 }
          };
        } catch (error) {
          return { lines: { total: 0, covered: 0, percent: 0 }, functions: { total: 0, covered: 0, percent: 0 }, branches: { total: 0, covered: 0, percent: 0 } };
        }
      };

      // Get coverage metrics for each package
      const backendCoverage = parseLcovFile(path.join(coverageDir, 'backend', 'lcov.info'));
      const mobileCoverage = parseLcovFile(path.join(coverageDir, 'mobile', 'lcov.info'));
      const contractsCoverage = parseLcovFile(path.join(coverageDir, 'contracts', 'lcov.info'));
      
      // Calculate overall metrics
      const totalLines = backendCoverage.lines.total + mobileCoverage.lines.total + contractsCoverage.lines.total;
      const totalCoveredLines = backendCoverage.lines.covered + mobileCoverage.lines.covered + contractsCoverage.lines.covered;
      const totalFunctions = backendCoverage.functions.total + mobileCoverage.functions.total + contractsCoverage.functions.total;
      const totalCoveredFunctions = backendCoverage.functions.covered + mobileCoverage.functions.covered + contractsCoverage.functions.covered;
      const totalBranches = backendCoverage.branches.total + mobileCoverage.branches.total + contractsCoverage.branches.total;
      const totalCoveredBranches = backendCoverage.branches.covered + mobileCoverage.branches.covered + contractsCoverage.branches.covered;
      
      const overallCoverage = {
        lines: { total: totalLines, covered: totalCoveredLines, percent: totalLines ? (totalCoveredLines / totalLines * 100).toFixed(1) : 0 },
        functions: { total: totalFunctions, covered: totalCoveredFunctions, percent: totalFunctions ? (totalCoveredFunctions / totalFunctions * 100).toFixed(1) : 0 },
        branches: { total: totalBranches, covered: totalCoveredBranches, percent: totalBranches ? (totalCoveredBranches / totalBranches * 100).toFixed(1) : 0 }
      };

      // Create enhanced dashboard with metrics and progress bars
      const indexHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>SuperPool - Coverage Dashboard</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; padding: 20px; background: #f8fafc; color: #334155;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; text-align: center;
        }
        .header h1 { margin: 0 0 10px 0; font-size: 2.5em; font-weight: 300; }
        .header p { margin: 5px 0; opacity: 0.9; }
        
        .overall-stats { 
            display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 20px; margin-bottom: 30px;
        }
        .stat-card { 
            background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center; border-top: 4px solid #667eea;
        }
        .stat-value { font-size: 2.5em; font-weight: bold; margin: 10px 0; }
        .stat-label { color: #64748b; font-size: 0.9em; }
        
        .packages { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 25px; }
        .package { 
            background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); 
            overflow: hidden; transition: transform 0.2s;
        }
        .package:hover { transform: translateY(-2px); }
        .package-header { 
            padding: 20px; background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); 
            border-bottom: 1px solid #e2e8f0;
        }
        .package-title { margin: 0; color: #1e293b; display: flex; align-items: center; gap: 10px; }
        .package-content { padding: 20px; }
        
        .metric-row { display: flex; justify-content: space-between; align-items: center; margin: 15px 0; }
        .metric-label { font-weight: 500; color: #475569; }
        .metric-value { font-weight: bold; }
        
        .progress-bar { 
            height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin: 8px 0;
        }
        .progress-fill { height: 100%; transition: width 0.3s; }
        .progress-excellent { background: linear-gradient(90deg, #10b981, #059669); }
        .progress-good { background: linear-gradient(90deg, #3b82f6, #1d4ed8); }
        .progress-fair { background: linear-gradient(90deg, #f59e0b, #d97706); }
        .progress-poor { background: linear-gradient(90deg, #ef4444, #dc2626); }
        
        .links { margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0; }
        .btn { 
            display: inline-block; padding: 8px 16px; background: #667eea; color: white; 
            text-decoration: none; border-radius: 6px; font-size: 0.9em; margin-right: 10px;
            transition: background 0.2s;
        }
        .btn:hover { background: #5a67d8; }
        .btn-outline { background: transparent; border: 1px solid #667eea; color: #667eea; }
        .btn-outline:hover { background: #667eea; color: white; }
        
        .footer { margin-top: 40px; text-align: center; color: #64748b; font-size: 0.9em; }
        
        @media (max-width: 768px) {
            .packages { grid-template-columns: 1fr; }
            .overall-stats { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏊‍♂️ SuperPool Coverage Dashboard</h1>
            <p>Comprehensive test coverage across the entire monorepo</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="overall-stats">
            <div class="stat-card">
                <div class="stat-value" style="color: #10b981">${overallCoverage.lines.percent}%</div>
                <div class="stat-label">Overall Lines</div>
                <small>${overallCoverage.lines.covered}/${overallCoverage.lines.total}</small>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: #3b82f6">${overallCoverage.functions.percent}%</div>
                <div class="stat-label">Overall Functions</div>
                <small>${overallCoverage.functions.covered}/${overallCoverage.functions.total}</small>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: #f59e0b">${overallCoverage.branches.percent}%</div>
                <div class="stat-label">Overall Branches</div>
                <small>${overallCoverage.branches.covered}/${overallCoverage.branches.total}</small>
            </div>
        </div>
        
        <div class="packages">
            <div class="package">
                <div class="package-header">
                    <h3 class="package-title">📦 Backend (Firebase Functions)</h3>
                </div>
                <div class="package-content">
                    <div class="metric-row">
                        <span class="metric-label">Lines Coverage</span>
                        <span class="metric-value">${backendCoverage.lines.percent}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill progress-${backendCoverage.lines.percent >= 90 ? 'excellent' : backendCoverage.lines.percent >= 70 ? 'good' : backendCoverage.lines.percent >= 50 ? 'fair' : 'poor'}" 
                             style="width: ${backendCoverage.lines.percent}%"></div>
                    </div>
                    
                    <div class="metric-row">
                        <span class="metric-label">Functions Coverage</span>
                        <span class="metric-value">${backendCoverage.functions.percent}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill progress-${backendCoverage.functions.percent >= 90 ? 'excellent' : backendCoverage.functions.percent >= 70 ? 'good' : backendCoverage.functions.percent >= 50 ? 'fair' : 'poor'}" 
                             style="width: ${backendCoverage.functions.percent}%"></div>
                    </div>
                    
                    <div class="metric-row">
                        <span class="metric-label">Branches Coverage</span>
                        <span class="metric-value">${backendCoverage.branches.percent}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill progress-${backendCoverage.branches.percent >= 90 ? 'excellent' : backendCoverage.branches.percent >= 70 ? 'good' : backendCoverage.branches.percent >= 50 ? 'fair' : 'poor'}" 
                             style="width: ${backendCoverage.branches.percent}%"></div>
                    </div>
                    
                    <div class="links">
                        <a href="../backend/lcov-report/index.html" class="btn">📊 View Detailed Report</a>
                    </div>
                </div>
            </div>
            
            <div class="package">
                <div class="package-header">
                    <h3 class="package-title">📱 Mobile (React Native)</h3>
                </div>
                <div class="package-content">
                    <div class="metric-row">
                        <span class="metric-label">Lines Coverage</span>
                        <span class="metric-value">${mobileCoverage.lines.percent}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill progress-${mobileCoverage.lines.percent >= 90 ? 'excellent' : mobileCoverage.lines.percent >= 70 ? 'good' : mobileCoverage.lines.percent >= 50 ? 'fair' : 'poor'}" 
                             style="width: ${mobileCoverage.lines.percent}%"></div>
                    </div>
                    
                    <div class="metric-row">
                        <span class="metric-label">Functions Coverage</span>
                        <span class="metric-value">${mobileCoverage.functions.percent}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill progress-${mobileCoverage.functions.percent >= 90 ? 'excellent' : mobileCoverage.functions.percent >= 70 ? 'good' : mobileCoverage.functions.percent >= 50 ? 'fair' : 'poor'}" 
                             style="width: ${mobileCoverage.functions.percent}%"></div>
                    </div>
                    
                    <div class="metric-row">
                        <span class="metric-label">Branches Coverage</span>
                        <span class="metric-value">${mobileCoverage.branches.percent}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill progress-${mobileCoverage.branches.percent >= 90 ? 'excellent' : mobileCoverage.branches.percent >= 70 ? 'good' : mobileCoverage.branches.percent >= 50 ? 'fair' : 'poor'}" 
                             style="width: ${mobileCoverage.branches.percent}%"></div>
                    </div>
                    
                    <div class="links">
                        <a href="../mobile/lcov-report/index.html" class="btn">📊 View Detailed Report</a>
                    </div>
                </div>
            </div>
            
            <div class="package">
                <div class="package-header">
                    <h3 class="package-title">🔗 Smart Contracts</h3>
                </div>
                <div class="package-content">
                    ${contractsCoverage.lines.total > 0 ? `
                    <div class="metric-row">
                        <span class="metric-label">Lines Coverage</span>
                        <span class="metric-value">${contractsCoverage.lines.percent}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill progress-${contractsCoverage.lines.percent >= 90 ? 'excellent' : contractsCoverage.lines.percent >= 70 ? 'good' : contractsCoverage.lines.percent >= 50 ? 'fair' : 'poor'}" 
                             style="width: ${contractsCoverage.lines.percent}%"></div>
                    </div>
                    
                    <div class="metric-row">
                        <span class="metric-label">Functions Coverage</span>
                        <span class="metric-value">${contractsCoverage.functions.percent}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill progress-${contractsCoverage.functions.percent >= 90 ? 'excellent' : contractsCoverage.functions.percent >= 70 ? 'good' : contractsCoverage.functions.percent >= 50 ? 'fair' : 'poor'}" 
                             style="width: ${contractsCoverage.functions.percent}%"></div>
                    </div>
                    
                    <div class="metric-row">
                        <span class="metric-label">Branches Coverage</span>
                        <span class="metric-value">${contractsCoverage.branches.percent}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill progress-${contractsCoverage.branches.percent >= 90 ? 'excellent' : contractsCoverage.branches.percent >= 70 ? 'good' : contractsCoverage.branches.percent >= 50 ? 'fair' : 'poor'}" 
                             style="width: ${contractsCoverage.branches.percent}%"></div>
                    </div>
                    ` : `
                    <p style="color: #64748b; margin: 15px 0;">Contract coverage will be displayed after running tests.</p>
                    <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px; margin: 15px 0;">
                        <strong>💡 To generate contract coverage:</strong><br>
                        <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">pnpm test:contracts:coverage</code>
                    </div>
                    `}
                    
                    <div class="links">
                        <a href="../contracts/index.html" class="btn">📊 View Contract Report</a>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>📈 SuperPool Coverage Dashboard • <a href="lcov.info" style="color: #667eea;">Download LCOV Data</a></p>
            <p>Run <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px;">pnpm test:coverage</code> to update this report</p>
        </div>
    </div>
</body>
</html>`;
      
      fs.writeFileSync(path.join(mergedDir, 'index.html'), indexHtml);
      console.log('✅ Basic merged coverage dashboard created');
      
      // Add "Go Home" buttons to individual package reports
      addGoHomeButtons();
    }
    
  } catch (error) {
    console.error('❌ Error generating merged coverage:', error.message);
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ Error merging coverage:', error.message);
  process.exit(1);
}

// Function to add "Go Home" buttons to individual coverage reports
function addGoHomeButtons() {
  const packages = ['backend', 'mobile', 'contracts'];
  
  packages.forEach(packageName => {
    const packageCoverageDir = path.join(coverageDir, packageName);
    let baseDir;
    
    // Determine the correct base directory for each package
    if (packageName === 'contracts') {
      baseDir = packageCoverageDir;
    } else {
      baseDir = path.join(packageCoverageDir, 'lcov-report');
    }
    
    if (fs.existsSync(baseDir)) {
      // Recursively process all HTML files in the coverage directory
      processHTMLFiles(baseDir, packageName);
    }
  });
}

// Recursive function to process all HTML files in a directory
function processHTMLFiles(dir, packageName) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    
    if (item.isDirectory()) {
      // Recursively process subdirectories
      processHTMLFiles(fullPath, packageName);
    } else if (item.name.endsWith('.html')) {
      // Process HTML file
      processHTMLFile(fullPath, packageName, dir);
    }
  }
}

// Function to process a single HTML file
function processHTMLFile(htmlPath, packageName) {
  try {
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Skip if already processed
    if (htmlContent.includes('superpool-home-btn')) {
      // Remove existing CSS block
      htmlContent = htmlContent.replace(/<style>[\s\S]*?superpool[\s\S]*?<\/style>/g, '');
      // Remove existing button
      htmlContent = htmlContent.replace(/<a[^>]*superpool-home-btn[^>]*>[\s\S]*?<\/a>/g, '');
      // Remove existing header
      htmlContent = htmlContent.replace(/<div[^>]*superpool-header[^>]*>[\s\S]*?<\/div>/g, '');
    }
    
    // Calculate relative path back to merged dashboard
    const relativePath = calculateRelativePath(htmlPath, packageName);
    const packageTitle = packageName.charAt(0).toUpperCase() + packageName.slice(1);
    const isContractsPage = packageName === 'contracts';
    
    // Determine page title based on file path
    const fileName = path.basename(htmlPath, '.html');
    const pageTitle = fileName === 'index' ? `${packageTitle} Coverage Report` : 
      `${packageTitle}: ${fileName.replace(/[_-]/g, ' ')}`;
        
    const buttonCSS = `
<style>
.superpool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 30px;
  padding-bottom: 20px;
}
.superpool-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}
.superpool-home-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}
.superpool-home-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
  color: white;
  text-decoration: none;
}
.superpool-home-btn:active {
  transform: translateY(0);
}
/* Enhanced styling for coverage reports */
body {
  margin: 0 !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}
/* Universal styling for all coverage reports */
.wrapper, .bar {
  max-width: 1200px !important;
  margin: 0 auto !important;
  padding: 0 20px !important;
}
.pad1 {
  padding: 30px !important;
}
.coverage-summary, table {
  margin: 20px 0 !important;
  border-radius: 8px !important;
  overflow: hidden !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
}
h1, h2 {
  font-size: 2rem !important;
  margin-bottom: 30px !important;
}
/* Ensure proper spacing after header */
.superpool-header + * {
  margin-top: 20px !important;
}
.superpool-header + .pad1 {
  padding-top: 10px !important;
}
.footer {
  margin-top: 40px !important;
  padding: 20px !important;
  text-align: center !important;
}
</style>`;

    // Home button HTML with calculated relative path and proper header structure
    const headerHTML = `
<div class="superpool-header">
  <h2 class="superpool-title">📊 ${pageTitle}</h2>
  <a href="${relativePath}" class="superpool-home-btn">
    🏊‍♂️ SuperPool Dashboard
  </a>
</div>`;
    
    // Insert CSS before </head>
    htmlContent = htmlContent.replace('</head>', buttonCSS + '\n</head>');
    
    // Insert header structure inside the appropriate container for alignment
    if (isContractsPage) {
      // For contracts (solcover), insert inside the wrapper/bar container
      const wrapperMatch = htmlContent.match(/<div class=['"]wrapper['"]>\s*<div class=['"]pad1['"]>/);
      if (wrapperMatch) {
        htmlContent = htmlContent.replace(wrapperMatch[0], wrapperMatch[0] + '\n' + headerHTML);
      } else {
        // Fallback: insert after body tag
        if (htmlContent.includes('<body>')) {
          htmlContent = htmlContent.replace('<body>', '<body>' + headerHTML);
        }
      }
    } else {
      // For Jest reports, insert inside the wrapper container after pad1 div opens
      const wrapperMatch = htmlContent.match(/<div class=['"]wrapper['"]>\s*<div class=['"]pad1['"]>/);
      if (wrapperMatch) {
        htmlContent = htmlContent.replace(wrapperMatch[0], wrapperMatch[0] + '\n' + headerHTML);
        
        // Remove any existing h1 that might conflict
        const h1Match = htmlContent.match(/<h1[^>]*>.*?<\/h1>/);
        if (h1Match) {
          htmlContent = htmlContent.replace(h1Match[0], '');
        }
      } else {
        // Fallback: replace h1 or insert after body
        const h1Match = htmlContent.match(/<h1[^>]*>.*?<\/h1>/);
        if (h1Match) {
          htmlContent = htmlContent.replace(h1Match[0], headerHTML);
        } else {
          if (htmlContent.includes('<body>')) {
            htmlContent = htmlContent.replace('<body>', '<body>' + headerHTML);
          }
        }
      }
    }
    
    fs.writeFileSync(htmlPath, htmlContent);
    
  } catch (error) {
    console.log(`⚠️  Could not process ${htmlPath}: ${error.message}`);
  }
}

// Helper function to calculate relative path back to merged dashboard
function calculateRelativePath(htmlPath) {
  // Calculate relative path from HTML file to the coverage/merged/index.html
  const mergedPath = path.join(coverageDir, 'merged', 'index.html');
  const relativePath = path.relative(path.dirname(htmlPath), path.dirname(mergedPath));
  
  // Normalize path separators for web URLs
  const webPath = relativePath.replace(/\\/g, '/');
  
  // Add the final file name
  return webPath + '/index.html';
}

console.log(`📈 Merged coverage report available at: ${path.relative(rootDir, path.join(mergedDir, 'index.html'))}`);
console.log('📊 Run \'pnpm run coverage:open\' to view in browser');