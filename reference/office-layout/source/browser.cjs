const fs = require("node:fs");
const { chromium } = require("playwright-core");

// Use the platform's installed dependency and a local Chrome/Chromium browser.
// The original prototype depended on a deleted /tmp tool directory.
function launchBrowser(options = {}) {
  const paths = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  ];
  const executablePath = paths.find((file) => file && fs.existsSync(file));
  if (!executablePath) throw new Error("Install Chrome/Chromium or set CHROME_PATH to its executable.");
  return chromium.launch({
    ...options,
    executablePath,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", ...(options.args || [])],
  });
}

module.exports = { launchBrowser };
