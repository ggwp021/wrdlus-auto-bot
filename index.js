import axios from 'axios';
import cfonts from 'cfonts';
import gradient from 'gradient-string';
import chalk from 'chalk';
import fs from 'fs/promises';
import readline from 'readline';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import ora from 'ora';
import { ethers } from 'ethers';

const logger = {
  info: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || 'ℹ️  ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.green('INFO');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  warn: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '⚠️ ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.yellow('WARN');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  error: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '❌ ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.red('ERROR');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  debug: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '🔍  ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.blue('DEBUG');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  }
};

function delay(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function centerText(text, width) {
  const cleanText = stripAnsi(text);
  const textLength = cleanText.length;
  const totalPadding = Math.max(0, width - textLength);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return `${' '.repeat(leftPadding)}${text}${' '.repeat(rightPadding)}`;
}

function printHeader(title) {
  const width = 80;
  console.log(gradient.morning(`┬${'─'.repeat(width - 2)}┬`));
  console.log(gradient.morning(`│ ${title.padEnd(width - 4)} │`));
  console.log(gradient.morning(`┴${'─'.repeat(width - 2)}┴`));
}

function printInfo(label, value, context) {
  logger.info(`${label.padEnd(15)}: ${chalk.cyan(value)}`, { emoji: '📍 ', context });
}

function printProfileInfo(address, points, context) {
  printHeader(`Profile Info ${context}`);
  printInfo('Address', address || 'N/A', context);
  printInfo('Total Points', points.toString(), context);
  console.log('\n');
}

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/102.0'
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getAxiosConfig(proxy, additionalHeaders = {}) {
  const headers = {
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8,id;q=0.7,fr;q=0.6,ru;q=0.5,zh-CN;q=0.4,zh;q=0.3',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'referer': 'https://rewards.wandrlust.io/airdrop',
    'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Opera";v="124"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': getRandomUserAgent(),
    ...additionalHeaders
  };
  const config = {
    headers,
    timeout: 60000
  };
  if (proxy) {
    config.httpsAgent = newAgent(proxy);
    config.proxy = false;
  }
  return config;
}

function newAgent(proxy) {
  if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
    return new HttpsProxyAgent(proxy);
  } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
    return new SocksProxyAgent(proxy);
  } else {
    logger.warn(`Unsupported proxy: ${proxy}`);
    return null;
  }
}

async function requestWithRetry(method, url, payload = null, config = {}, retries = 3, backoff = 2000, context) {
  for (let i = 0; i < retries; i++) {
    try {
      let response;
      if (method.toLowerCase() === 'get') {
        response = await axios.get(url, config);
      } else if (method.toLowerCase() === 'post') {
        response = await axios.post(url, payload, config);
      } else {
        throw new Error(`Method ${method} not supported`);
      }
      return response;
    } catch (error) {
      if (error.response && error.response.status >= 500 && i < retries - 1) {
        logger.warn(`Retrying ${method.toUpperCase()} ${url} (${i + 1}/${retries}) due to server error`, { emoji: '🔄', context });
        await delay(backoff / 1000);
        backoff *= 1.5;
        continue;
      }
      if (i < retries - 1) {
        logger.warn(`Retrying ${method.toUpperCase()} ${url} (${i + 1}/${retries})`, { emoji: '🔄', context });
        await delay(backoff / 1000);
        backoff *= 1.5;
        continue;
      }
      throw error;
    }
  }
}

async function readPrivateKeys() {
  try {
    const data = await fs.readFile('pk.txt', 'utf-8');
    const privateKeys = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (privateKeys.length === 0) {
      throw new Error('No private keys found in pk.txt');
    }
    logger.info(`Loaded ${privateKeys.length} private key${privateKeys.length === 1 ? '' : 's'}`, { emoji: '🔑 ' });
    return privateKeys.map(pk => ({ privateKey: pk }));
  } catch (error) {
    logger.error(`Failed to read pk.txt: ${error.message}`, { emoji: '❌ ' });
    return [];
  }
}

async function readProxies() {
  try {
    const data = await fs.readFile('proxy.txt', 'utf-8');
    const proxies = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (proxies.length === 0) {
      logger.warn('No proxies found. Proceeding without proxy.', { emoji: '⚠️ ' });
    } else {
      logger.info(`Loaded ${proxies.length} prox${proxies.length === 1 ? 'y' : 'ies'}`, { emoji: '🌐 ' });
    }
    return proxies;
  } catch (error) {
    logger.warn('proxy.txt not found.', { emoji: '⚠️ ' });
    return [];
  }
}

function maskAddress(address) {
  return address ? `${address.slice(0, 6)}${'*'.repeat(6)}${address.slice(-6)}` : 'N/A';
}

function deriveWalletAddress(privateKey) {
  try {
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
  } catch (error) {
    logger.error(`Failed to derive address: ${error.message}`);
    return null;
  }
}

