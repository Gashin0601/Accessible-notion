/** Extension marker attribute for elements modified by this extension */
export const EXTENSION_ATTR = 'data-accessible-notion';

/** Extension marker for live region */
export const LIVE_REGION_ATTR = 'data-accessible-notion-live';

/** Log prefix */
export const LOG_PREFIX = '[AccessibleNotion]';

/** Default settings */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  screenReader: 'nvda',
  verbosity: 'standard',
  features: {
    sidebarTree: true,
    blockNavigation: true,
    contentEditableEnhance: true,
    dbTableGrid: true,
    liveAnnouncer: true,
    searchDialog: true,
    comments: true,
  },
  shortcuts: {
    focusSidebar: 'Alt+Shift+S',
    focusMain: 'Alt+Shift+M',
    focusHeader: 'Alt+Shift+H',
    announceBlock: 'Alt+Shift+B',
    headingOutline: 'Alt+Shift+T',
    nextBlock: 'Alt+Shift+N',
    prevBlock: 'Alt+Shift+P',
    nextHeading: 'Alt+Shift+J',
    prevHeading: 'Alt+Shift+K',
    nextH1: 'Alt+Shift+1',
    nextH2: 'Alt+Shift+2',
    nextH3: 'Alt+Shift+3',
    firstBlock: 'Alt+Shift+Home',
    lastBlock: 'Alt+Shift+End',
    dbGridMode: 'Alt+Shift+D',
    blockActionMenu: 'Alt+Shift+A',
    landmarkList: 'Alt+Shift+L',
    help: 'Alt+Shift+/',
  },
  debugMode: false,
};

export interface ExtensionSettings {
  enabled: boolean;
  screenReader: 'nvda' | 'jaws' | 'voiceover' | 'other';
  verbosity: 'minimal' | 'standard' | 'verbose';
  features: {
    sidebarTree: boolean;
    blockNavigation: boolean;
    contentEditableEnhance: boolean;
    dbTableGrid: boolean;
    liveAnnouncer: boolean;
    searchDialog: boolean;
    comments: boolean;
  };
  shortcuts: Record<string, string>;
  debugMode: boolean;
}
