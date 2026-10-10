// SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import {createRoot} from 'react-dom/client';
import Panel from './Panel';
import TaskWindow from './TaskWindow';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{location.pathname==='/dashboard'?<><a className="tw-legacy-return" href="/">← 返回任务窗口</a><Panel/></>:<TaskWindow/>}</React.StrictMode>);
