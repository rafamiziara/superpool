#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

class DevEnvironment {
  constructor() {
    this.processes = [];
    this.ngrokUrls = {};
    this.isShuttingDown = false;
    
    // Setup cleanup on exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('exit', () => this.cleanup());
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const colors = {
      info: '\x1b[36m',      // Cyan
      success: '\x1b[32m',   // Green
      warning: '\x1b[33m',   // Yellow
      error: '\x1b[31m',     // Red
      reset: '\x1b[0m'       // Reset
    };
    
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async checkPrerequisites() {
    this.log('Checking prerequisites...');
    
    const checks = [
      { command: 'firebase --version', name: 'Firebase CLI' },
      { command: 'ngrok version', name: 'Ngrok' },
      { command: 'pnpm --version', name: 'PNPM' }
    ];

    for (const check of checks) {
      try {
        await this.execAsync(check.command);
        this.log(`✓ ${check.name} is installed`, 'success');
      } catch (error) {
        this.log(`✗ ${check.name} is not installed or not in PATH`, 'error');
        throw new Error(`Missing prerequisite: ${check.name}`);
      }
    }
  }

  execAsync(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }

  spawnProcess(command, args, options = {}) {
    const proc = spawn(command, args, {
      stdio: options.silent ? 'pipe' : 'inherit',
      shell: true,
      ...options
    });

    this.processes.push(proc);
    return proc;
  }

  async startFirebaseEmulators() {
    this.log('Starting Firebase Emulators...');
    
    const firebaseProc = this.spawnProcess('firebase', ['emulators:start', '--config-dir', './config'], {
      cwd: process.cwd()
    });

    // Wait for emulators to be ready
    this.log('Waiting for Firebase Emulators to start...');
    
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds
    
    while (attempts < maxAttempts) {
      try {
        // Check if Auth emulator is ready
        await this.checkPort(9099);
        // Check if Functions emulator is ready  
        await this.checkPort(5001);
        // Check if Firestore emulator is ready
        await this.checkPort(8080);
        
        this.log('Firebase Emulators are ready!', 'success');
        break;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error('Firebase Emulators failed to start within 30 seconds');
        }
        await this.sleep(1000);
      }
    }

    return firebaseProc;
  }

