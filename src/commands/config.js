const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const os = require('os');

const CONFIG_FILE = '.shpckrc.json';

const DEFAULT_CONFIG = {
  image: {
    quality: 85,
    format: 'auto',
    progressive: true,
    optimization: true
  },
  video: {
    codec: 'h264',
    quality: 'medium',
    audio: 'aac',
    preset: 'fast'
  },
  output: {
    suffix: '_compressed',
    overwrite: false,
    preserveStructure: true
  },
  performance: {
    parallel: 4,
    maxMemory: '1GB'
  },
  advanced: {
    logLevel: 'info',
    showProgress: true,
    colorOutput: true
  }
};

async function configCommand(options) {
  try {
    if (options.init) {
      await initializeConfig();
    } else if (options.show) {
      await showConfig();
    } else if (options.set) {
      await setConfigValue(options.set);
    } else {
      await interactiveConfig();
    }
  } catch (error) {
    console.error(chalk.red(`Config error: ${error.message}`));
    process.exit(1);
  }
}

async function initializeConfig() {
  const configPath = await getConfigPath();
  
  try {
    if (await fileExists(configPath)) {
      console.log(chalk.yellow(`Configuration file already exists at: ${configPath}`));
      console.log(chalk.gray('Use --show to view current configuration or manually edit the file.'));
      return;
    }
    
    await fs.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    
    console.log(chalk.green('✓ Configuration file created successfully!'));
    console.log(chalk.cyan(`📍 Location: ${configPath}`));
    console.log(chalk.gray('\nYou can now customize the settings by editing the file or using:'));
    console.log(chalk.gray('  shpck config --set key=value'));
    
  } catch (error) {
    throw new Error(`Failed to create configuration file: ${error.message}`);
  }
}

async function showConfig() {
  const config = await loadConfig();
  
  console.log(chalk.cyan('📋 Current Configuration\n'));
  
  displayConfigSection('🖼️  Image Settings', config.image);
  displayConfigSection('🎥 Video Settings', config.video);
  displayConfigSection('📁 Output Settings', config.output);
  displayConfigSection('⚡ Performance Settings', config.performance);
  displayConfigSection('🔧 Advanced Settings', config.advanced);
  
  const configPath = await getConfigPath();
  console.log(chalk.gray(`\n📍 Config file: ${configPath}`));
}

function displayConfigSection(title, section) {
  console.log(chalk.bold(title));
  
  for (const [key, value] of Object.entries(section)) {
    const formattedKey = key.padEnd(15);
    const formattedValue = typeof value === 'boolean' 
      ? (value ? chalk.green('enabled') : chalk.red('disabled'))
      : chalk.cyan(value);
    
    console.log(`  ${formattedKey} ${formattedValue}`);
  }
  
  console.log();
}

async function setConfigValue(keyValue) {
  const [keyPath, value] = keyValue.split('=');
  
  if (!keyPath || value === undefined) {
    throw new Error('Invalid format. Use: key=value or section.key=value');
  }
  
  const config = await loadConfig();
  
  const keys = keyPath.split('.');
  
  if (keys.length === 1) {
    if (config.hasOwnProperty(keys[0])) {
      config[keys[0]] = parseValue(value);
    } else {
      throw new Error(`Unknown configuration key: ${keys[0]}`);
    }
  } else if (keys.length === 2) {
    const [section, key] = keys;
    
    if (config[section] && config[section].hasOwnProperty(key)) {
      config[section][key] = parseValue(value);
    } else {
      throw new Error(`Unknown configuration key: ${keyPath}`);
    }
  } else {
    throw new Error('Configuration key path too deep. Maximum depth is 2 levels.');
  }
  
  await saveConfig(config);
  
  console.log(chalk.green(`✓ Configuration updated: ${keyPath} = ${value}`));
}

async function interactiveConfig() {
  console.log(chalk.cyan('🔧 SHPCK Configuration Manager\n'));
  console.log('Available commands:');
  console.log('  --init        Initialize default configuration');
  console.log('  --show        Show current configuration');
  console.log('  --set key=val Set configuration value');
  
  console.log(chalk.yellow('\nExample usage:'));
  console.log('  shpck config --init');
  console.log('  shpck config --show');
  console.log('  shpck config --set image.quality=90');
  console.log('  shpck config --set video.codec=h265');
}

async function loadConfig() {
  const configPath = await getConfigPath();
  
  try {
    if (await fileExists(configPath)) {
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      return mergeWithDefaults(config);
    } else {
      return DEFAULT_CONFIG;
    }
  } catch (error) {
    console.log(chalk.yellow(`Warning: Could not load config file, using defaults: ${error.message}`));
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(config) {
  const configPath = await getConfigPath();
  
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

async function getConfigPath() {
  const localConfig = path.join(process.cwd(), CONFIG_FILE);
  const homeConfig = path.join(os.homedir(), CONFIG_FILE);
  
  if (await fileExists(localConfig)) {
    return localConfig;
  }
  
  return homeConfig;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseValue(value) {
  // Try to parse as number
  if (!isNaN(value) && !isNaN(parseFloat(value))) {
    return parseFloat(value);
  }
  
  // Try to parse as boolean
  if (value.toLowerCase() === 'true') {
    return true;
  }
  if (value.toLowerCase() === 'false') {
    return false;
  }
  
  // Return as string
  return value;
}

function mergeWithDefaults(config) {
  const merged = { ...DEFAULT_CONFIG };
  
  for (const [section, values] of Object.entries(config)) {
    if (merged[section] && typeof values === 'object') {
      merged[section] = { ...merged[section], ...values };
    } else {
      merged[section] = values;
    }
  }
  
  return merged;
}

// Export for use by other modules
async function getConfig() {
  return await loadConfig();
}

module.exports = { 
  configCommand,
  getConfig,
  DEFAULT_CONFIG
}; 