async function createSignedPayload(privateKey, address, nonce) {
  try {
    const wallet = new ethers.Wallet(privateKey);
    const issuedAt = new Date().toISOString();
    const messageObj = {
      domain: "rewards.wandrlust.io",
      address: address,
      statement: "Sign in to the app. Powered by Snag Solutions.",
      uri: "https://rewards.wandrlust.io",
      version: "1",
      chainId: 1,
      nonce: nonce,
      issuedAt: issuedAt
    };
    const rawMessage = JSON.stringify(messageObj, null, 0);

    const fullMessage = `rewards.wandrlust.io wants you to sign in with your Ethereum account:\n` +
      `${address}\n\n` +
      `Sign in to the app. Powered by Snag Solutions.\n\n` +
      `URI: https://rewards.wandrlust.io\n` +
      `Version: 1\n` +
      `Chain ID: 1\n` +
      `Nonce: ${nonce}\n` +
      `Issued At: ${issuedAt}`;

    const signedMessage = await wallet.signMessage(fullMessage);

    return {
      message: rawMessage,
      accessToken: signedMessage,
      signature: signedMessage,
      walletConnectorName: "MetaMask",
      walletAddress: address,
      redirect: "false",
      callbackUrl: "/protected",
      chainType: "evm",
      walletProvider: "undefined",
      csrfToken: nonce,
      json: "true"
    };
  } catch (error) {
    throw new Error(`Failed to create signed payload: ${error.message}`);
  }
}

async function fetchNonce(address, proxy, context, refCode = 'M648SLT2') {
  const url = 'https://rewards.wandrlust.io/api/auth/csrf';
  const config = getAxiosConfig(proxy, {
    'Content-Type': 'application/json',
    'Cookie': `referral_code=${refCode}`
  });
  const spinner = ora({ text: 'Fetching nonce...', spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('get', url, null, config, 3, 2000, context);
    spinner.stop();
    if (response.data.csrfToken) {
      return { csrfToken: response.data.csrfToken, setCookie: response.headers['set-cookie'] || [] };
    } else {
      throw new Error('Failed to fetch nonce');
    }
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to fetch nonce: ${error.message}`));
    return null;
  }
}

async function executeLogin(privateKey, address, nonce, proxy, context, cookies) {
  const url = 'https://rewards.wandrlust.io/api/auth/callback/credentials';
  const payload = await createSignedPayload(privateKey, address, nonce);
  const config = getAxiosConfig(proxy, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': cookies.join('; ')
  });
  const spinner = ora({ text: 'Executing login...', spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('post', url, new URLSearchParams(payload).toString(), config, 3, 2000, context);
    spinner.stop();
    const sessionCookies = response.headers['set-cookie'] || [];
    const hasSession = sessionCookies.some(ck => ck.includes('__Secure-next-auth.session-token='));
    if (hasSession) {
      return { success: true, sessionCookies };
    } else {
      throw new Error('Login failed');
    }
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to execute login: ${error.message}`));
    return null;
  }
}

async function retrieveBalance(address, proxy, context, cookies, webId = 'ab969dcc-ac68-4729-a576-652e1b3ece98', orgId = '74495128-d214-4056-bb05-baa8e5b2c639') {
  const url = `https://rewards.wandrlust.io/api/loyalty/accounts?limit=100&websiteId=${webId}&organizationId=${orgId}&walletAddress=${address}`;
  const config = getAxiosConfig(proxy, { 'Cookie': cookies.join('; ') });
  const spinner = ora({ text: 'Retrieving balance...', spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('get', url, null, config, 3, 2000, context);
    spinner.stop();
    if (response.data.data && response.data.data.length > 0) {
      const amount = response.data.data[0].amount || 0;
      if (amount === 0) {
        logger.warn('Balance retrieved but amount is 0. Possible server delay or account issue.', { emoji: '⚠️ ', context });
      }
      return amount;
    } else {
      logger.warn('No balance data found.', { emoji: '⚠️ ', context });
      return 0;
    }
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to retrieve balance: ${error.message}`));
    return null;
  }
}

async function executeDailyCheckin(address, proxy, context, cookies) {
  const url = 'https://rewards.wandrlust.io/api/loyalty/rules/7ee60bbe-7de9-48f2-83be-6dfe10752d6d/complete';
  const config = getAxiosConfig(proxy, {
    'Content-Type': 'application/json',
    'Content-Length': '2',
    'Cookie': cookies.join('; ')
  });
  config.validateStatus = (status) => status >= 200 && status < 500;
  const spinner = ora({ text: 'Executing daily check-in...', spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('post', url, {}, config, 3, 2000, context);
    if (response.status === 400) {
      spinner.warn(chalk.bold.yellowBright(` ${response.data.message || 'Already checked in today'}`));
      return { success: false, message: response.data.message || 'Already claimed' };
    }
    spinner.succeed(chalk.bold.greenBright(` Check-In Successfully!`));
    return { success: true };
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to execute check-in: ${error.message}`));
    return null;
  }
}

