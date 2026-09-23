import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [executable,icon,version,toolDirectory]=process.argv.slice(2);
if(process.platform!=='win32')throw Error('Windows resource editing requires a native Windows build host');
if(!executable||!icon||!/^\d+\.\d+\.\d+$/.test(version)||!toolDirectory)throw Error('Invalid Windows icon arguments');
const {rcedit}=await import(pathToFileURL(path.join(toolDirectory,'node_modules/rcedit/lib/index.js')).href);
await rcedit(executable,{icon,'file-version':version,'product-version':version,'version-string':{ProductName:'Travel Planner',FileDescription:'Travel Planner desktop application',OriginalFilename:'Travel Planner.exe'},'requested-execution-level':'asInvoker'});
