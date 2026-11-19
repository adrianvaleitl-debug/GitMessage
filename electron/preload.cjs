const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("gitmessage", Object.freeze({ platform: process.platform, desktop: true }));