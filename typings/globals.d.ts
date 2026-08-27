declare const Zotero: any;
declare const Services: any;
declare const Cc: any;
declare const Ci: any;
declare const ChromeUtils: any;

interface Window {
  arguments?: any;
  ZoteroPane?: any;
  MozXULElement?: { insertFTLIfNeeded?: (resource: string) => void };
  openDialog(url?: string, target?: string, features?: string, ...args: any[]): Window;
}

interface Document {
  createXULElement(tagName: string): Element;
}