async function getPublicIP(proxy, context) {
  try {
    const config = getAxiosConfig(proxy);
    const response = await requestWithRetry('get', 'https://api.ipify.org?format=json', null, config, 3, 2000, context);
    return response.data.ip || 'Unknown';
  } catch (error) {
    logger.error(`Failed to get IP: ${error.message}`, { emoji: '❌ ', context });
    return 'Error retrieving IP';
  }
}

async function processAccount(account, index, total, proxy) {
  const context = `Account ${index + 1}/${total}`;
  logger.info(chalk.bold.magentaBright(`Starting account processing`), { emoji: '🚀 ', context });

  const { privateKey } = account;
  const address = deriveWalletAddress(privateKey);
  if (!address) {
    logger.error('Invalid private key', { emoji: '❌ ', context });
    return;
  }

  printHeader(`Account Info ${context}`);
  printInfo('Wallet Address', maskAddress(address), context);
  const ip = await getPublicIP(proxy, context);
  printInfo('IP', ip, context);
  console.log('\n');

  try {
    logger.info('Starting authentication process...', { emoji: '🔐 ', context });
    const nonceData = await fetchNonce(address, proxy, context);
    if (!nonceData) return;

    let currentCookies = [`referral_code=9Q2VQC2L`, ...nonceData.setCookie.map(ck => ck.split('; ')[0])];

    const loginResult = await executeLogin(privateKey, address, nonceData.csrfToken, proxy, context, currentCookies);
    if (!loginResult) return;

    currentCookies = [...currentCookies, ...loginResult.sessionCookies.map(ck => ck.split('; ')[0])];

    logger.info(chalk.bold.greenBright(` Login successful`), { emoji: '✅ ', context });

    const initialPoints = await retrieveBalance(address, proxy, context, currentCookies);

    console.log('\n');

    logger.info('Starting Checkin Process...', { emoji: '🛎️ ', context });
    const checkinResult = await executeDailyCheckin(address, proxy, context, currentCookies);

    if (checkinResult && checkinResult.success) {
      await delay(15); 
      const finalPoints = await retrieveBalance(address, proxy, context, currentCookies);
      printProfileInfo(address, finalPoints || 0, context);
    } else {
      await delay(3);
      printProfileInfo(address, initialPoints || 0, context);
    }

    logger.info(chalk.bold.greenBright(`Completed account processing`), { emoji: '🎉 ', context });
    console.log(chalk.cyanBright('________________________________________________________________________________'));
  } catch (error) {
    logger.error(`Error processing account: ${error.message}`, { emoji: '❌ ', context });
  }
}

let globalUseProxy = false;
let globalProxies = [];

async function initializeConfig() {
  const useProxyAns = await askQuestion(chalk.cyanBright('🔌 Do You Want to Use Proxy? (y/n): '));
  if (useProxyAns.trim().toLowerCase() === 'y') {
    globalUseProxy = true;
    globalProxies = await readProxies();
    if (globalProxies.length === 0) {
      globalUseProxy = false;
      logger.warn('No proxies available, proceeding without proxy.', { emoji: '⚠️ ' });
    }
  } else {
    logger.info('Proceeding without proxy.', { emoji: 'ℹ️ ' });
  }
}

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function runCycle() {
  const accounts = await readPrivateKeys();
  if (accounts.length === 0) {
    logger.error('No private keys found in pk.txt. Exiting cycle.', { emoji: '❌ ' });
    return;
  }

  for (let i = 0; i < accounts.length; i++) {
    const proxy = globalUseProxy ? globalProxies[i % globalProxies.length] : null;
    try {
      await processAccount(accounts[i], i, accounts.length, proxy);
    } catch (error) {
      logger.error(`Error processing account: ${error.message}`, { emoji: '❌ ', context: `Account ${i + 1}/${accounts.length}` });
    }
    if (i < accounts.length - 1) {
      console.log('\n\n');
    }
    await delay(5);
  }
}

async function run() {
  const terminalWidth = process.stdout.columns || 80;
  cfonts.say('Modified by BBC WYK', {
    font: 'block',
    align: 'center',
    colors: ['cyan', 'magenta'],
    background: 'transparent',
    letterSpacing: 1,
    lineHeight: 1,
    space: true
  });
  console.log(gradient.retro(centerText('=== Telegram Channel 🥷 Burma BlockChain ===', terminalWidth)));
  console.log(gradient.retro(centerText('✪ BOT WANDRLust AUTO DAILY CHECK-IN ✪', terminalWidth)));
  console.log('\n');
  await initializeConfig();

  while (true) {
    await runCycle();
    console.log();
    logger.info(chalk.bold.yellowBright('Cycle completed. Waiting 24 hours...'), { emoji: '🔄 ' });
    await delay(86400);
  }
}

run().catch(error => logger.error(`Fatal error: ${error.message}`, { emoji: '❌' }));
