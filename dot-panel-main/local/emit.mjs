#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import {appendEvent} from './events.mjs';
let input = '';
for await (const chunk of process.stdin) {input += chunk;if(input.length>65536){console.error('Input exceeds 64 KiB');process.exit(1);}}
try {console.log(JSON.stringify(await appendEvent(JSON.parse(input))));}
catch (error) {console.error(error.message); process.exitCode=1;}
