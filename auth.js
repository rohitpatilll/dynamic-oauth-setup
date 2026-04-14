#!/usr/bin/env node
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import http from "http";
import url from "url";
import open from "open";
import fetch from "node-fetch";

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}i ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}v ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}! ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}x ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.blue}> ${msg}${colors.reset}`),
  title: (msg) => console.log(`${colors.bright}${colors.magenta}\n${msg}${colors.reset}`),
  divider: () => console.log(`${colors.cyan}${'-'.repeat(60)}${colors.reset}`)
};

const PLATFORMS_CONFIG_PATH = path.join(process.cwd(), "platforms.json");

let PROVIDER = "";
let SERVICE = "";
let PROVIDER_CONFIG = {};
let SERVICE_CONFIG = {};
let CLIENT_CONFIG = {};

function showBanner() {
  console.clear();
  log.title(`DYNAMIC OAUTH AUTHENTICATION GENERATOR`);
  log.divider();
  log.info(`Provider: ${PROVIDER.toUpperCase()}`);
  log.info(`Service: ${SERVICE.toUpperCase()}`);
  log.divider();
}

function loadPlatformsConfig() {
  log.step("Loading platforms configuration...");
  try {
    const configContent = fs.readFileSync(PLATFORMS_CONFIG_PATH, "utf-8");
    return JSON.parse(configContent);
  } catch (error) {
    log.error(`Failed to load platforms config: ${error.message}`);
    process.exit(1);
  }
}

function validateAndLoadConfig(platformsData, provider, service) {
  log.step("Validating configuration...");

  if (!platformsData[provider]) {
    log.error(`Provider '${provider}' not found in platforms.json`);
    log.error(`Available providers: ${Object.keys(platformsData).join(", ")}`);
    process.exit(1);
  }

  const providerConfig = platformsData[provider];

  if (!providerConfig.services[service]) {
    log.error(`Service '${service}' not found for provider '${provider}'`);
    log.error(`Available services: ${Object.keys(providerConfig.services).join(", ")}`);
    process.exit(1);
  }

  log.success("Configuration validated");
  return [providerConfig, providerConfig.services[service], providerConfig.web];
}

function checkClientConfig() {
  log.step("Checking OAuth client configuration...");

  if (!CLIENT_CONFIG.client_id || CLIENT_CONFIG.client_id.includes("YOUR_")) {
    log.error("OAuth credentials not configured!");
    log.error(`Please update platforms.json with your ${PROVIDER} OAuth credentials`);
    log.error(`Client ID: ${CLIENT_CONFIG.client_id}`);
    process.exit(1);
  }

  log.success("OAuth credentials found");
}

function displayAuthInfo() {
  log.divider();
  log.title("AUTHENTICATION PROCESS");
  log.info("You will be asked to sign in with your account");
  log.info("Please grant the following permissions:");

  if (SERVICE_CONFIG.scopes && SERVICE_CONFIG.scopes.length > 0) {
    SERVICE_CONFIG.scopes.forEach(scope => {
      const scopeName = scope.split('/').pop() || scope;
      log.info(`  • ${scopeName}`);
    });
  } else {
    log.info("  • Default permissions");
  }

  log.divider();
  log.warning("IMPORTANT NOTES:");
  log.warning("  • Use YOUR account");
  log.warning("  • This creates credentials for YOUR account only");
  log.warning("  • Credentials stay on YOUR computer only");
  log.divider();

  return new Promise((resolve) => {
    process.stdout.write(`${colors.yellow}Ready to authenticate? Press ENTER to continue or Ctrl+C to cancel...${colors.reset}`);
    process.stdin.once('data', () => {
      resolve(true);
    });
  });
}

async function performAuthentication() {
  log.step("Starting authentication...");
  try {
    if (PROVIDER === 'google') {
      return await performGoogleAuth();
    } else {
      return await performGenericOAuth2();
    }
  } catch (error) {
    log.error(`Authentication failed: ${error.message}`);
    throw error;
  }
}

async function performGoogleAuth() {
  const oauth2Client = new google.auth.OAuth2(
    CLIENT_CONFIG.client_id,
    CLIENT_CONFIG.client_secret,
    CLIENT_CONFIG.redirect_uris[0]
  );

  log.step("Opening browser for authentication...");
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SERVICE_CONFIG.scopes,
    prompt: 'consent'
  });

  await open(authUrl);
  const code = await getAuthorizationCode();

  const { tokens } = await oauth2Client.getToken(code);
  log.success("Authentication completed successfully!");

  return tokens;
}

async function performGenericOAuth2() {
  log.step("Opening browser for authentication...");

  const scopes = SERVICE_CONFIG.scopes && SERVICE_CONFIG.scopes.length > 0
    ? SERVICE_CONFIG.scopes.join(' ')
    : '';

  let authUrl = `${CLIENT_CONFIG.auth_uri}?` +
    `client_id=${CLIENT_CONFIG.client_id}&` +
    `redirect_uri=${encodeURIComponent(CLIENT_CONFIG.redirect_uris[0])}&` +
    `response_type=code&` +
    (scopes ? `scope=${encodeURIComponent(scopes)}&` : '') +
    `state=randomstate`;

  if (PROVIDER_CONFIG.oauthParams) {
    Object.entries(PROVIDER_CONFIG.oauthParams).forEach(([key, value]) => {
      authUrl += `&${key}=${encodeURIComponent(value)}`;
    });
  }

  await open(authUrl);
  const code = await getAuthorizationCode();

  const tokenBody = {
    grant_type: 'authorization_code',
    client_id: CLIENT_CONFIG.client_id,
    client_secret: CLIENT_CONFIG.client_secret,
    code: code,
    redirect_uri: CLIENT_CONFIG.redirect_uris[0]
  };

  if (PROVIDER_CONFIG.oauthParams) {
    Object.assign(tokenBody, PROVIDER_CONFIG.oauthParams);
  }

  log.info(`Token request to: ${CLIENT_CONFIG.token_uri}`);
  log.info(`Client ID: ${CLIENT_CONFIG.client_id.substring(0, 10)}...`);

  const tokenResponse = await fetch(CLIENT_CONFIG.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokenBody)
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    log.error(`Token response: ${errorText}`);
    throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
  }

  const tokens = await tokenResponse.json();
  log.success("Authentication completed successfully!");

  return tokens;
}

function getAuthorizationCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);
      const code = parsedUrl.query.code;
      const error = parsedUrl.query.error;

      if (error) {
        res.end("Authentication failed. You can close this window.");
        server.close();
        reject(new Error(`Authentication error: ${error}`));
      } else if (code) {
        res.end("Authentication successful! You can close this window and return to the terminal.");
        server.close();
        resolve(code);
      }
    });

    server.listen(3000, () => {
      log.info("Waiting for authorization callback on http://localhost:3000/oauth2callback");
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timeout"));
    }, 300000);
  });
}

function saveCredentials(credentials) {
  log.step("Saving authentication credentials...");
  try {
    const outputPath = path.join(process.cwd(), SERVICE_CONFIG.outputPath);
    fs.writeFileSync(outputPath, JSON.stringify(credentials, null, 2));
    log.success("Credentials saved successfully!");
    return outputPath;
  } catch (error) {
    log.error(`Failed to save credentials: ${error.message}`);
    throw error;
  }
}

async function testCredentials(credentials) {
  log.step("Testing connection...");
  try {
    if (PROVIDER === 'google') {
      return await testGoogleService(credentials);
    } else {
      log.warning("Service-specific testing not yet implemented");
      return { authenticated: true };
    }
  } catch (error) {
    log.error(`Connection test failed: ${error.message}`);
    throw error;
  }
}

async function testGoogleService(credentials) {
  const oauth2Client = new google.auth.OAuth2(
    CLIENT_CONFIG.client_id,
    CLIENT_CONFIG.client_secret,
    CLIENT_CONFIG.redirect_uris[0]
  );
  oauth2Client.setCredentials(credentials);

  switch (SERVICE) {
    case 'gmail':
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const gmailProfile = await gmail.users.getProfile({ userId: 'me' });
      log.info(`Gmail Account: ${gmailProfile.data.emailAddress}`);
      log.info(`Total Messages: ${gmailProfile.data.messagesTotal.toLocaleString()}`);
      return gmailProfile.data;

    case 'drive':
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      const driveAbout = await drive.about.get({ fields: 'user,storageQuota' });
      log.info(`Account: ${driveAbout.data.user.emailAddress}`);
      log.info(`Storage Used: ${(driveAbout.data.storageQuota.usage / (1024 * 1024 * 1024)).toFixed(2)} GB`);
      return driveAbout.data;

    case 'calendar':
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const calendarList = await calendar.calendarList.list({ maxResults: 1 });
      log.info(`Primary Calendar: ${calendarList.data.items[0].summary}`);
      return calendarList.data;

    case 'sheets':
    case 'docs':
    case 'forms':
      log.info(`${SERVICE.charAt(0).toUpperCase() + SERVICE.slice(1)} API authenticated successfully`);
      return { authenticated: true };

    default:
      log.warning(`No specific test available for ${SERVICE}`);
      return { authenticated: true };
  }
}

function displayResults(profile, outputPath) {
  log.divider();
  log.title("AUTHENTICATION COMPLETED!");
  log.divider();
  log.success(`Provider: ${PROVIDER.toUpperCase()}`);
  log.success(`Service: ${SERVICE.toUpperCase()}`);
  log.success(`Credentials File: ${outputPath}`);
  log.divider();
  log.title("NEXT STEPS:");
  log.info("1. Copy the generated credentials file from dynamic-auth/");
  log.info("2. Paste it into your MCP server project directory");
  log.info("3. Your MCP server will now connect to your account!");
  log.divider();
  log.title("TECHNICAL INFO:");
  log.info(`• Access Token: Valid for ~1 hour`);
  log.info(`• Refresh Token: Saved permanently`);
  log.info(`• Provider: ${PROVIDER}`);
  log.info(`• Service: ${SERVICE}`);
  log.info(`• Auto-refresh: Built-in to MCP server`);
  log.divider();
  log.warning("SECURITY REMINDER:");
  log.warning("• Keep credentials file private");
  log.warning("• Never share it with anyone");
  log.warning("• Revoke access in your account settings if needed");
  log.divider();
}

async function main() {
  const platformsData = loadPlatformsConfig();

  PROVIDER = process.argv[2];
  SERVICE = process.argv[3];

  if (!PROVIDER || !SERVICE) {
    console.clear();
    log.title("USAGE");
    log.divider();
    log.info("node auth.js <provider> <service>");
    log.divider();
    log.info("Examples:");
    log.info("  node auth.js google gmail");
    log.info("  node auth.js google drive");
    log.info("  node auth.js jira jira");
    log.info("  node auth.js notion notion");
    log.divider();
    log.info("Available Providers & Services:");
    Object.entries(platformsData).forEach(([provider, config]) => {
      const services = Object.keys(config.services).join(", ");
      log.info(`  ${provider}: ${services}`);
    });
    log.divider();
    process.exit(1);
  }

  try {
    [PROVIDER_CONFIG, SERVICE_CONFIG, CLIENT_CONFIG] = validateAndLoadConfig(platformsData, PROVIDER, SERVICE);
    checkClientConfig();
    showBanner();
    await displayAuthInfo();
    const credentials = await performAuthentication();
    const outputPath = saveCredentials(credentials);
    const profile = await testCredentials(credentials);
    displayResults(profile, outputPath);
    log.success("Authentication process completed successfully!");
  } catch (error) {
    log.divider();
    log.error("Authentication process failed!");
    log.error(`Error: ${error.message}`);
    log.divider();
    log.title("TROUBLESHOOTING:");
    log.info("• Update platforms.json with your OAuth credentials");
    log.info("• Check your internet connection");
    log.info("• Verify credentials are correct");
    log.info("• Try running the authentication again");
    log.divider();
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  log.warning("\nAuthentication cancelled by user");
  process.exit(0);
});

main();
