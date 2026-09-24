// 在 App 內建的執行環境（Electron 以 ELECTRON_RUN_AS_NODE 當 Node 用）執行 wrangler。
// wrangler 的參數解析（yargs）偵測到 Electron 時，會以為是「打包好的 Electron App」而少切一段 argv，
// 把腳本路徑當成指令參數，導致 login、whoami、deploy 全部失敗。這裡標記 defaultApp 並讓 wrangler 成為主模組。
// 用法：<App 執行檔> wrangler-launch.cjs <wrangler cli.js> <wrangler 參數…>
if (require.main === module) {
  const cli = process.argv[2];
  if (typeof cli !== 'string' || !cli.endsWith('cli.js')) { process.stderr.write('wrangler-launch: missing wrangler cli path\n'); process.exit(2); }
  process.defaultApp = true;
  process.argv.splice(1, 2, cli);
  require('node:module').runMain();
}
const path = require('node:path');
const LAUNCHER = __filename;
// 回傳要交給 process.execPath 的參數。
const wranglerArgs = (cliPath, args) => [LAUNCHER, cliPath, ...args];
module.exports = { wranglerArgs, LAUNCHER, defaultCli: () => path.resolve(__dirname, '../../../node_modules/wrangler/wrangler-dist/cli.js') };
