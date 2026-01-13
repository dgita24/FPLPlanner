// ui.js - Entry point that consolidates and exports functions from modules
// This file now acts as the main orchestrator, importing and re-exporting functionality from specialized modules

// Import all the modularized components
import { initUI } from './ui-init.js';
import { toggleSidebarMenu } from './ui-sidebar.js';

// Re-export initUI as the main entry point
export { initUI };

// Expose toggleSidebarMenu to window for inline onclick handlers
window.toggleSidebarMenu = toggleSidebarMenu;


