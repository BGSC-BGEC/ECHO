import { NativeModule, requireOptionalNativeModule } from 'expo';
import fallback from './EchoBleModule.web';

export type BleState = 'unsupported' | 'location' | 'unauthorized' | 'off' | 'on';

declare class EchoBleModule extends NativeModule<{}> {
  state(): BleState;
  canAdvertise(): boolean;
  startAdvertising(id: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  scan(ms: number): Promise<{ id: string; rssi: number }[]>;
}

// Optional: an app build from before this module existed must still start (Slash just reports 'unsupported').
export default requireOptionalNativeModule<EchoBleModule>('EchoBle') ?? fallback;