  async checkPort(port) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: port,
        method: 'GET',
        timeout: 1000
      }, (res) => {
        resolve(true);
      });

      req.on('error', reject);
      req.on('timeout', reject);
      req.end();
    });
  }

  async startNgrok() {
    this.log('Starting Ngrok tunnels...');
    
    const ngrokProc = this.spawnProcess('ngrok', ['start', '--all', '--config', './config/ngrok.yml'], {
      silent: true
    });

    // Wait for ngrok to establish tunnels
    this.log('Waiting for Ngrok tunnels to establish...');
    await this.sleep(5000);

    // Get tunnel URLs from ngrok API
    await this.fetchNgrokUrls();
    
    this.log('Ngrok tunnels established!', 'success');
    Object.entries(this.ngrokUrls).forEach(([service, url]) => {
      this.log(`  ${service}: ${url}`, 'info');
    });

    return ngrokProc;
  }

  async fetchNgrokUrls() {
    try {
      const response = await this.httpGet('http://localhost:4040/api/tunnels');
      const data = JSON.parse(response);
      
      // Map tunnels by their local port to service names
      const portToService = {
        '9099': 'auth',
        '5001': 'functions', 
        '8080': 'firestore'
      };

      data.tunnels.forEach(tunnel => {
        const localPort = tunnel.config.addr.split(':').pop();
        const serviceName = portToService[localPort];
        
        if (serviceName && tunnel.public_url.startsWith('https://')) {
          // Extract just the domain part for the URLs
          const urlParts = tunnel.public_url.replace('https://', '').split('/');
          this.ngrokUrls[serviceName] = urlParts[0];
        }
      });

    } catch (error) {
      this.log('Failed to fetch ngrok URLs from API, will use placeholder values', 'warning');
      // Fallback to placeholder values that user can update manually
      this.ngrokUrls = {
        auth: 'your-auth-tunnel.ngrok-free.app',
        functions: 'your-functions-tunnel.ngrok-free.app',
        firestore: 'your-firestore-tunnel.ngrok-free.app'
      };
    }
  }

  httpGet(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  async updateEnvironmentFile() {
    this.log('Updating mobile app environment variables...');
    
    const envPath = path.join(process.cwd(), 'apps', 'mobile', '.env');
    
    if (!fs.existsSync(envPath)) {
      this.log('Environment file not found, creating from template...', 'warning');
      return;
    }

    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update ngrok URLs
    envContent = envContent.replace(
      /EXPO_PUBLIC_NGROK_URL_AUTH="[^"]*"/,
      `EXPO_PUBLIC_NGROK_URL_AUTH="https://${this.ngrokUrls.auth}"`
    );
    
    envContent = envContent.replace(
      /EXPO_PUBLIC_NGROK_URL_FUNCTIONS="[^"]*"/,
      `EXPO_PUBLIC_NGROK_URL_FUNCTIONS="${this.ngrokUrls.functions}"`
    );
    
    envContent = envContent.replace(
      /EXPO_PUBLIC_NGROK_URL_FIRESTORE="[^"]*"/,
      `EXPO_PUBLIC_NGROK_URL_FIRESTORE="${this.ngrokUrls.firestore}"`
    );
    
    // Update Cloud Functions URL - only replace the ngrok domain, preserve project ID and zone
    envContent = envContent.replace(
      /EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL="http:\/\/[^\/]+\/(.*?)"/,
      `EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL="http://${this.ngrokUrls.functions}/$1"`
    );

    fs.writeFileSync(envPath, envContent);
    this.log('Environment file updated successfully!', 'success');
  }

  async startExpoApp() {
    this.log('Starting Expo development server...');
    
    const expoProc = this.spawnProcess('pnpm', ['start'], {
      cwd: path.join(process.cwd(), 'apps', 'mobile')
    });

    this.log('Expo development server started!', 'success');
    return expoProc;
  }

  async cleanup() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.log('Shutting down development environment...', 'warning');

    // Kill all spawned processes
    this.processes.forEach((proc, index) => {
      if (!proc.killed) {
        this.log(`Terminating process ${index + 1}...`);
        proc.kill('SIGTERM');
      }
    });

    // Wait a bit for graceful shutdown
    await this.sleep(2000);

    // Force kill if still running
    this.processes.forEach((proc, index) => {
      if (!proc.killed) {
        this.log(`Force killing process ${index + 1}...`);
        proc.kill('SIGKILL');
      }
    });

    this.log('Development environment stopped.', 'success');
    process.exit(0);
  }

  async start() {
    try {
      this.log('🚀 Starting SuperPool Development Environment', 'success');
      this.log('');

      await this.checkPrerequisites();
      this.log('');

      await this.startFirebaseEmulators();
      this.log('');

      await this.startNgrok();
      this.log('');

      await this.updateEnvironmentFile();
      this.log('');

      await this.startExpoApp();
      this.log('');

      this.log('🎉 Development environment is ready!', 'success');
      this.log('');
      this.log('Available services:');
      this.log(`  Firebase Auth Emulator: http://localhost:9099`);
      this.log(`  Firebase Functions Emulator: http://localhost:5001`);
      this.log(`  Firebase Firestore Emulator: http://localhost:8080`);
      this.log(`  Firebase Emulator UI: http://localhost:4000`);
      this.log('');
      this.log('Ngrok Tunnels:');
      Object.entries(this.ngrokUrls).forEach(([service, url]) => {
        this.log(`  ${service.charAt(0).toUpperCase() + service.slice(1)}: https://${url}`);
      });
      this.log('');
      this.log('Press Ctrl+C to stop all services');

    } catch (error) {
      this.log(`Failed to start development environment: ${error.message}`, 'error');
      await this.cleanup();
      process.exit(1);
    }
  }
}

// Start the development environment
const devEnv = new DevEnvironment();
devEnv.start();