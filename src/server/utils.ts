import os from "node:os";
import type { NetworkInterface } from "../types.js";

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function getLocalIPs(): NetworkInterface[] {
  const nets = os.networkInterfaces();
  const ips: NetworkInterface[] = [];

  for (const name of Object.keys(nets)) {
    const netArray = nets[name];
    if (!netArray) continue;

    for (const net of netArray) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push({
          interface: name,
          address: net.address,
          primary: name.includes("en0") || name.includes("eth0") || name.includes("wlan"),
        });
      }
    }
  }

  return ips;
}

export function displayStartupInfo(PORT: number): void {
  const ips = getLocalIPs();
  const platform = os.platform();

  print(`\n🚀 lan chat server started on port ${PORT}!\n`);

  if (ips.length === 0) {
    print("⚠️  server only accessible via localhost");
    print(`   local: http://localhost:${PORT}\n`);
    return;
  }

  print("🌐 lan connection points:");
  ips.forEach((ip) => {
    const primary = ip.primary ? " (primary)" : "";
    print(`   ${ip.interface}${primary}: http://${ip.address}:${PORT}`);
  });

  print(`\n🔥 firewall: allow port ${PORT}`);

  const commands = {
    darwin: `System Preferences > Security & Privacy > Firewall`,
    linux: `sudo ufw allow ${PORT}/tcp`,
    win32: `Windows Defender > Advanced Settings > Inbound Rule > Port ${PORT}`,
  };

  if (commands[platform as keyof typeof commands]) {
    print(`   ${commands[platform as keyof typeof commands]}`);
  }

  const primaryIP = ips.find((ip) => ip.primary) || ips[0];
  print(`\n📊 APIs: http://localhost:${PORT}/api/stats`);
  if (primaryIP) {
    print(`        http://${primaryIP.address}:${PORT}/api/stats`);
  }

  print(`\n💡 test: netstat -ln | grep ${PORT}`);
  print("🎉 ready for connections!\n");
}


export const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
} as const;

export type ColorKey = keyof typeof Colors;

/**
 * Prints a colored log message to the console using ANSI escape codes.
 * 
 * @param message - The message to print
 * @param color - The color to apply (defaults to 'reset' for no color)
 * @param background - Optional background color to apply
 * 
 * @example
 * ```typescript
 * print("Success!", "green");
 * print("Error occurred", "red", "bgYellow");
 * print("Info message", "cyan");
 * ```
 */
export function print(
  message: string,
  color: ColorKey = 'reset',
  background?: ColorKey
): void {
  const colorCode = Colors[color];
  const bgCode = background ? Colors[background] : '';
  const resetCode = Colors.reset;

  console.log(`${colorCode}${bgCode}${message}${resetCode}`);
}