/// <reference types="vite/client" />
import type { SnapsortApi } from '@snapsort/contract';

declare global {
  interface Window {
    snapsort?: SnapsortApi;
  }
}
