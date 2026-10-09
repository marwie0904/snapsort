import { SnapsortApi } from '@snapsort/contract';

declare global {
  interface Window {
    snapsort: SnapsortApi;
  }
}
