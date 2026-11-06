/**
 * Import this at the top of server-only modules. It throws if the module is ever evaluated in a browser,
 * and unlike the `server-only` package it works in scripts and tests.
 */
if (typeof window !== "undefined") {
  throw new Error("This module is server-only and must not be imported from client components.");
}

export {};
